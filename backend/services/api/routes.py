from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

# importuj swoje serwisy - dopasuj ścieżki importu do struktury projektu
from backend.services import file_service, r_interface, report_service

router = APIRouter()

class ColumnInfo(BaseModel):
    name: str
    display: Optional[str] = None

class UploadResp(BaseModel):
    file_id: str
    columns: List[ColumnInfo]
    encoding: Optional[str] = None
    rows: Optional[int] = None

@router.post("/upload", response_model=UploadResp)
async def upload_file(file: UploadFile = File(...)):
    try:
        file_id, cols, enc, rows = file_service.save_and_inspect(file)
        return {"file_id": file_id, "columns": cols, "encoding": enc, "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeReq(BaseModel):
    file_id: str
    x: str
    y: str

@router.post("/analyze")
async def analyze(req: AnalyzeReq):
    try:
        csv_path = file_service.file_path_from_id(req.file_id)
        rres = r_interface.run_analysis(csv_path, req.x, req.y, plots_dir="backend/plots")
        return rres
    except FileNotFoundError as fe:
        raise HTTPException(status_code=404, detail=str(fe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ------------------ LISTING 2: endpoint export (logika backendu) ------------------
@router.post("/export")
async def export_excel(req: AnalyzeReq):
    """
    Wykonuje analizę i zwraca wygenerowany plik Excel jako StreamingResponse.
    Zakłada: report_service.generate_excel_report(rres) zwraca BytesIO.
    """
    try:
        csv_path = file_service.file_path_from_id(req.file_id)
        # wykonaj analizę (można też użyć cache, jeśli masz)
        rres = r_interface.run_analysis(csv_path, req.x, req.y, plots_dir="backend/plots")
        # wygeneruj plik Excel (BytesIO)
        excel_io = report_service.generate_excel_report(rres)
        filename = f"analysis_{req.file_id}_{req.x}_vs_{req.y}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            excel_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except FileNotFoundError as fe:
        raise HTTPException(status_code=404, detail=str(fe))
    except Exception as e:
        # loguj błąd po stronie serwera, ale klientowi zwróć ogólny opis
        raise HTTPException(status_code=500, detail=str(e))