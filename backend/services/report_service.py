from io import BytesIO
import base64
from typing import Any, Dict
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.drawing.image import Image as OpenpyxlImage
from PIL import Image
import pandas as pd

def generate_excel_report(result: Dict[str, Any]) -> BytesIO:
    wb = Workbook()
    # Summary sheet
    ws = wb.active
    ws.title = "Summary"
    ws.append(["Pole", "Wartość"])
    ws.append(["Recommended test", result.get("recommended_test", "")])
    ws.append(["Actual X", result.get("actual_x", "")])
    ws.append(["Actual Y", result.get("actual_y", "")])
    ws.append([])
    ws.append(["Info", "Plik wygenerowany przez aplikację Analiza zależności zmiennych"])

    # Stats sheet
    stats = result.get("stats", None)
    ws2 = wb.create_sheet("Stats")
    if stats is None or (isinstance(stats, (dict, list)) and len(stats) == 0):
        ws2.append(["Brak statystyk"])
    else:
        if isinstance(stats, dict):
            ws2.append(["Nazwa", "Wartość"])
            for k, v in stats.items():
                try:
                    if isinstance(v, (dict, list)):
                        v_str = pd.io.json.dumps(v, ensure_ascii=False)
                    else:
                        v_str = str(v)
                except Exception:
                    v_str = str(v)
                ws2.append([k, v_str])
        elif isinstance(stats, list):
            try:
                df = pd.DataFrame(stats)
                if df.empty:
                    ws2.append(["Brak danych w liście statystyk"])
                else:
                    for r in dataframe_to_rows(df, index=False, header=True):
                        ws2.append(r)
            except Exception:
                ws2.append(["Index", "Value"])
                for i, s in enumerate(stats):
                    ws2.append([i, str(s)])
        else:
            ws2.append([str(stats)])

    # Plot sheet
    plot_b64 = result.get("plot_base64")
    if plot_b64:
        try:
            img_bytes = base64.b64decode(plot_b64)
            pil_img = Image.open(BytesIO(img_bytes)).convert("RGBA")
            img_io = BytesIO()
            pil_img.save(img_io, format="PNG")
            img_io.seek(0)

            ws3 = wb.create_sheet("Plot")
            img_for_xl = OpenpyxlImage(img_io)
            img_for_xl.anchor = "A1"
            ws3.add_image(img_for_xl)
        except Exception:
            ws3 = wb.create_sheet("Plot")
            ws3.append(["Nie udało się załadować wykresu do pliku Excel."])

    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return out