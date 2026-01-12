# zapisz jako test_analyze.py i uruchom: python test_analyze.py
import requests, base64, json, sys

API = "http://127.0.0.1:8001"
FILE_ID = "efc04a1b-a1a5-42fd-8f3f-b893bb54ba41"   # <- podmień
X_COL = "Wiek"    # <- podmień
Y_COL = "Płeć"    # <- podmień

url = API + "/analyze"
payload = {"file_id": FILE_ID, "x": X_COL, "y": Y_COL}
print("Posting:", url, payload)
r = requests.post(url, json=payload)
print("HTTP", r.status_code)
try:
    j = r.json()
except Exception as e:
    print("Response not JSON:", r.text)
    raise
print("JSON keys:", list(j.keys()))
print("recommended_test:", j.get("recommended_test"))
print("stats (preview):", json.dumps(j.get("stats"), indent=2)[:1000])
pb = j.get("plot_base64")
if pb:
    print("plot_base64 length:", len(pb))
    img = base64.b64decode(pb)
    with open("plot_out.png", "wb") as f:
        f.write(img)
    print("Wrote plot_out.png (open it).")
else:
    print("No plot_base64 returned.")