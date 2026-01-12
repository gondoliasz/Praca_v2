// helper do wywołania /analyze i podmiany obrazów + obsługa spinnera i błędów
async function analyzeAndShow(file_id, x, y) {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const leftImg = document.getElementById('leftPlot');
  const rightImg = document.getElementById('rightPlot');
  const statusBox = document.getElementById('statusBox'); // optional element to show text
  if (!leftImg || !rightImg) {
    console.warn('Image elements not found (expected ids: leftPlot, rightPlot)');
  }

  try {
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (statusBox) statusBox.innerText = 'Analiza...';

    const payload = { file_id: file_id, x: x, y: y };
    const resp = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.detail || JSON.stringify(data);
      throw new Error('Analiza nie powiodła się: ' + msg);
    }

    // update stats and recommended_test if you have DOM elements:
    const recEl = document.getElementById('recommendedTest');
    const statsEl = document.getElementById('statsBox');
    if (recEl) recEl.innerText = data.recommended_test || '';
    if (statsEl) statsEl.innerText = JSON.stringify(data.stats || {}, null, 2);

    // Use base64 always (backend returns it)
    if (data.plot_base64) {
      const src = 'data:image/png;base64,' + data.plot_base64;
      if (rightImg) rightImg.src = src;
      // optionally show a left preview or small thumbnail on the left
      if (leftImg) leftImg.src = src;
    } else {
      // fallback: clear image
      if (rightImg) rightImg.src = '';
      if (leftImg) leftImg.src = '';
    }
    if (statusBox) statusBox.innerText = 'Gotowe';
  } catch (err) {
    console.error(err);
    if (statusBox) statusBox.innerText = 'Błąd: ' + (err.message || err);
    alert('Błąd podczas analizy: ' + (err.message || err));
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}