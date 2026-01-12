# Modified to ensure rpy2 conversion context is set in the thread where R is invoked.
import os
import re
import json
import tempfile
import io
import csv

# optional detector
try:
    import chardet
except Exception:
    chardet = None

# R-related objects will be initialized lazily to avoid import-time errors on Windows
_r_loaded = False
_r_run_analysis = None
_stat_script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "r_scripts", "stat_tests.R"))
_stat_script_mtime = None
_r_formals_names = None


def _ensure_r_loaded(force_reload: bool = False):
    global _r_loaded, _r_run_analysis, _stat_script_mtime, _r_formals_names
    try:
        from rpy2 import robjects
    except Exception as e:
        raise RuntimeError(f"Failed to import rpy2.robjects: {e}") from e

    if not os.path.exists(_stat_script_path):
        raise FileNotFoundError(f"R script not found: {_stat_script_path}")

    try:
        mtime = os.path.getmtime(_stat_script_path)
    except Exception:
        mtime = None

    need_source = False
    if not _r_loaded:
        need_source = True
    elif force_reload:
        need_source = True
    elif _stat_script_mtime is None:
        need_source = True
    elif mtime is not None and mtime != _stat_script_mtime:
        need_source = True

    if not need_source:
        return

    try:
        robjects.r['source'](_stat_script_path)
        env_names = list(robjects.globalenv.names)
        if 'run_analysis' in env_names:
            _r_run_analysis = robjects.globalenv['run_analysis']
            try:
                formals = robjects.r['formals'](_r_run_analysis)
                _r_formals_names = [str(n) for n in list(formals.names)] if formals.names is not None else []
            except Exception:
                _r_formals_names = []
        else:
            raise RuntimeError("R function 'run_analysis' not found in stat_tests.R after sourcing")
        _r_loaded = True
        _stat_script_mtime = mtime
    except Exception as e:
        raise RuntimeError(f"Failed to initialize R/rpy2 or source R script: {e}") from e


def _r_to_py(r_obj):
    try:
        from rpy2.robjects import conversion
        py = conversion.rpy2py(r_obj)
        def make_serializable(x):
            try:
                if x is None:
                    return None
                if isinstance(x, (str, int, float, bool)):
                    return x
                if isinstance(x, dict):
                    return {k: make_serializable(v) for k, v in x.items()}
                if isinstance(x, (list, tuple)):
                    return [make_serializable(v) for v in x]
                return str(x)
            except Exception:
                return str(x)
        return make_serializable(py)
    except Exception:
        try:
            return str(r_obj)
        except Exception:
            return None


def _clean_plot_path(raw):
    if raw is None:
        return ""
    if isinstance(raw, (list, tuple)) and len(raw) > 0:
        raw = raw[0]
    if not isinstance(raw, str):
        raw = str(raw)
    raw = re.sub(r'^\s*\[\d+\]\s*', '', raw)
    raw = raw.strip()
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1]
    return raw


def _write_meta_encoding_if_possible(csv_path: str, encoding: str, delimiter: str = None):
    """
    Update .meta.json only if present (safe), but caller decides WHEN to call.
    This helper remains but run_analysis will NOT call it to avoid overwriting meta during analyze.
    """
    try:
        base = os.path.splitext(csv_path)[0]
        meta_path = f"{base}.meta.json"
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
            except Exception:
                meta = {}
            meta["encoding"] = encoding
            if delimiter:
                meta["delimiter"] = delimiter
            with open(meta_path, "w", encoding="utf-8") as mf:
                json.dump(meta, mf, ensure_ascii=False)
    except Exception:
        pass


def _detect_encoding_bytes(raw_bytes: bytes):
    if chardet:
        try:
            det = chardet.detect(raw_bytes)
            enc = det.get("encoding")
            if enc:
                e = enc.lower()
                if e.startswith("windows-"):
                    e = e.replace("windows-", "cp")
                return e
        except Exception:
            pass
    return None


def _convert_to_comma_csv(src_path: str, src_encoding: str = None, src_delim: str = ','):
    """
    Robust conversion: try cp1250/iso-8859-2/latin1/utf-8 variants and fall back to latin1 forced.
    Returns (out_path, used_encoding)
    """
    with open(src_path, "rb") as rb:
        raw = rb.read()

    used_enc = None
    text = None

    # Try given encoding first
    if src_encoding:
        try:
            text = raw.decode(src_encoding)
            used_enc = src_encoding
        except Exception:
            text = None

    # Try chardet suggestion
    if text is None:
        det = _detect_encoding_bytes(raw)
        if det:
            try:
                text = raw.decode(det)
                used_enc = det
            except Exception:
                text = None

    # Try a prioritized list suitable for Central/Eastern Europe (Polish)
    if text is None:
        for e in ("cp1250", "iso-8859-2", "latin1", "utf-8", "utf-8-sig"):
            try:
                text = raw.decode(e)
                used_enc = e
                break
            except Exception:
                text = None
                continue

    # Last-resort: decode with latin1 to avoid decode errors (maps bytes 1:1)
    if text is None:
        try:
            text = raw.decode("latin1")
            used_enc = "latin1"
        except Exception:
            # final fallback: utf-8 with replacement
            text = raw.decode("utf-8", errors="replace")
            used_enc = "utf-8-replace"

    # Strip leading BOM (if any) so writing utf-8-sig produces exactly one BOM
    if text and text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")

    # Parse and write out as comma-separated UTF-8-with-BOM
    if not src_delim:
        src_delim = ','
    sio = io.StringIO(text)
    reader = csv.reader(sio, delimiter=src_delim)
    tmpf = tempfile.NamedTemporaryFile(prefix="conv_", suffix=".csv", delete=False)
    out_path = tmpf.name
    tmpf.close()
    with open(out_path, "w", encoding="utf-8-sig", newline='') as wf:
        writer = csv.writer(wf, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        for row in reader:
            writer.writerow(row)

    # Debug / diagnostic info
    try:
        first_bytes = open(out_path, "rb").read(200)
        det_out = chardet.detect(first_bytes) if chardet else {"encoding": None}
        print(f"[r_interface] converted tmp={out_path}, used_enc={used_enc}, out_head_bytes={first_bytes[:80]!r}, chardet_out={det_out}")
    except Exception:
        pass

    return out_path, used_enc


def _build_r_args(csv_path, x, y, plots_dir, enc, delimiter):
    global _r_formals_names
    # lazy import rpy2 rinterface to get NULL
    try:
        from rpy2.robjects import rinterface as _rinterface
    except Exception:
        _rinterface = None

    def _maybe_rnull(val):
        if val is None:
            return _rinterface.NULL if _rinterface is not None else None
        return val

    args = [csv_path, x, y]
    args.append(plots_dir)
    if _r_formals_names and 'encoding' in _r_formals_names:
        args.append(_maybe_rnull(enc if enc else None))
    if _r_formals_names and 'delimiter' in _r_formals_names:
        args.append(_maybe_rnull(delimiter if delimiter else None))
    return args


def run_analysis(csv_path: str, x: str, y: str, plots_dir: str = None, encoding: str = None, delimiter: str = None):
    _ensure_r_loaded()

    if plots_dir is None:
        plots_dir = os.path.join(os.path.dirname(csv_path), "plots")

    csv_to_pass = csv_path
    converted_tmp = None
    used_enc_for_tmp = None
    try:
        if (delimiter and delimiter != ',') or (encoding and encoding.lower() not in ("utf-8", "utf8")):
            try:
                converted_tmp, used_enc_for_tmp = _convert_to_comma_csv(csv_path, src_encoding=encoding, src_delim=delimiter or ',')
                csv_to_pass = converted_tmp
                encoding_for_r = "UTF-8"
                delimiter_for_r = ","
            except Exception:
                csv_to_pass = csv_path
                encoding_for_r = encoding
                delimiter_for_r = delimiter
        else:
            if encoding and encoding.lower() in ("utf-8", "utf8"):
                encoding_for_r = "UTF-8"
            else:
                encoding_for_r = encoding
            delimiter_for_r = delimiter
    except Exception:
        csv_to_pass = csv_path
        encoding_for_r = encoding
        delimiter_for_r = delimiter

    enc_candidates = []
    if encoding_for_r:
        enc_candidates.append(encoding_for_r)
    enc_candidates += ["UTF-8", "cp1250", "latin1", "iso-8859-2"]

    last_exc = None
    for enc in enc_candidates:
        try:
            _ensure_r_loaded()

            r_args = _build_r_args(csv_to_pass, x, y, plots_dir, enc if enc else None, delimiter_for_r if delimiter_for_r else None)

            try:
                print(f"[r_interface] calling R run_analysis with csv={r_args[0]}, x={r_args[1]}, y={r_args[2]}, plots_dir={r_args[3]}, encoding={enc}, delimiter={delimiter_for_r}")
            except Exception:
                pass

            # Use rpy2 localconverter context to ensure conversion rules are present in this thread.
            try:
                from rpy2.robjects.conversion import localconverter
                from rpy2.robjects import default_converter
                with localconverter(default_converter):
                    r_res = _r_run_analysis(*r_args)
                    py_res = _r_to_py(r_res)
            except Exception as conv_exc:
                # If localconverter approach fails, still try direct call (may raise as before).
                # We capture conv_exc for debugging if needed.
                try:
                    r_res = _r_run_analysis(*r_args)
                    py_res = _r_to_py(r_res)
                except Exception as e:
                    # prefer to raise the original conversion-related exception if applicable
                    raise conv_exc from e

            out = {"recommended_test": "", "stats": {}, "plot_path": ""}

            if isinstance(py_res, dict):
                out["recommended_test"] = str(py_res.get("recommended_test", "") or "")
                stats = py_res.get("stats", {})
                out["stats"] = stats if isinstance(stats, (dict, list, str, int, float, type(None))) else str(stats)
                raw_plot = py_res.get("plot_path", "")
                out["plot_path"] = _clean_plot_path(raw_plot)
            else:
                try:
                    recommended = None
                    stats = None
                    plot_path = None
                    try:
                        recommended = str(r_res.rx2("recommended_test"))
                    except Exception:
                        recommended = None
                    try:
                        stats = _r_to_py(r_res.rx2("stats"))
                    except Exception:
                        stats = None
                    try:
                        plot_path = r_res.rx2("plot_path")
                    except Exception:
                        plot_path = None

                    out["recommended_test"] = recommended or ""
                    out["stats"] = stats or {}
                    out["plot_path"] = _clean_plot_path(plot_path)
                except Exception:
                    out["recommended_test"] = ""
                    out["stats"] = str(py_res) if py_res is not None else {}
                    out["plot_path"] = ""

            # NOTE: meta update disabled to avoid overwriting encoding detected during upload.
            # _write_meta_encoding_if_possible is intentionally NOT called here.

            return out

        except Exception as e:
            last_exc = e
            msg = str(e).lower()
            if any(tok in msg for tok in ("unicode", "utf-8", "decode", "invalid continuation", "invalid start byte")):
                # try next encoding
                continue
            if "unused argument" in msg or "formal" in msg or "argument" in msg:
                try:
                    _ensure_r_loaded(force_reload=True)
                    continue
                except Exception:
                    continue
            raise RuntimeError(f"R analysis failed: {e}") from e

    raise RuntimeError(f"R analysis failed after trying encodings {enc_candidates}: {last_exc}")