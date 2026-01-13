import React, { useState, useRef } from "react";
import "./AnalyzePanel.css";

// base URL for API (configurable via .env VITE_API_BASE)
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

/* AnalyzePanel component (z funkcją pobierania Excela) */
function valueToString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatPValue(p) {
  if (p === null || p === undefined || Number.isNaN(Number(p))) return valueToString(p);
  const pv = Number(p);
  const short = pv < 0.001 ? pv.toExponential(2) : pv.toFixed(3);
  const cls = pv < 0.05 ? "stat-p small text-danger" : "stat-p small text-success";
  return <span className={cls}>{short}</span>;
}

function StatsView({ stats }) {
  if (!stats || (typeof stats === "object" && Object.keys(stats).length === 0)) {
    return <div className="text-muted"><em>Brak statystyk</em></div>;
  }

  if (Array.isArray(stats)) {
    if (stats.length > 0 && typeof stats[0] === "object" && !Array.isArray(stats[0])) {
      const headers = Array.from(new Set(stats.flatMap(obj => Object.keys(obj))));
      return (
        <div className="table-responsive stats-table">
          <table className="table table-sm table-striped">
            <thead>
              <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {stats.map((row, idx) => (
                <tr key={idx}>
                  {headers.map(h => {
                    const v = row[h];
                    if (h.toLowerCase().includes("p") || h.toLowerCase().includes("p_value")) {
                      return <td key={h}>{formatPValue(v)}</td>;
                    }
                    return <td key={h}>{valueToString(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <ul>{stats.map((s, i) => <li key={i}>{valueToString(s)}</li>)}</ul>;
  }

  if (typeof stats === "object") {
    return (
      <>
        <div className="table-responsive stats-table">
          <table className="table table-sm table-bordered">
            <tbody>
              {Object.entries(stats).map(([k, v]) => (
                <tr key={k}>
                  <th style={{ width: "40%" }}>{k}</th>
                  <td>
                    { (k.toLowerCase().includes("p") || k.toLowerCase().includes("p_value"))
                        ? formatPValue(v)
                        : valueToString(v)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Surowe dane</summary>
          <pre className="raw-json">{JSON.stringify(stats, null, 2)}</pre>
        </details>
      </>
    );
  }

  return <div>{String(stats)}</div>;
}

export default function AnalyzePanel() {
  const [file, setFile] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [encoding, setEncoding] = useState(null);
  const [rows, setRows] = useState(null);

  const [xCol, setXCol] = useState(null);
  const [yCol, setYCol] = useState(null);

  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [error, setError] = useState(null);

  const [recommended, setRecommended] = useState("");
  const [stats, setStats] = useState(null);
  const [plotBase64, setPlotBase64] = useState(null);
  const [plotKey, setPlotKey] = useState(null);
  const [actualX, setActualX] = useState(null);
  const [actualY, setActualY] = useState(null);

  const fileInputRef = useRef();

  function onFileChange(e) {
    setFile(e.target.files && e.target.files[0]);
    setError(null);
  }

  async function upload() {
    if (!file) {
      setError("Wybierz plik CSV przed wysłaniem.");
      return;
    }
    setLoadingUpload(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const resp = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
      setFileId(data.file_id);
      setColumns(data.columns || []);
      setEncoding(data.encoding || null);
      setRows(data.rows || null);
      setRecommended("");
      setStats(null);
      setPlotBase64(null);
      setPlotKey(null);
      setActualX(null);
      setActualY(null);
      if (data.columns && data.columns.length >= 2) {
        setXCol(data.columns[0].name);
        setYCol(data.columns[1].name);
      } else {
        setXCol(null);
        setYCol(null);
      }
    } catch (e) {
      console.error("Upload error:", e);
      setError(e.message || String(e));
    } finally {
      setLoadingUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
    }
  }

  async function analyze() {
    if (!fileId || !xCol || !yCol) {
      setError("Wymagane: plik, kolumny X i Y.");
      return;
    }
    setLoadingAnalyze(true);
    setError(null);
    try {
      const payload = { file_id: fileId, x: xCol, y: yCol };
      const resp = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      console.group("[analyze] response");
      console.log("status:", resp.status, resp.ok);
      console.log("json:", data);
      console.groupEnd();

      if (!resp.ok) {
        const detail = data && data.detail ? data.detail : JSON.stringify(data);
        setError(typeof detail === "string" ? detail : JSON.stringify(detail));
        return;
      }

      setRecommended(data.recommended_test || "");
      setStats(data.stats || {});
      setPlotBase64(data.plot_base64 || null);
      setActualX(data.actual_x || xCol || null);
      setActualY(data.actual_y || yCol || null);
      setPlotKey(Date.now());
      setError(null);
    } catch (e) {
      console.error("Analyze exception:", e);
      setError(e.message || String(e));
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function downloadExcel() {
    if (!fileId || !xCol || !yCol) {
      setError("Aby pobrać plik Excel, najpierw wykonaj upload i analizę (wymagane file_id, X i Y).");
      return;
    }
    setLoadingExport(true);
    setError(null);
    try {
      const payload = { file_id: fileId, x: xCol, y: yCol };
      const resp = await fetch(`${API_BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || resp.statusText);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeX = (xCol || "X").replace(/\s+/g, "_");
      const safeY = (yCol || "Y").replace(/\s+/g, "_");
      a.download = `analysis_${fileId}_${safeX}_vs_${safeY}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
      setError("Eksport nie powiódł się: " + (e.message || e));
    } finally {
      setLoadingExport(false);
    }
  }

  function renderColumnOption(col) {
    const name = typeof col === "string" ? col : col.name || col.display;
    const label = (typeof col === "string") ? col : (col.display || col.name);
    return <option key={name} value={name}>{label}</option>;
  }

  return (
    <div className="analyze-panel container my-3">
      <h3>Analiza zależności zmiennych</h3>

      <div className="card p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-5">
            <label className="form-label">Wybierz plik CSV</label>
            <input ref={fileInputRef} className="form-control" type="file" accept=".csv,text/csv" onChange={onFileChange} />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100" onClick={upload} disabled={loadingUpload}>
              {loadingUpload ? "Wysyłanie..." : "Wyślij"}
            </button>
          </div>

          <div className="col-md-5">
            <div className="small text-muted">Wykryte kodowanie: <strong>{encoding || "-"}</strong> &nbsp; | &nbsp; Wierszy: <strong>{rows ?? "-"}</strong></div>
            <div className="small text-muted">File ID: <span className="muted-id">{fileId || "-"}</span></div>
          </div>
        </div>

        <hr/>

        <div className="row g-2 align-items-center">
          <div className="col-md-5">
            <label className="form-label">Kolumna X</label>
            <select className="form-select" value={xCol || ""} onChange={e => setXCol(e.target.value)}>
              <option value="">-- wybierz --</option>
              {columns.map(renderColumnOption)}
            </select>
          </div>
          <div className="col-md-5">
            <label className="form-label">Kolumna Y</label>
            <select className="form-select" value={yCol || ""} onChange={e => setYCol(e.target.value)}>
              <option value="">-- wybierz --</option>
              {columns.map(renderColumnOption)}
            </select>
          </div>
          <div className="col-md-2 d-flex flex-column gap-2">
            <button id="analyzeBtn" className="btn btn-success w-100" onClick={analyze} disabled={loadingAnalyze || !fileId}>
              {loadingAnalyze ? "Analiza..." : "Analizuj"}
            </button>
            <button id="exportBtn" className="btn btn-outline-primary w-100" onClick={downloadExcel} disabled={loadingExport || !fileId}>
              {loadingExport ? "Eksport..." : "Pobierz Excel"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row">
        <div className="col-md-6">
          <div className="card p-3">
            <h5>Rekomendowany test</h5>
            <div className="mb-2">
              {recommended ? <span className="badge bg-primary">{recommended}</span> : <span className="text-muted">—</span>}
            </div>
            <h6 className="mt-3">Statystyki</h6>
            <div id="statsContainer">
              <StatsView stats={stats} />
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-3 text-center">
            <h5>Wykres</h5>
            <div className="d-flex gap-3 align-items-start">
              <div className="left-thumb">
                <img id="leftPlot" alt="miniatura" src={plotBase64 ? `data:image/png;base64,${plotBase64}` : undefined} />
              </div>
              <div className="flex-fill">
                {plotBase64 ? (
                  <img key={plotKey || "initial"} id="rightPlot" alt="wykres" className="right-plot" src={`data:image/png;base64,${plotBase64}`} />
                ) : (
                  <div className="empty-plot">Brak wykresu</div>
                )}
                <div className="small text-muted mt-2">Węzeł podświetlony odpowiada rekomendowanemu testowi.</div>
                <div className="small text-muted mt-1">Zbiór: <strong>{fileId || "-"}</strong> Kolumny: <strong>{actualX || xCol || "-"}</strong> vs <strong>{actualY || yCol || "-"}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}