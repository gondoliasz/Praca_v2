// frontend/analyze-helper.js
async function analyzeAndShow(file_id, x, y) {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const leftImg = document.getElementById('leftPlot');
  const rightImg = document.getElementById('rightPlot');
  const recEl = document.getElementById('recommendedTest'); // element do rekomendacji
  const statsContainer = document.getElementById('statsContainer'); // kontener na statystyki (div)
  const statusBox = document.getElementById('statusBox'); // optional

  if (statusBox) statusBox.innerText = '';
  try {
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (statusBox) statusBox.innerText = 'Analiza...';

    // Reset UI natychmiast (usuń stare wyniki/wykres)
    if (recEl) recEl.innerHTML = '<em>Ładowanie...</em>';
    if (statsContainer) statsContainer.innerHTML = '<em>Ładowanie statystyk...</em>';
    if (rightImg) rightImg.src = ''; // usuń stare image aby nie mylić użytkownika

    const payload = { file_id: file_id, x: x, y: y };
    const resp = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      // jeśli backend zwrócił szczegółowy błąd, pokaż to
      const errDetail = data && data.detail ? data.detail : JSON.stringify(data);
      throw new Error(typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail));
    }

    // --- Recommended test ---
    if (recEl) {
      const rec = data.recommended_test || '';
      recEl.innerHTML = rec ? `<strong>${escapeHtml(rec)}</strong>` : '<em>Brak rekomendacji</em>';
    }

    // --- Stats: ładna tabela lub pre ---
    if (statsContainer) {
      const stats = data.stats;
      statsContainer.innerHTML = renderStats(stats);
    }

    // --- Plot (base64 zawsze powinien być) ---
    if (data.plot_base64) {
      const src = 'data:image/png;base64,' + data.plot_base64;
      if (rightImg) rightImg.src = src;
      if (leftImg) leftImg.src = src; // jeśli chcesz też miniaturę z lewej
    } else {
      // fallback transparent
      if (rightImg) rightImg.src = '';
    }

    if (statusBox) statusBox.innerText = 'Gotowe';
  } catch (err) {
    console.error('analyzeAndShow error', err);
    if (statusBox) statusBox.innerText = 'Błąd: ' + (err.message || err);
    // pokaż błąd w elemencie rekomendacji i statystyk
    if (recEl) recEl.innerHTML = `<span class="text-danger">Błąd</span>`;
    if (statsContainer) statsContainer.innerHTML = `<pre class="text-danger">${escapeHtml(err.message || String(err))}</pre>`;
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

// Helper: renderStats — jeśli słownik, pokaż tabelę; jeśli lista par, pokaż tabelę; w innym wypadku pokaż JSON
function renderStats(stats) {
  if (stats === null || stats === undefined || (typeof stats === 'object' && Object.keys(stats).length === 0)) {
    return '<div class="text-muted"><em>Brak statystyk</em></div>';
  }

  // if array of pairs or array of dicts
  if (Array.isArray(stats)) {
    // if array of simple key-value pairs or objects, render table
    if (stats.length > 0 && typeof stats[0] === 'object' && !Array.isArray(stats[0])) {
      // build header union
      const headers = Array.from(new Set(stats.flatMap(obj => Object.keys(obj))));
      let html = '<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr>';
      headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
      html += '</tr></thead><tbody>';
      stats.forEach(row => {
        html += '<tr>';
        headers.forEach(h => html += `<td>${escapeHtml(valueToString(row[h]))}</td>`);
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      return html;
    } else {
      // array of scalars
      const rows = stats.map(s => `<li>${escapeHtml(valueToString(s))}</li>`).join('');
      return `<ul>${rows}</ul>`;
    }
  }

  // if object -> key-value table
  if (typeof stats === 'object') {
    let html = '<div class="table-responsive"><table class="table table-sm table-bordered"><tbody>';
    for (const [k, v] of Object.entries(stats)) {
      html += `<tr><th style="width:40%">${escapeHtml(k)}</th><td>${escapeHtml(valueToString(v))}</td></tr>`;
    }
    html += '</tbody></table></div>';
    // also provide collapsible raw JSON for advanced users
    html += `<details><summary>Surowe dane</summary><pre style="max-height:300px; overflow:auto">${escapeHtml(JSON.stringify(stats, null, 2))}</pre></details>`;
    return html;
  }

  // fallback: primitive
  return `<div>${escapeHtml(String(stats))}</div>`;
}

function valueToString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}