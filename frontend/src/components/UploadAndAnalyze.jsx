import React, { useState } from "react";
import axios from "axios";
import Flowchart from "./Flowchart";

export default function UploadAndAnalyze({ showTitle = true }) {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState({ x: "", y: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const upload = async () => {
    if (!file) return alert("Wybierz plik CSV");
    const fd = new FormData();
    fd.append("file", file);
    setLoading(true);
    try {
      const res = await axios.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMeta(res.data);
      setResult(null);
      // reset selected columns on new upload
      setSelected({ x: "", y: "" });
    } catch (e) {
      alert("Błąd uploadu: " + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const analyze = async () => {
    if (!meta) return alert("Najpierw wyślij dane");
    if (!selected.x || !selected.y) return alert("Wybierz dwie kolumny");
    setLoading(true);
    try {
      const payload = { file_id: meta.file_id, x: selected.x, y: selected.y };
      const res = await axios.post("/analyze", payload);
      setResult(res.data);
    } catch (e) {
      alert("Błąd analizy: " + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto bg-white shadow-md rounded p-6">
        {/* Jeśli chcesz, możesz wyłączyć tytuł z poziomu nadrzędnego komponentu: <UploadAndAnalyze showTitle={false} /> */}
        {showTitle && <h1 className="text-2xl font-bold mb-4">Analiza zależności zmiennych</h1>}

        <div className="mb-4">
          <label className="block mb-2">Wybierz plik CSV</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0])}
            className="mb-2"
          />
          <div>
            <button
              onClick={upload}
              className="bg-blue-600 text-white px-4 py-2 rounded mr-2"
              disabled={loading}
            >
              Wyślij
            </button>
          </div>
        </div>

        {meta && (
          <div className="mb-4">
            <h3 className="font-semibold">Kolumny (wykryte typy)</h3>
            <div className="text-sm text-gray-600 mb-2">Wykryte kodowanie: {meta.encoding}</div>

            {/* flex row with responsive, shrinkable selects */}
            <div className="flex gap-2 items-center my-2">
              <select
                value={selected.x}
                onChange={(e) => setSelected({ ...selected, x: e.target.value })}
                className="border p-2 rounded flex-1 min-w-0"
              >
                <option value="">Wybierz X</option>
                {meta.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.display} — {c.type} {c.n_unique !== undefined ? `(${c.n_unique} różnych)` : ""}
                  </option>
                ))}
              </select>

              <select
                value={selected.y}
                onChange={(e) => setSelected({ ...selected, y: e.target.value })}
                className="border p-2 rounded flex-1 min-w-0"
              >
                <option value="">Wybierz Y</option>
                {meta.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.display} — {c.type} {c.n_unique !== undefined ? `(${c.n_unique} różnych)` : ""}
                  </option>
                ))}
              </select>

              <button
                onClick={analyze}
                className="bg-green-600 text-white px-4 py-2 rounded flex-none"
                disabled={loading}
              >
                Analizuj
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded">
              <h4 className="font-semibold mb-2">Rekomendowany test</h4>
              <div className="mb-4">
                <span className="inline-block bg-indigo-100 text-indigo-800 px-3 py-1 rounded">
                  {result.recommended_test}
                </span>
              </div>
              <h5 className="font-medium">Statystyki</h5>
              <pre className="text-sm bg-gray-100 p-2 rounded max-h-60 overflow-auto">
                {JSON.stringify(result.stats, null, 2)}
              </pre>
              {result.plot_url && (
                <div className="mt-3">
                  <h5 className="font-medium mb-2">Wykres</h5>
                  <img src={result.plot_url} alt="wykres" className="border rounded max-w-full" />
                </div>
              )}
            </div>

            <div className="p-4 border rounded">
              <h4 className="font-semibold mb-2">Diagram decyzyjny</h4>
              <Flowchart recommendedTest={result.recommended_test} />
              <div className="mt-3 text-xs text-gray-600">
                Węzeł podświetlony odpowiada rekomendowanemu testowi.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}