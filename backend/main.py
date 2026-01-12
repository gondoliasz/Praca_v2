from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
import uuid
import unicodedata
from . import r_interface
import json
import chardet
import csv
import base64
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PLOTS_DIR = os.path.join(BASE_DIR, "plots")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PLOTS_DIR, exist_ok=True)

app = FastAPI(title="Dependency Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _safe_name(s: str) -> str:
    nk = unicodedata.normalize("NFKD", s)
    return nk.encode("ASCII", "ignore").decode("ASCII")


def _normalize_encoding(enc: str):
    if not enc:
        return enc
    e = enc.lower()
    if e.startswith("windows-"):
        e = e.replace("windows-", "cp")
    if e in ("iso-8859-1", "latin1"):
        return "latin1"
    if e.startswith("utf-8"):
        return "utf-8"
    return e


def _guess_delimiter_from_text(text: str):
    try:
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(text, delimiters=[',', ';', '\t', '|'])
        return dialect.delimiter
    except Exception:
        pass
    lines = text.splitlines()
    if not lines:
        return ","
    header = lines[0]
    candidates = [',', ';', '\t', '|']
    counts = {c: header.count(c) for c in candidates}
    best = max(counts.items(), key=lambda kv: kv[1])
    return best[0] if best[1] > 0 else ','


def _detect_encoding_and_columns(path: str):
    with open(path, "rb") as f:
        sample_bytes = f.read(200000)
    det = chardet.detect(sample_bytes)
    enc = _normalize_encoding(det.get("encoding") or "")
    try:
        decoded = sample_bytes.decode(enc, errors='replace') if enc else sample_bytes.decode('utf-8', errors='replace')
    except Exception:
        decoded = sample_bytes.decode('utf-8', errors='replace')
    delimiter = _guess_delimiter_from_text(decoded)

    tried = []
    enc_candidates = []
    if enc:
        enc_candidates.append(enc)
    enc_candidates += ["utf-8", "cp1250", "latin1", "iso-8859-2", "utf-16"]

    last_exception = None
    for e in enc_candidates:
        if e in tried:
            continue
        tried.append(e)
        try:
            df = pd.read_csv(path, nrows=1000, encoding=e, sep=delimiter, engine="python")
            cols = []
            for c in df.columns.tolist():
                is_num = pd.api.types.is_numeric_dtype(df[c])
                typ = "mierzalne" if is_num else "niemierzalne"
                cols.append({
                    "name": c,
                    "display": c,
                    "safe_name": _safe_name(c),
                    "type": typ,
                    "is_numeric": bool(is_num),
                    "n_unique": int(df[c].nunique()) if df.shape[0] > 0 else 0
                })
            return e, delimiter, cols
        except Exception as ex:
            last_exception = ex
            continue

    try:
        df = pd.read_csv(path, nrows=1000, engine="python", sep=None)
        cols = []
        for c in df.columns.tolist():
            is_num = pd.api.types.is_numeric_dtype(df[c])
            typ = "mierzalne" if is_num else "niemierzalne"
            cols.append({
                "name": c,
                "display": c,
                "safe_name": _safe_name(c),
                "type": typ,
                "is_numeric": bool(is_num),
                "n_unique": int(df[c].nunique()) if df.shape[0] > 0 else 0
            })
        return "unknown", ",", cols
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Failed to read CSV header: {last_exception or ex}")


# small transparent 1x1 PNG used as fallback placeholder (base64)
TRANSPARENT_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Tylko pliki CSV są wspierane")
    file_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{file_id}.csv")
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    encoding, delimiter, cols = _detect_encoding_and_columns(path)
    meta = {"file_id": file_id, "filename": file.filename, "encoding": encoding, "delimiter": delimiter}
    meta_path = os.path.join(UPLOAD_DIR, f"{file_id}.meta.json")
    with open(meta_path, "w", encoding="utf-8") as mf:
        json.dump(meta, mf, ensure_ascii=False)
    try:
        rows = int(pd.read_csv(path, encoding=encoding, sep=delimiter, engine="python").shape[0])
    except Exception:
        rows = -1
    return {"file_id": file_id, "columns": cols, "rows": rows, "encoding": encoding, "delimiter": delimiter}


@app.post("/analyze")
async def analyze(payload: dict):
    try:
        print(f"[main.analyze] payload: {payload}")
    except Exception:
        pass

    file_id = payload.get("file_id")
    x = payload.get("x")
    y = payload.get("y")
    if not file_id or (x is None) or (y is None):
        raise HTTPException(status_code=400, detail="file_id, x i y są wymagane")
    csv_path = os.path.join(UPLOAD_DIR, f"{file_id}.csv")
    meta_path = os.path.join(UPLOAD_DIR, f"{file_id}.meta.json")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Zestaw danych nie znaleziony")
    encoding = None
    delimiter = None
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as mf:
                meta = json.load(mf)
                encoding = meta.get("encoding")
                delimiter = meta.get("delimiter")
        except Exception:
            encoding = None
            delimiter = None

    # find headers (try a few encodings)
    try:
        headers = None
        enc_to_try = []
        if encoding:
            enc_to_try.append(encoding)
        enc_to_try += ["utf-8", "cp1250", "latin1", "iso-8859-2", "utf-16"]

        used_enc_for_header = None
        for e in enc_to_try:
            try:
                df_header = pd.read_csv(csv_path, nrows=0, encoding=e, sep=delimiter or None, engine="python")
                headers = list(df_header.columns)
                used_enc_for_header = e
                break
            except Exception:
                continue

        if headers is None:
            # fallback: read first line as bytes
            with open(csv_path, "rb") as f:
                sample = f.read(2000)
            det = chardet.detect(sample) if chardet else {"encoding": None}
            enc_try = det.get("encoding") or "utf-8"
            text = sample.decode(enc_try, errors="replace")
            if delimiter:
                hdr_line = text.splitlines()[0]
                headers = hdr_line.split(delimiter)
            else:
                guessed = None
                for d in [",", ";", "\t", "|"]:
                    if d in text.splitlines()[0]:
                        guessed = d
                        break
                hdr_line = text.splitlines()[0]
                headers = hdr_line.split(guessed or ",")

        def _safe_name_local(s: str) -> str:
            nk = unicodedata.normalize("NFKD", s)
            return nk.encode("ASCII", "ignore").decode("ASCII")

        def resolve_col(sent):
            for h in headers:
                if h == sent:
                    return h
            for h in headers:
                if _safe_name_local(h) == str(sent):
                    return h
            for h in headers:
                if h.lower() == str(sent).lower():
                    return h
            return None

        actual_x = resolve_col(x)
        actual_y = resolve_col(y)
        if actual_x is None or actual_y is None:
            raise HTTPException(status_code=400, detail=f"Nie można znaleźć kolumn: {x}, {y}. Dostępne kolumny: {headers}")

        try:
            actual_x_index = headers.index(actual_x) + 1
            actual_y_index = headers.index(actual_y) + 1
        except Exception:
            actual_x_index = None
            actual_y_index = None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd odczytu nagłówka CSV: {e}")

    try:
        res = r_interface.run_analysis(csv_path, actual_x_index, actual_y_index, plots_dir=PLOTS_DIR, encoding=encoding, delimiter=delimiter)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("[main.analyze] Exception in run_analysis:\n", tb)
        raise HTTPException(status_code=500, detail={"error": str(e), "traceback": tb})

    # Always return a base64 image: real plot if available, else transparent placeholder
    plot_base64 = None
    if res.get("plot_path"):
        fname = res["plot_path"]
        full_path = os.path.join(PLOTS_DIR, fname)
        try:
            with open(full_path, "rb") as pf:
                plot_base64 = base64.b64encode(pf.read()).decode("ascii")
        except Exception:
            plot_base64 = TRANSPARENT_PNG_BASE64
    else:
        plot_base64 = TRANSPARENT_PNG_BASE64

    return {
        "recommended_test": res.get("recommended_test"),
        "stats": res.get("stats"),
        "plot_base64": plot_base64,
        "actual_x": actual_x,
        "actual_y": actual_y,
        "actual_x_index": actual_x_index,
        "actual_y_index": actual_y_index,
        "used_encoding": encoding,
        "used_delimiter": delimiter,
        "used_header_encoding": used_enc_for_header if 'used_enc_for_header' in locals() else None
    }