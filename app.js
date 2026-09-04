// ===== DEMAND PLANNING HUB - Versione Gratis =====
// Tutto client-side. I dati non escono mai dal browser.

let workbookData = null;
let selectedSeries = [];
let forecastResults = null;
let chartInstance = null;
let outlierDecisions = {};
let lastOutliers = [];
let lastSeriesData = [];
let seriesAlgoOverride = {};

// ===== ELEMENTI DOM =====
const btnStart = document.getElementById('btn-start');
const btnStart2 = document.getElementById('btn-start-2');
const appArea = document.getElementById('app-area');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const btnChangeFile = document.getElementById('btn-change-file');
const stepColumns = document.getElementById('step-columns');
const stepConfig = document.getElementById('step-config');
const stepResults = document.getElementById('step-results');
const colDate = document.getElementById('col-date');
const valueColumns = document.getElementById('value-columns');
const btnToConfig = document.getElementById('btn-to-config');
const algorithm = document.getElementById('algorithm');
const algoHint = document.getElementById('algo-hint');
const periods = document.getElementById('periods');
const windowSize = document.getElementById('window-size');
const btnCalculate = document.getElementById('btn-calculate');
const btnDownload = document.getElementById('btn-download');
const btnSave = document.getElementById('btn-save');
const btnNew = document.getElementById('btn-new');
const modalRegister = document.getElementById('modal-register');
const modalClose = document.getElementById('modal-close');
const formRegister = document.getElementById('form-register');

// ===== HINT ALGORITMI =====
const PRO_CODE = 'DPH-PRO-2026';
const PROMAX_CODE = 'DPH-TEST-2026';

function currentTier() {
  return localStorage.getItem('dph_tier') || (localStorage.getItem('dph_pro_test') === '1' ? 'promax' : 'base');
}

function isPro() {
  const t = currentTier();
  return t === 'pro' || t === 'promax';
}

function isProMax() {
  return currentTier() === 'promax';
}

function setTier(tier) {
  if (tier === 'pro' || tier === 'promax') localStorage.setItem('dph_tier', tier);
  else localStorage.removeItem('dph_tier');
  applyProUi();
}

function setPro(on) {
  setTier(on ? 'promax' : 'base');
}

function applyProUi() {
  const on = isPro();
  document.querySelectorAll('.pro-only').forEach(el => {
    el.disabled = !on;
  });
  const tools = document.getElementById('pro-tools');
  if (tools) tools.style.display = on ? 'block' : 'none';
  if (on) {
    initDriverRows();
    initScenarioRows();
  }
  const row = document.getElementById('pro-unlock-row');
  if (row) {
    const t = currentTier();
    if (t === 'promax') {
      row.innerHTML = 'Test <strong>ProMax</strong> attivo (cliente + promo). <button type="button" class="btn btn-text" id="btn-lock-pro">Disattiva</button>';
    } else if (t === 'pro') {
      row.innerHTML = 'Test <strong>Pro</strong> attivo. <button type="button" class="btn btn-text" id="btn-unlock-promax">Passa a ProMax</button> · <button type="button" class="btn btn-text" id="btn-lock-pro">Disattiva</button>';
    } else {
      row.innerHTML = 'Test: <button type="button" class="btn btn-text" id="btn-unlock-pro">Sblocca Pro</button> · <button type="button" class="btn btn-text" id="btn-unlock-promax">Sblocca ProMax</button>';
    }
    document.getElementById('btn-unlock-pro')?.addEventListener('click', () => unlockTier('pro'));
    document.getElementById('btn-unlock-promax')?.addEventListener('click', () => unlockTier('promax'));
    document.getElementById('btn-lock-pro')?.addEventListener('click', () => setTier('base'));
  }
}

function unlockTier(want) {
  const code = prompt(want === 'promax' ? 'Codice test ProMax:' : 'Codice test Pro:');
  const v = (code || '').trim().toUpperCase();
  if (want === 'promax' && (v === PROMAX_CODE || v === 'DPH-PROMAX-2026')) {
    setTier('promax');
    alert('ProMax di test: grano prodotto-cliente, promo storiche e future, phase-in per cliente.');
  } else if (want === 'pro' && (v === PRO_CODE || v === PROMAX_CODE)) {
    setTier('pro');
    alert('Pro di test: famiglie, promo di linea, settimane, modelli extra.');
  } else {
    alert('Codice non valido. Pro: DPH-PRO-2026  ·  ProMax: DPH-TEST-2026');
  }
}

function unlockPro() {
  unlockTier('promax');
}

const algoHints = {
  'moving-average': 'Media dello stesso mese negli anni disponibili. I mesi restano diversi tra loro.',
  'seasonal': 'Ripete l’ultimo anno, corretto con la crescita anno su anno. Utile come confronto, non come modello “nuovo”.',
  'exp-smoothing': 'Segue il livello e il trend recente, poi aggiunge la stagionalità (non copia l’anno scorso).',
  'linear': 'Linea di tendenza su tutti i dati + scostamento tipico di ogni mese.',
  'holt-winters': 'Livello + trend + stagionalità additiva. I picchi restano simili in ampiezza.',
  'hw-mult': 'Stagionalità moltiplicativa: i picchi e i cali si allargano o si stringono col livello. Di solito è il più diverso dalla Gratis.',
  'damped': 'Il trend cresce sempre meno nel tempo. Utile se non credi a una crescita infinita.',
  'momentum': 'Stesso mese dell’anno scorso, moltiplicato per la crescita degli ultimi 3 mesi.',
  'arima': 'Differenza + auto-regressione + un po’ di stagione. Versione semplificata.',
  'prophet': 'Trend + eventuale cambio di pendenza + stagionalità a onde (Fourier). È un’approssimazione di Prophet, non la libreria Facebook.',
  'optimistic': 'Previsione base + banda alta (residui storici).',
  'pessimistic': 'Previsione base − banda bassa (residui storici).',
  'compare': 'Calcola tutti i modelli, misura il MASE sugli ultimi mesi e sceglie il migliore (o la media dei due migliori se sono vicini).'
};

algorithm.addEventListener('change', () => {
  algoHint.textContent = algoHints[algorithm.value] || '';
});

// ===== START APP =====
function startApp() {
  const hide = ['home', 'come-funziona', 'prezzi'];
  hide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (appArea) appArea.style.display = 'block';
  const up = document.getElementById('step-upload');
  const cols = document.getElementById('step-columns');
  const cfg = document.getElementById('step-config');
  const res = document.getElementById('step-results');
  if (up) up.style.display = 'block';
  if (cols) cols.style.display = 'none';
  if (cfg) cfg.style.display = 'none';
  if (res) res.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSiteSection(id) {
  document.getElementById('home').style.display = '';
  document.getElementById('come-funziona').style.display = '';
  document.getElementById('prezzi').style.display = '';
  appArea.style.display = 'none';
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

document.querySelectorAll('a[data-nav]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showSiteSection(a.getAttribute('data-nav'));
  });
});

document.getElementById('logo-home')?.addEventListener('click', (e) => {
  e.preventDefault();
  showSiteSection('home');
});

btnStart.addEventListener('click', startApp);
if (btnStart2) btnStart2.addEventListener('click', startApp);
applyProUi();
document.getElementById('btn-unlock-pro')?.addEventListener('click', unlockPro);

// ===== UPLOAD =====
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

async function loadVaultFileList() {
  const box = document.getElementById('vault-files');
  if (!box) return;
  const tok = localStorage.getItem('dph_token');
  if (!tok) {
    box.innerHTML = 'Se hai già messo il file in Area aziendale, accedi lì prima. Altrimenti seleziona il file qui.';
    return;
  }
  try {
    const res = await fetch('/api/files', { headers: { Authorization: 'Bearer ' + tok } });
    if (!res.ok) {
      box.innerHTML = '';
      return;
    }
    const data = await res.json();
    if (!data.files || !data.files.length) {
      box.innerHTML = 'Nessun file in Area. Caricalo qui sotto oppure dalla pagina Area.';
      return;
    }
    box.innerHTML = '<p><strong>File già in Area aziendale</strong> — clicca per calcolare senza ricaricare:</p>' +
      data.files.map(f => '<button type="button" class="btn btn-outline vault-open" data-id="' + f.id + '">' + f.name + '</button> ').join('');
    box.querySelectorAll('.vault-open').forEach(btn => {
      btn.addEventListener('click', () => openVaultFile(btn.getAttribute('data-id'), btn.textContent));
    });
  } catch (e) {
    box.innerHTML = '';
  }
}

async function openVaultFile(id, name) {
  const tok = localStorage.getItem('dph_token');
  const res = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + tok } });
  if (!res.ok) {
    alert('Non riesco ad aprire il file dall’Area. Ricaricalo qui.');
    return;
  }
  const blob = await res.blob();
  const file = new File([blob], name || 'storico.xlsx', { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  handleFile(file);
}

loadVaultFileList();

btnChangeFile.addEventListener('click', () => {
  fileInput.value = '';
  fileInfo.style.display = 'none';
  uploadZone.style.display = 'block';
  stepColumns.style.display = 'none';
  stepConfig.style.display = 'none';
  stepResults.style.display = 'none';
  workbookData = null;
  hideValidation();
});

function handleFile(file) {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv'
  ];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showValidation('error', 'Formato non supportato.', ['Usa un file .xlsx, .xls o .csv.']);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const prefer = ['Storico_lungo', 'Storico', 'Dati', 'Vendite', 'Dati vendite'];
      const sheetName = prefer.find(n => workbook.SheetNames.includes(n)) || workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });

      if (json.length < 2) {
        showValidation('error', 'Il file sembra vuoto.', ['Serve una riga di intestazioni e almeno alcune righe di dati.']);
        return;
      }

      // Prima riga = headers
      let headers = json[0].map((h, i) => h ? String(h).trim() : `Colonna ${i + 1}`);
      let rows = json.slice(1).filter(row => row.some(cell => cell !== null && cell !== ''));
      let longInfo = null;
      if (looksLongFormat(headers)) {
        const shaped = reshapeLongToWide(headers, rows);
        headers = shaped.headers;
        rows = shaped.rows;
        longInfo = shaped.meta;
      }

      workbookData = {
        headers,
        rows,
        hierarchy: parseHierarchySheet(workbook),
        commercial: parseCommercialSheet(workbook),
        substitutions: parseSubstitutionSheet(workbook),
        promos: parsePromoSheet(workbook),
        promoHistory: parsePromoHistorySheet(workbook),
        longInfo,
        gapDays: 30
      };
      fileName.textContent = file.name;
      fileInfo.style.display = 'flex';
      uploadZone.style.display = 'none';

      populateColumnSelectors(headers);
      if (longInfo) {
        showValidation('ok', 'File in formato lungo (Data / Prodotto / Cliente / Pezzi).', [
          longInfo.series + ' serie prodotto-cliente (max ' + longInfo.kept + ' tenute in memoria).',
          longInfo.others ? (longInfo.others + ' coppie piccole accorpate in “Altri”.') : 'Nessun accorpamento Altri.',
          'ProMax: sblocca il test per applicare promo e phase-in a questo grano.'
        ]);
      }
      stepColumns.style.display = 'block';
      stepConfig.style.display = 'none';
      stepResults.style.display = 'none';
    } catch (err) {
      console.error(err);
      showValidation('error', 'Non riesco a leggere il file.', ['Verifica che sia un Excel o CSV valido e non protetto da password.']);
    }
  };
  reader.readAsArrayBuffer(file);
}

function populateColumnSelectors(headers) {
  colDate.innerHTML = '';
  valueColumns.innerHTML = '';

  headers.forEach((h, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = h;
    colDate.appendChild(opt);

    const looksDate = /data|date|settim/i.test(String(h)) || i === 0;
    if (looksDate) return;
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    label.innerHTML = `
      <input type="checkbox" value="${i}" data-name="${h}">
      <span>${h}</span>
    `;
    valueColumns.appendChild(label);
  });

  // Auto-select prima colonna come data se sembra una data
  // e le altre come possibili valori
  updateSelectedSeries();
  valueColumns.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateSelectedSeries);
  });
}

function dateColIndex() {
  return parseInt(colDate.value, 10);
}

document.getElementById('btn-select-all')?.addEventListener('click', () => {
  const skip = dateColIndex();
  const boxes = Array.from(valueColumns.querySelectorAll('input[type="checkbox"]'))
    .filter(cb => parseInt(cb.value, 10) !== skip);
  if (!isPro() && boxes.length > 5) {
    boxes.forEach((cb, i) => { cb.checked = i < 5; });
    alert('Gratis: selezionate le prime 5 serie. Sblocca Pro per prenderle tutte.');
  } else {
    boxes.forEach(cb => { cb.checked = true; });
  }
  updateSelectedSeries();
});

document.getElementById('btn-select-none')?.addEventListener('click', () => {
  valueColumns.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  updateSelectedSeries();
});

function updateSelectedSeries() {
  const checked = valueColumns.querySelectorAll('input[type="checkbox"]:checked');
  selectedSeries = Array.from(checked).map(cb => ({
    index: parseInt(cb.value),
    name: cb.dataset.name
  }));

  if (!isPro() && selectedSeries.length > 5) {
    alert('Nella versione Gratis puoi selezionare al massimo 5 serie. Sblocca il test Pro per togliere il limite.');
    checked[checked.length - 1].checked = false;
    updateSelectedSeries();
    return;
  }

  btnToConfig.disabled = selectedSeries.length === 0;
}

function showValidation(type, title, items) {
  const box = document.getElementById('validation-box');
  if (!box) return;
  box.style.display = 'block';
  box.className = 'validation-box ' + type;
  const list = items && items.length
    ? '<ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>'
    : '';
  box.innerHTML = '<strong>' + title + '</strong>' + list;
}

function hideValidation() {
  const box = document.getElementById('validation-box');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function describeFrequency(days) {
  if (days <= 2) return 'giornaliera';
  if (days <= 10) return 'settimanale';
  if (days <= 20) return 'bisettimanale';
  if (days <= 45) return 'mensile';
  if (days <= 80) return 'bimestrale';
  if (days <= 120) return 'trimestrale';
  return 'irregolare';
}

function buildSeriesFromFile() {
  const dateColIdx = parseInt(colDate.value);
  const warnings = [];
  const errors = [];

  const seriesData = selectedSeries.map(s => {
    const points = [];
    let emptyBuckets = 0;
    let notNumeric = 0;
    let invalidDates = 0;

    workbookData.rows.forEach(row => {
      const dateVal = row[dateColIdx];
      const valueVal = row[s.index];
      const hasDate = dateVal != null && dateVal !== '';
      const hasValue = valueVal != null && valueVal !== '';

      if (!hasDate && !hasValue) return;

      const parsed = parseDate(dateVal);
      if (!parsed) {
        // riga di testo/nota, non un periodo
        if (hasValue) invalidDates++;
        return;
      }

      if (!hasValue) {
        emptyBuckets++;
        return;
      }

      const num = parseFloat(String(valueVal).replace(',', '.').replace(/\s/g, ''));
      if (isNaN(num)) {
        notNumeric++;
        return;
      }

      points.push({ date: parsed, value: num });
    });

    points.sort((a, b) => a.date - b.date);

    // remove duplicate dates (keep last)
    const unique = [];
    points.forEach(p => {
      const last = unique[unique.length - 1];
      if (last && last.date.getTime() === p.date.getTime()) {
        unique[unique.length - 1] = p;
      } else {
        unique.push(p);
      }
    });

    if (emptyBuckets > 0) {
      warnings.push(
        s.name + ': ci sono ' + emptyBuckets +
        ' periodi con data ma senza numero (bucket vuoti). Non li tratto come zero: li salto.'
      );
    }
    if (notNumeric > 0) {
      warnings.push(s.name + ': ' + notNumeric + ' celle non sono numeri e sono state ignorate.');
    }
    if (invalidDates > 0) {
      warnings.push(s.name + ': ' + invalidDates + ' righe hanno una data non valida.');
    }
    if (unique.length < 6) {
      errors.push(
        s.name + ': servono almeno 6 periodi validi (ora ce ne sono ' + unique.length + ').'
      );
    }

    // frequency / holes
    if (unique.length >= 3) {
      const diffs = [];
      for (let i = 1; i < unique.length; i++) {
        diffs.push((unique[i].date - unique[i - 1].date) / 86400000);
      }
      const med = median(diffs);
      const holes = diffs.filter(d => d > med * 1.8).length;
      if (holes > 0) {
        warnings.push(
          s.name + ': la serie non è costante. Sembra ' + describeFrequency(med) +
          ', ma ci sono ' + holes +
          ' buchi nel calendario (periodi saltati). La previsione sarà meno affidabile.'
        );
      }
    }

    return { name: s.name, points: unique };
  });

  return { seriesData, warnings, errors };
}

btnToConfig.addEventListener('click', () => {
  if (selectedSeries.length === 0) {
    showValidation('error', 'Seleziona almeno una colonna di valori.', []);
    return;
  }
  hideValidation();
  try {
    const probe = buildSeriesFromFile();
    const dates = (probe.seriesData[0] && probe.seriesData[0].points || []).map(p => p.date);
    const gap = gapDaysFromDates(dates);
    workbookData.gapDays = gap;
    const sel = document.getElementById('periods');
    if (sel && gap <= 10) {
      sel.innerHTML = '<option value="4">4 settimane</option><option value="8">8 settimane</option><option value="13" selected>13 settimane</option><option value="26">26 settimane</option><option value="52" class="pro-only">52 settimane (Pro)</option>';
    } else if (sel && gap > 10) {
      sel.innerHTML = '<option value="3">3 mesi</option><option value="6" selected>6 mesi</option><option value="12">12 mesi</option><option value="24" class="pro-only">24 mesi (Pro)</option>';
    }
    const freqHint = document.getElementById('freq-hint');
    if (freqHint) {
      freqHint.textContent = 'Calendario rilevato: ' + describeFrequency(gap) +
        (gap <= 10 ? '. La previsione avanza per settimane.' : '. La previsione avanza per mesi.');
    }
  } catch (e) {}
  stepConfig.style.display = 'block';
  stepResults.style.display = 'none';
  window.scrollTo({ top: stepConfig.offsetTop - 80, behavior: 'smooth' });
});

let lastServerFits = {};

async function applyServerEngine(results, seriesData, nPeriods, algo) {
  const tok = localStorage.getItem('dph_token');
  if (!tok || !results) return;
  lastServerFits = {};
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (String(res.name).indexOf('Famiglia:') === 0) continue;
    const serie = (seriesData || []).find(s => s.name === res.name);
    if (!serie) continue;
    const src = serie.modelPoints || serie.points || [];
    const values = src.map(p => p.value);
    const dates = src.map(p => p.date);
    const season = inferSeasonLength(dates);
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 90000) : null;
      const r = await fetch('/api/smart-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ values: values, season: season, periods: nPeriods }),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (t) clearTimeout(t);
      if (!r.ok) continue;
      const data = await r.json();
      lastServerFits[res.name] = data;
      const rows = ((res.compare && res.compare.rows) || []).concat(data.rows || []);
      rows.sort((a, b) => (a.mase || 999) - (b.mase || 999));
      res.compare = Object.assign({}, res.compare || {}, { rows: rows, best: rows[0] ? rows[0].name : (res.compare && res.compare.best) });
      const prefer = {
        'server-arima': 'Server · AutoARIMA',
        'server-ets': 'Server · AutoETS',
        'server-mstl': 'Server · MSTL',
        prophet: 'Server · Prophet',
        'server-prophet': 'Server · Prophet'
      };
      const pick = prefer[algo];
      const by = data.by_name || {};
      if (pick && by[pick]) {
        res.forecast = res.forecast.map((p, j) => ({ date: p.date, value: by[pick][j] != null ? by[pick][j] : p.value }));
        res.chosen = pick;
        res.notes = (res.notes || []).concat(['Modello server scelto: ' + pick]);
      } else if ((algo === 'server-auto' || algo === 'compare') && data.forecast && data.forecast.length) {
        const clientRow = ((res.compare && res.compare.rows) || []).find(x => x.name === res.chosen);
        const serverMase = data.rows && data.rows[0] ? data.rows[0].mase : null;
        const clientMase = clientRow ? clientRow.mase : 999;
        if (algo === 'server-auto' || (serverMase != null && serverMase <= clientMase)) {
          res.forecast = res.forecast.map((p, j) => ({ date: p.date, value: data.forecast[j] != null ? data.forecast[j] : p.value }));
          res.chosen = data.best;
          res.notes = (res.notes || []).concat(['Motore server: ' + data.best]);
        }
      }
    } catch (e) {}
  }
}

// ===== CALCOLO PREVISIONE =====
btnCalculate.addEventListener('click', async () => {
  if (!workbookData || selectedSeries.length === 0) return;

  refreshScenarioTargets();
  const nPeriods = parseInt(periods.value);
  const algo = algorithm.value;
  const win = parseInt(windowSize.value) || 3;

  let { seriesData, warnings, errors } = buildSeriesFromFile();
  if (isPro()) {
    const pad = applyPredecessorPadding(seriesData);
    warnings.push(...pad.warnings);
    (pad.notes || []).forEach(n => warnings.push(n));
    seriesData.forEach(s => {
      if (s.points.length >= 6) {
        errors = errors.filter(e => !e.startsWith(s.name + ':'));
      }
    });
  }

  if (errors.length) {
    showValidation('error', 'Non posso calcolare la previsione.', errors.concat(warnings));
    stepResults.style.display = 'none';
    return;
  }

  if (warnings.length) {
    showValidation('warn', 'Previsione calcolata. Note sul file:', warnings);
  } else {
    showValidation('ok', 'Dati ok: serie abbastanza regolari per una previsione base.', []);
  }

  // Calcola previsione per ogni serie (per ora mostriamo la prima in grafico)
  // Per semplicità nella v1 mostriamo una serie alla volta nel grafico principale
  // e prepariamo i dati per il download di tutte

  lastSeriesData = seriesData;
  forecastResults = seriesData.map(serie => {
    const src = serie.modelPoints || serie.points;
    let values = src.map(p => p.value);
    const dates = src.map(p => p.date);
    const season = inferSeasonLength(dates);
    let outlierNote = '';
    let outlierItems = [];
    if (isPro()) {
      const cleaned = applyOutliers(serie.name, values, dates, season);
      values = cleaned.values;
      outlierItems = cleaned.items;
      if (cleaned.applied) outlierNote = cleaned.applied + ' outlier sostituiti (puoi confermarli o tenerli originali sotto).';
      else if (cleaned.items.length) outlierNote = cleaned.items.length + ' punti da rivedere nella tabella outlier.';
    }
    const cmp = isPro() ? compareModels(values, season, win, nPeriods) : (algo === 'compare' ? compareModels(values, season, win, nPeriods) : null);
    let forecastValues = [];
    const override = seriesAlgoOverride[serie.name];
    let chosen = override || algo;
    if (override && cmp && cmp.builders && cmp.builders[override]) {
      forecastValues = cmp.builders[override]();
    } else if (algo === 'seasonal') {
      forecastValues = seasonalNaiveForecast(values, season, nPeriods);
    } else if (algo === 'moving-average') {
      forecastValues = seasonalMovingAverageForecast(values, season, win, nPeriods);
    } else if (algo === 'exp-smoothing') {
      forecastValues = expSmoothingForecast(values, nPeriods, season);
    } else if (algo === 'holt-winters') {
      forecastValues = holtWintersForecast(values, season, nPeriods);
    } else if (algo === 'hw-mult') {
      forecastValues = holtWintersMultForecast(values, season, nPeriods);
    } else if (algo === 'damped') {
      forecastValues = dampedTrendForecast(values, season, nPeriods);
    } else if (algo === 'momentum') {
      forecastValues = momentumSeasonForecast(values, season, nPeriods);
    } else if (algo === 'arima') {
      forecastValues = arimaForecast(values, season, nPeriods);
    } else if (algo === 'server-auto') {
      forecastValues = prophetLikeForecast(values, season, nPeriods);
    } else if (algo === 'server-auto' || algo === 'prophet') {
      forecastValues = prophetLikeForecast(values, season, nPeriods);
    } else if (algo === 'optimistic') {
      forecastValues = bandForecast(values, season, nPeriods, 1);
    } else if (algo === 'pessimistic') {
      forecastValues = bandForecast(values, season, nPeriods, -1);
    } else if (algo === 'compare') {
      forecastValues = cmp.forecast;
      chosen = cmp.best;
    } else {
      forecastValues = linearRegressionForecast(values, nPeriods, season);
    }

    const lastDate = dates[dates.length - 1];
    const gap = gapDaysFromDates(dates);
    workbookData.gapDays = gap;
    const futureDates = [];
    for (let i = 1; i <= nPeriods; i++) futureDates.push(addPeriods(lastDate, i, gap));

    forecastValues = continueDecline(values, forecastValues);
    const baseFc = forecastValues.slice();
    const scenA = isPro() ? applyDriverScenario(baseFc) : baseFc.slice();
    const extra = [];

    return {
      name: serie.name,
      historical: serie.points,
      forecast: futureDates.map((d, i) => ({ date: d, value: baseFc[i] })),
      scenarioA: futureDates.map((d, i) => ({ date: d, value: scenA[i] })),
      extras: extra,
      outliers: outlierItems,
      compare: cmp,
      chosen,
      notes: isPro() ? scenarioNotes(outlierNote) : (outlierNote ? [outlierNote] : [])
    };
  });

  if (isPro()) {
    if (document.getElementById('hier-mode')?.value === 'topdown') {
      const fam = applyFamilyTopDown(forecastResults, seriesData, nPeriods, algo, win);
      forecastResults = fam.results;
      warnings.push(...fam.notes);
    }
    forecastResults = applyPhaseInOut(forecastResults, seriesData, nPeriods, algo, win);
    const promoNotes = applyPromos(forecastResults);
    warnings.push(...promoNotes);
    applyDeclineGuard(forecastResults, seriesData);
    syncScenarioA(forecastResults);
    forecastResults = attachScenariosAfter(forecastResults);
  }

  lastOutliers = forecastResults.flatMap(r => (r.outliers || []).map(o => ({ ...o, series: r.name })));
  populateSeriesPicker();
  const first = forecastResults[0];
  renderResults(first);
  renderOutlierTable(first ? first.name : null);
  stepResults.style.display = 'block';
  window.scrollTo({ top: stepResults.offsetTop - 80, behavior: 'smooth' });

  if (isPro() && localStorage.getItem('dph_token')) {
    showValidation('warn', 'Motore server in corso (AutoARIMA, ETS, MSTL, Prophet). Il grafico si aggiorna da solo.', []);
    try {
      await applyServerEngine(forecastResults, lastSeriesData, nPeriods, algo);
      lastOutliers = forecastResults.flatMap(r => (r.outliers || []).map(o => ({ ...o, series: r.name })));
      const shown = document.getElementById('series-picker');
      const name = shown && shown.value ? shown.value : (forecastResults[0] && forecastResults[0].name);
      const res = forecastResults.find(r => r.name === name) || forecastResults[0];
      if (res) {
        renderResults(res);
        renderOutlierTable(res.name);
      }
      showValidation('ok', 'Motore server applicato. In tabella MASE vedi AutoARIMA, ETS, MSTL, Prophet.', []);
    } catch (e) {
      showValidation('warn', 'Grafico pronto con i modelli del browser. Il server non ha risposto in tempo.', []);
    }
  }
});

function populateSeriesPicker() {
  const picker = document.getElementById('series-picker');
  if (!picker || !forecastResults) return;
  picker.innerHTML = '';
  forecastResults.forEach((r, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = r.name;
    picker.appendChild(opt);
  });
  picker.onchange = () => {
    const idx = parseInt(picker.value, 10);
    if (forecastResults[idx]) {
      renderResults(forecastResults[idx]);
      renderOutlierTable(forecastResults[idx].name);
    }
  };
}

// ===== ALGORITMI SEMPLICI (con stagionalità) =====
function gapDaysFromDates(dates) {
  if (!dates || dates.length < 2) return 30;
  const diffs = [];
  for (let i = 1; i < dates.length; i++) {
    diffs.push((dates[i] - dates[i - 1]) / 86400000);
  }
  return median(diffs) || 30;
}

function inferSeasonLength(dates) {
  if (!dates || dates.length < 8) return 1;
  const med = gapDaysFromDates(dates);
  if (med >= 25 && med <= 40) return 12;
  if (med >= 6 && med <= 10) {
    if (dates.length >= 52) return 52;
    if (dates.length >= 26) return 13;
    return Math.min(4, dates.length);
  }
  if (med >= 85 && med <= 100) return 4;
  if (med <= 2) return 7;
  return 1;
}

function addPeriods(date, n, gapDays) {
  const d = new Date(date.getTime());
  const g = gapDays || 30;
  if (g >= 25 && g <= 40) {
    d.setMonth(d.getMonth() + n);
    return d;
  }
  d.setTime(d.getTime() + Math.round(n * g) * 86400000);
  return d;
}

function seasonalFactors(values, season) {
  if (season < 2 || values.length < season) {
    return Array(Math.max(season, 1)).fill(1);
  }
  const sums = Array(season).fill(0);
  const counts = Array(season).fill(0);
  values.forEach((v, i) => {
    sums[i % season] += v;
    counts[i % season] += 1;
  });
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return sums.map((sum, i) => {
    if (!counts[i] || mean === 0) return 1;
    return (sum / counts[i]) / mean;
  });
}

function seasonalAddends(values, season) {
  if (season < 2 || values.length < season) {
    return Array(Math.max(season, 1)).fill(0);
  }
  const sums = Array(season).fill(0);
  const counts = Array(season).fill(0);
  values.forEach((v, i) => {
    sums[i % season] += v;
    counts[i % season] += 1;
  });
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return sums.map((sum, i) => (counts[i] ? sum / counts[i] : mean) - mean);
}

function yearGrowth(values, season) {
  if (season < 2 || values.length < season * 2) return 1;
  const last = values.slice(-season).reduce((a, b) => a + b, 0);
  const prev = values.slice(-season * 2, -season).reduce((a, b) => a + b, 0);
  if (prev <= 0) return 1;
  const g = last / prev;
  return Math.min(1.35, Math.max(0.7, g));
}

function round2(n) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function seasonalNaiveForecast(values, season, periods) {
  const s = season >= 2 ? season : 12;
  const growth = yearGrowth(values, s);
  const lastYear = values.slice(-s);
  const result = [];
  for (let i = 0; i < periods; i++) {
    const base = lastYear.length === s ? lastYear[i % s] : values[values.length - 1];
    result.push(round2(base * growth));
  }
  return result;
}

function seasonalMovingAverageForecast(values, season, window, periods) {
  const s = season >= 2 ? season : 1;
  if (s === 1) {
    const result = [];
    let current = values.slice();
    const w = Math.max(2, window || 3);
    for (let i = 0; i < periods; i++) {
      const slice = current.slice(-w);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      result.push(round2(avg));
      current.push(avg);
    }
    return result;
  }
  const w = Math.max(1, window || 3);
  const result = [];
  const series = values.slice();
  for (let i = 0; i < periods; i++) {
    const idx = series.length + i;
    const samples = [];
    for (let k = 1; k <= w; k++) {
      const pos = idx - k * s;
      if (pos >= 0 && pos < series.length) samples.push(series[pos]);
    }
    const avg = samples.length
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : series[series.length - 1];
    result.push(round2(avg));
    series.push(avg);
  }
  return result;
}

function expSmoothingForecast(values, periods, season = 1, alpha = 0.45) {
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;

  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = 0.25 * (level - prevLevel) + 0.75 * trend;
  }

  const addends = seasonalAddends(values, season >= 2 ? season : 1);
  const s = addends.length;
  const result = [];
  for (let i = 1; i <= periods; i++) {
    const trendVal = level + i * trend;
    const add = season >= 2 ? addends[(values.length + i - 1) % s] : 0;
    result.push(round2(trendVal + add));
  }
  return result;
}

function linearRegressionForecast(values, periods, season = 1) {
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const den = n * sumX2 - sumX * sumX;
  const slope = den === 0 ? 0 : (n * sumXY - sumX * sumY) / den;
  const intercept = (sumY - slope * sumX) / n;
  const addends = seasonalAddends(values, season >= 2 ? season : 1);
  const s = addends.length;

  const result = [];
  for (let i = 0; i < periods; i++) {
    const x = n + i;
    const trendVal = intercept + slope * x;
    const add = season >= 2 ? addends[(n + i) % s] : 0;
    result.push(round2(trendVal + add));
  }
  return result;
}

function holtWintersForecast(values, season, periods) {
  const s = season >= 2 ? season : 12;
  if (values.length < s + 2) {
    return expSmoothingForecast(values, periods, s);
  }
  const alpha = 0.3, beta = 0.1, gamma = 0.3;
  let level = values.slice(0, s).reduce((a, b) => a + b, 0) / s;
  let trend = 0;
  if (values.length >= s * 2) {
    const a = values.slice(0, s).reduce((x, y) => x + y, 0) / s;
    const b = values.slice(s, s * 2).reduce((x, y) => x + y, 0) / s;
    trend = (b - a) / s;
  }
  const seas = seasonalAddends(values, s).slice();
  for (let t = 0; t < values.length; t++) {
    const prev = level;
    const seasT = seas[t % s];
    level = alpha * (values[t] - seasT) + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
    seas[t % s] = gamma * (values[t] - level) + (1 - gamma) * seasT;
  }
  const out = [];
  for (let i = 1; i <= periods; i++) {
    out.push(round2(level + i * trend + seas[(values.length + i - 1) % s]));
  }
  return out;
}

function arimaForecast(values, season, periods) {
  if (values.length < 4) return expSmoothingForecast(values, periods, season);
  const diffs = [];
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1]);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  let num = 0, den = 0;
  for (let i = 1; i < diffs.length; i++) {
    num += (diffs[i] - mean) * (diffs[i - 1] - mean);
    den += (diffs[i - 1] - mean) ** 2;
  }
  const phi = den === 0 ? 0 : Math.max(-0.9, Math.min(0.9, num / den));
  let lastDiff = diffs[diffs.length - 1];
  let lastVal = values[values.length - 1];
  const addends = seasonalAddends(values, season >= 2 ? season : 1);
  const raw = [];
  for (let i = 1; i <= periods; i++) {
    lastDiff = mean + phi * (lastDiff - mean);
    lastVal = lastVal + lastDiff;
    const add = season >= 2 ? addends[(values.length + i - 1) % addends.length] : 0;
    raw.push(round2(lastVal + add * 0.35));
  }
  return raw;
}

function mapeHoldout(actual, pred) {
  let s = 0, n = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== 0) {
      s += Math.abs((actual[i] - pred[i]) / actual[i]);
      n++;
    }
  }
  return n ? Math.round((s / n) * 1000) / 10 : 999;
}

function seasonalNaiveScale(values, season) {
  const s = season >= 2 ? season : 1;
  if (values.length <= s) {
    let a = 0, n = 0;
    for (let i = 1; i < values.length; i++) { a += Math.abs(values[i] - values[i - 1]); n++; }
    return n ? a / n : 1;
  }
  let a = 0, n = 0;
  for (let i = s; i < values.length; i++) { a += Math.abs(values[i] - values[i - s]); n++; }
  return n ? a / n : 1;
}

function maseHoldout(actual, pred, scale) {
  if (!scale) return 999;
  let s = 0;
  for (let i = 0; i < actual.length; i++) s += Math.abs(actual[i] - pred[i]);
  return Math.round((s / actual.length / scale) * 1000) / 1000;
}

function continueDecline(values, fc) {
  if (!values || values.length < 18 || !fc || !fc.length) return fc;
  const s = 12;
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const lastY = sum(values.slice(-s));
  const prevY = sum(values.slice(-2 * s, -s));
  const firstY = sum(values.slice(0, s));
  if (!(lastY < prevY * 0.65 && lastY < firstY * 0.6)) return fc;
  const last = values[values.length - 1];
  const slope = (lastY - prevY) / s;
  return fc.map((v, i) => {
    const declined = Math.max(0, last + slope * (i + 1));
    return round2(Math.min(Math.max(v, 0), declined + Math.abs(v) * 0.15));
  });
}

function applyDeclineGuard(results, seriesData) {
  (results || []).forEach(r => {
    if (!r.forecast || String(r.name).indexOf('Famiglia:') === 0) return;
    const s = (seriesData || []).find(x => x.name === r.name);
    if (!s) return;
    const vals = (s.points || []).map(p => p.value);
    const capped = continueDecline(vals, r.forecast.map(p => p.value));
    r.forecast = r.forecast.map((p, i) => ({ date: p.date, value: capped[i] }));
  });
}

function compareModels(values, season, win, periods) {
  const h = Math.min(6, Math.max(3, Math.floor(values.length / 4)));
  const train = values.slice(0, -h);
  const test = values.slice(-h);
  const scale = seasonalNaiveScale(train, season);
  const models = {
    'Media stagionale': seasonalMovingAverageForecast(train, season, win, h),
    'Copia anno precedente': seasonalNaiveForecast(train, season, h),
    'Trend + stagione': expSmoothingForecast(train, h, season),
    'Regressione + stagione': linearRegressionForecast(train, h, season),
    'Holt-Winters additivo': holtWintersForecast(train, season, h),
    'Holt-Winters moltiplicativo': holtWintersMultForecast(train, season, h),
    'Trend smorzato': dampedTrendForecast(train, season, h),
    'Stagione × momentum': momentumSeasonForecast(train, season, h),
    'ARIMA semplificato': arimaForecast(train, season, h),
    'Prophet (approx.)': prophetLikeForecast(train, season, h)
  };
  const rows = Object.keys(models).map(name => ({
    name,
    mape: mapeHoldout(test, models[name]),
    mase: maseHoldout(test, models[name], scale)
  })).sort((a, b) => a.mase - b.mase);
  const bestName = rows[0].name;
  const builders = {
    'Media stagionale': () => seasonalMovingAverageForecast(values, season, win, periods),
    'Copia anno precedente': () => seasonalNaiveForecast(values, season, periods),
    'Trend + stagione': () => expSmoothingForecast(values, periods, season),
    'Regressione + stagione': () => linearRegressionForecast(values, periods, season),
    'Holt-Winters additivo': () => holtWintersForecast(values, season, periods),
    'Holt-Winters moltiplicativo': () => holtWintersMultForecast(values, season, periods),
    'Trend smorzato': () => dampedTrendForecast(values, season, periods),
    'Stagione × momentum': () => momentumSeasonForecast(values, season, periods),
    'ARIMA semplificato': () => arimaForecast(values, season, periods),
    'Prophet (approx.)': () => prophetLikeForecast(values, season, periods)
  };
  const close = rows[1] && rows[0].mase > 0 && rows[1].mase / rows[0].mase <= 1.12;
  let forecast;
  let best = bestName;
  if (close) {
    const a = builders[rows[0].name]();
    const b = builders[rows[1].name]();
    forecast = a.map((v, i) => round2((v + b[i]) / 2));
    best = rows[0].name + ' + ' + rows[1].name;
  } else {
    forecast = builders[bestName]();
  }
  return { best, rows, forecast, builders };
}

function solveLeastSquares(X, y) {
  const n = X.length, k = X[0].length;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < k; r++) {
      A[r][k] += X[i][r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
    }
  }
  for (let i = 0; i < k; i++) A[i][i] += 1e-6;
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    const d = A[i][i] || 1e-9;
    for (let c = i; c <= k; c++) A[i][c] /= d;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = A[r][i];
      for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c];
    }
  }
  return A.map(row => row[k]);
}

function prophetLikeForecast(values, season, periods) {
  const n = values.length;
  const P = season >= 2 ? season : 12;
  const K = Math.min(3, Math.max(1, Math.floor(P / 4)));
  const cp = Math.floor(n * 0.66);
  const X = [];
  for (let t = 0; t < n; t++) {
    const row = [1, t, Math.max(0, t - cp)];
    for (let k = 1; k <= K; k++) {
      row.push(Math.sin(2 * Math.PI * k * t / P));
      row.push(Math.cos(2 * Math.PI * k * t / P));
    }
    X.push(row);
  }
  let beta;
  try { beta = solveLeastSquares(X, values); }
  catch (e) { return holtWintersForecast(values, P, periods); }
  const out = [];
  for (let i = 0; i < periods; i++) {
    const t = n + i;
    let y = beta[0] + beta[1] * t + beta[2] * Math.max(0, t - cp);
    for (let k = 1; k <= K; k++) {
      y += beta[1 + 2 + (k - 1) * 2] * Math.sin(2 * Math.PI * k * t / P);
      y += beta[2 + 2 + (k - 1) * 2] * Math.cos(2 * Math.PI * k * t / P);
    }
    out.push(round2(y));
  }
  return out;
}

function holtWintersMultForecast(values, season, periods) {
  const s = season >= 2 ? season : 12;
  if (values.length < s + 2) return holtWintersForecast(values, s, periods);
  const alpha = 0.25, beta = 0.08, gamma = 0.35;
  let level = values.slice(0, s).reduce((a, b) => a + b, 0) / s || 1;
  let trend = 0;
  if (values.length >= s * 2) {
    const a = values.slice(0, s).reduce((x, y) => x + y, 0) / s;
    const b = values.slice(s, s * 2).reduce((x, y) => x + y, 0) / s;
    trend = (b - a) / s;
  }
  const seas = seasonalFactors(values, s).map(f => Math.max(0.4, f));
  for (let t = 0; t < values.length; t++) {
    const prev = level;
    const st = seas[t % s] || 1;
    level = alpha * (values[t] / st) + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
    seas[t % s] = gamma * (values[t] / Math.max(level, 0.01)) + (1 - gamma) * st;
  }
  const out = [];
  for (let i = 1; i <= periods; i++) {
    out.push(round2((level + i * trend) * (seas[(values.length + i - 1) % s] || 1)));
  }
  return out;
}

function dampedTrendForecast(values, season, periods) {
  const phi = 0.82;
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  for (let i = 1; i < values.length; i++) {
    const prev = level;
    level = 0.35 * values[i] + 0.65 * (level + phi * trend);
    trend = 0.15 * (level - prev) + 0.85 * phi * trend;
  }
  const add = seasonalAddends(values, season >= 2 ? season : 1);
  const out = [];
  let acc = 0;
  for (let i = 1; i <= periods; i++) {
    acc += Math.pow(phi, i) * trend;
    const a = season >= 2 ? add[(values.length + i - 1) % add.length] : 0;
    out.push(round2(level + acc + a));
  }
  return out;
}

function momentumSeasonForecast(values, season, periods) {
  const s = season >= 2 ? season : 12;
  const last = values.slice(-s);
  const recent = values.slice(-3).reduce((a, b) => a + b, 0);
  const prev = values.slice(-3 - s, -s);
  const prevSum = prev.length ? prev.reduce((a, b) => a + b, 0) : recent;
  let mom = prevSum > 0 ? recent / prevSum : 1;
  mom = Math.min(1.45, Math.max(0.65, mom));
  const out = [];
  for (let i = 0; i < periods; i++) {
    const base = last.length === s ? last[i % s] : values[values.length - 1];
    out.push(round2(base * mom));
  }
  return out;
}

function residualSigma(values, season) {
  const fitted = seasonalMovingAverageForecast(values.slice(0, -1), season, 2, 1);
  // use seasonal factors * mean as naive fitted
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const f = seasonalFactors(values, season >= 2 ? season : 1);
  const errs = values.map((v, i) => v - mean * (f[i % f.length] || 1));
  const m = errs.reduce((a, b) => a + b, 0) / errs.length;
  const varr = errs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, errs.length - 1);
  return Math.sqrt(Math.max(0, varr));
}

function bandForecast(values, season, periods, sign) {
  const base = holtWintersMultForecast(values, season, periods);
  const sig = residualSigma(values, season);
  return base.map(v => round2(Math.max(0, v + sign * 0.85 * sig)));
}

function intensityMul(v) {
  if (v === 'lieve') return 0.55;
  if (v === 'forte') return 1.55;
  return 1;
}

function driverBasePct(tipo, driver) {
  const table = {
    freddo: { meteo: -22, prezzo: -8, promo: 18, competitor: -12, listino: -10 },
    caldo: { meteo: -18, prezzo: -7, promo: 14, competitor: -10, listino: -9 },
    industriale: { meteo: -3, prezzo: -14, promo: 6, competitor: -8, listino: -7 },
    retail: { meteo: -6, prezzo: -5, promo: 22, competitor: -14, listino: -8 },
    generico: { meteo: -10, prezzo: -8, promo: 12, competitor: -10, listino: -8 }
  };
  const row = table[tipo] || table.generico;
  return row[driver] || 0;
}

function driverRowHtml() {
  return `<div class="driver-row config-grid">
    <div class="form-group"><label>Variabile</label>
      <select class="select drv-name">
        <option value="nessuna">Nessuna</option>
        <option value="meteo">Meteo</option>
        <option value="prezzo">Prezzo / energia</option>
        <option value="promo">Promozione</option>
        <option value="competitor">Competitor</option>
        <option value="listino">Cambio listino</option>
      </select></div>
    <div class="form-group"><label>Direzione</label>
      <select class="select drv-dir">
        <option value="avverso">Avverso</option>
        <option value="favorevole">Favorevole</option>
      </select></div>
    <div class="form-group"><label>Intensità</label>
      <select class="select drv-int">
        <option value="lieve">Lieve</option>
        <option value="medio" selected>Media</option>
        <option value="forte">Forte</option>
      </select></div>
    <div class="form-group"><label>Dal mese n.</label>
      <input type="number" class="input drv-from" value="1" min="1" max="24"></div>
    <div class="form-group"><label>Al mese n.</label>
      <input type="number" class="input drv-to" value="3" min="1" max="24"></div>
    <div class="form-group"><label>&nbsp;</label>
      <button type="button" class="btn btn-text btn-del-driver">Rimuovi</button></div>
  </div>`;
}

function initDriverRows() {
  const box = document.getElementById('driver-rows');
  if (!box || box.dataset.ready === '1') return;
  box.dataset.ready = '1';
  addDriverRow();
  document.getElementById('btn-add-driver')?.addEventListener('click', addDriverRow);
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-del-driver');
    if (!btn) return;
    e.preventDefault();
    btn.closest('.driver-row')?.remove();
  });
}

function addDriverRow() {
  const box = document.getElementById('driver-rows');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', driverRowHtml());
}

function collectDrivers() {
  const tipo = document.getElementById('demand-type')?.value || 'generico';
  return Array.from(document.querySelectorAll('#driver-rows .driver-row')).map(row => {
    const name = row.querySelector('.drv-name').value;
    if (name === 'nessuna') return null;
    const dir = row.querySelector('.drv-dir').value;
    const from = Math.max(1, parseInt(row.querySelector('.drv-from').value, 10) || 1);
    const to = Math.max(from, parseInt(row.querySelector('.drv-to').value, 10) || from);
    let pct = driverBasePct(tipo, name) * intensityMul(row.querySelector('.drv-int').value);
    pct = dir === 'favorevole' ? Math.abs(pct) : -Math.abs(pct);
    return { name, dir, from, to, pct };
  }).filter(Boolean);
}

function applyDriverScenario(base) {
  const drivers = collectDrivers();
  if (!drivers.length) return base.slice();
  return base.map((v, i) => {
    const n = i + 1;
    let m = 1;
    drivers.forEach(d => {
      if (n >= d.from && n <= d.to) m *= (1 + d.pct / 100);
    });
    return round2(v * m);
  });
}

function syncScenarioA(results) {
  const drivers = collectDrivers();
  (results || []).forEach(r => {
    if (!r.forecast) return;
    const raw = r.forecast.map(p => p.value);
    if (!drivers.length) {
      r.scenarioA = r.forecast.map((p, i) => ({ date: p.date, value: raw[i] }));
      return;
    }
    const adj = applyDriverScenario(raw);
    r.forecast = r.forecast.map((p, i) => ({ date: p.date, value: adj[i] }));
    r.scenarioA = r.forecast.map((p, i) => ({ date: p.date, value: raw[i] }));
    r._rawWithoutDrivers = raw;
  });
}

function scenarioRowHtml(name, pct) {
  return `<div class="driver-row scenario-row config-grid">
    <div class="form-group"><label>Nome scenario</label>
      <input class="input sc-name" value="${name}"></div>
    <div class="form-group"><label>Variazione %</label>
      <input type="number" class="input sc-pct" value="${pct}" step="1"></div>
    <div class="form-group"><label>Dal mese n.</label>
      <input type="number" class="input sc-from" value="1" min="1"></div>
    <div class="form-group"><label>Al mese n.</label>
      <input type="number" class="input sc-to" value="12" min="1"></div>
    <div class="form-group"><label>Applica a</label>
      <select class="select sc-target"><option value="tutte">Tutte le serie</option></select></div>
    <div class="form-group"><label>&nbsp;</label>
      <button type="button" class="btn btn-text btn-del-scen">Rimuovi</button></div>
  </div>`;
}

function initScenarioRows() {
  const box = document.getElementById('scenario-rows');
  if (!box || box.dataset.ready === '1') return;
  box.dataset.ready = '1';
  addScenarioRow('What-if commerciale', 0);
  document.getElementById('btn-add-scenario')?.addEventListener('click', () => addScenarioRow('Scenario', 10));
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-del-scen');
    if (!btn) return;
    e.preventDefault();
    btn.closest('.scenario-row')?.remove();
  });
}

function addScenarioRow(name, pct) {
  document.getElementById('scenario-rows')?.insertAdjacentHTML('beforeend', scenarioRowHtml(name, pct));
  refreshScenarioTargets();
}

function collectScenarios() {
  return Array.from(document.querySelectorAll('#scenario-rows .scenario-row')).map(row => ({
    name: row.querySelector('.sc-name').value || 'Scenario',
    pct: parseFloat(row.querySelector('.sc-pct').value) || 0,
    from: Math.max(1, parseInt(row.querySelector('.sc-from').value, 10) || 1),
    to: Math.max(1, parseInt(row.querySelector('.sc-to').value, 10) || 12),
    target: (row.querySelector('.sc-target')?.value || 'tutte')
  })).filter(s => s.pct !== 0);
}

function refreshScenarioTargets() {
  const names = (selectedSeries || []).map(s => s.name);
  document.querySelectorAll('.sc-target').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="tutte">Tutte le serie</option>' +
      names.map(n => '<option value="' + n.replace(/"/g, '') + '">' + n + '</option>').join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  });
}

function attachScenariosAfter(results) {
  const scens = collectScenarios();
  results.forEach(r => {
    const base = (r.forecast || []).map(p => p.value);
    r.extras = scens.filter(s => s.target === 'tutte' || s.target === r.name).map(s => ({
      name: s.name + (s.target === 'tutte' ? '' : ' (' + s.target + ')'),
      values: base.map((v, i) => {
        const n = i + 1;
        if (n < s.from || n > s.to) return v;
        return round2(v * (1 + s.pct / 100));
      })
    }));
  });
  return results;
}

function applyAllManualScenarios(base) {
  return collectScenarios().map(s => ({
    name: s.name,
    values: base.map((v, i) => {
      const n = i + 1;
      if (n < s.from || n > s.to) return v;
      return round2(v * (1 + s.pct / 100));
    })
  }));
}

function scenarioNotes(outlierNote) {
  const notes = [];
  if (outlierNote) notes.push(outlierNote);
  collectDrivers().forEach(d => {
    notes.push('Scenario A: ' + d.name + ' ' + d.dir + ' ' + d.pct.toFixed(1) + '% sui mesi ' + d.from + '–' + d.to + '.');
  });
  collectScenarios().forEach(s => {
    notes.push(s.name + ': ' + s.pct + '% sui mesi ' + s.from + '–' + s.to + '.');
  });
  notes.push('Più variabili sullo stesso mese si moltiplicano. Sono elasticità tipiche, non dati meteo live.');
  return notes;
}

function slotTypical(values, season, i) {
  const s = season >= 2 ? season : 12;
  const peers = [];
  for (let j = 0; j < values.length; j++) {
    if (j !== i && (j % s) === (i % s)) peers.push(values[j]);
  }
  if (peers.length) return median(peers);
  const others = values.filter((_, j) => j !== i);
  return others.length ? median(others) : values[i];
}

function detectOutliers(values, season) {
  if (values.length < 6) return [];
  const s = season >= 2 ? season : 12;
  const typ = values.map((_, i) => slotTypical(values, s, i));
  const resid = values.map((v, i) => v - typ[i]);
  const absr = resid.map(Math.abs);
  const sr = resid.slice().sort((a, b) => a - b);
  const q1 = sr[Math.floor(sr.length * 0.25)];
  const q3 = sr[Math.floor(sr.length * 0.75)];
  const iqr = Math.max(q3 - q1, 1e-6);
  const mad = median(absr) || 1e-6;
  const scored = values.map((v, i) => {
    const r = resid[i];
    const hard = r < q1 - 1.6 * iqr || r > q3 + 1.6 * iqr || Math.abs(r) > 3.2 * mad;
    const weak = Math.abs(r) > 2.2 * mad || (typ[i] && Math.abs(r) / Math.max(Math.abs(typ[i]), 1) > 0.45);
    return { index: i, original: v, suggested: round2(typ[i]), hard, weak, score: Math.abs(r) };
  });
  let items = scored.filter(x => x.hard);
  if (items.length < 2) {
    const extra = scored.filter(x => !x.hard && x.weak).sort((a, b) => b.score - a.score).slice(0, 4);
    items = items.concat(extra);
  }
  if (!items.length) {
    items = scored.slice().sort((a, b) => b.score - a.score).slice(0, 2);
  }
  return items;
}

function applyOutliers(seriesName, values, dates, season) {
  const found = detectOutliers(values, season);
  const autoClean = !!document.getElementById('clean-outliers')?.checked;
  const out = values.slice();
  let applied = 0;
  const items = found.map(f => {
    const key = seriesName + '|' + f.index;
    if (outlierDecisions[key] === undefined) outlierDecisions[key] = autoClean && f.hard ? 'clean' : 'keep';
    const useClean = outlierDecisions[key] === 'clean';
    if (useClean) {
      out[f.index] = f.suggested;
      applied++;
    }
    return {
      series: seriesName,
      index: f.index,
      date: dates[f.index],
      original: f.original,
      suggested: f.suggested,
      decision: outlierDecisions[key]
    };
  });
  return { values: out, items, applied };
}

function sheetRows(workbook, names, exclude) {
  const n = workbook.SheetNames.find(s => {
    const sl = s.toLowerCase();
    if (exclude && exclude.some(x => sl.includes(x))) return false;
    return names.some(x => sl.includes(x));
  });
  if (!n) return [];
  const json = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: '' });
  return json;
}

function colPick(row, keys) {
  const map = {};
  Object.keys(row).forEach(k => { map[k.toLowerCase().trim()] = row[k]; });
  for (const key of keys) {
    if (map[key] !== undefined && map[key] !== '') return map[key];
  }
  return '';
}

function normHead(h) {
  return String(h || '').toLowerCase().trim();
}

function looksLongFormat(headers) {
  const h = headers.map(normHead);
  const hasDate = h.some(x => x.includes('data') || x.includes('date') || x.includes('settim'));
  const hasProd = h.some(x => x.includes('prodotto') || x === 'sku' || x.includes('articolo'));
  const hasQty = h.some(x => ['pezzi', 'qty', 'quantit', 'volume', 'vendite', 'valore'].some(k => x.includes(k)));
  return hasDate && hasProd && hasQty;
}

function headerIndex(headers, keys) {
  const h = headers.map(normHead);
  for (const k of keys) {
    const i = h.findIndex(x => x === k || x.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

function reshapeLongToWide(headers, rows) {
  const iDate = headerIndex(headers, ['data', 'date', 'settimana']);
  const iProd = headerIndex(headers, ['prodotto', 'sku', 'articolo']);
  const iCli = headerIndex(headers, ['cliente', 'customer', 'insegna']);
  const iQty = headerIndex(headers, ['pezzi', 'qty', 'quantit', 'volume', 'vendite', 'valore']);
  const map = {};
  const datesSet = {};
  rows.forEach(row => {
    const d = parseDate(row[iDate]);
    if (!d) return;
    const prod = String(row[iProd] || '').trim();
    if (!prod) return;
    const cli = iCli >= 0 ? String(row[iCli] || '').trim() : '';
    const qty = parseFloat(String(row[iQty]).replace(',', '.'));
    if (!isFinite(qty)) return;
    const key = cli ? (prod + ' · ' + cli) : prod;
    const t = d.getTime();
    datesSet[t] = d;
    map[key] = map[key] || {};
    map[key][t] = (map[key][t] || 0) + qty;
  });
  const totals = Object.keys(map).map(k => ({
    k, tot: Object.values(map[k]).reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.tot - a.tot);
  const MAX = 120;
  let keys = totals.map(x => x.k);
  let others = 0;
  if (keys.length > MAX) {
    const keep = totals.slice(0, MAX - 1).map(x => x.k);
    const rest = totals.slice(MAX - 1);
    others = rest.length;
    const otherMap = {};
    rest.forEach(r => {
      Object.keys(map[r.k]).forEach(t => { otherMap[t] = (otherMap[t] || 0) + map[r.k][t]; });
    });
    map['Altri clienti'] = otherMap;
    keys = keep.concat(['Altri clienti']);
  }
  const times = Object.keys(datesSet).map(Number).sort((a, b) => a - b);
  const wideHeaders = ['Data'].concat(keys);
  const wideRows = times.map(t => {
    const row = [datesSet[t]];
    keys.forEach(k => row.push(map[k][t] != null ? map[k][t] : 0));
    return row;
  });
  return { headers: wideHeaders, rows: wideRows, meta: { series: totals.length, kept: keys.length, others } };
}

function parseCommercialSheet(workbook) {
  return sheetRows(workbook, ['commerc', 'clienti', 'canale', 'insegna']).map(r => ({
    channel: String(colPick(r, ['canale', 'channel', 'rete', 'insegna'])).trim(),
    customer: String(colPick(r, ['cliente', 'customer', 'buyer'])).trim()
  })).filter(r => r.customer);
}

function parsePromoHistorySheet(workbook) {
  return sheetRows(workbook, ['promo_stor', 'storico_promo', 'promo passat', 'promopass']).map(r => {
    const start = parseDate(colPick(r, ['data_inizio', 'dal', 'inizio', 'start', 'data']));
    const end = parseDate(colPick(r, ['data_fine', 'al', 'fine', 'end'])) || start;
    const pezzi = parseFloat(String(colPick(r, ['pezzi', 'pezzi_promo', 'vendite_promo', 'qty', 'volume'])).replace(',', '.'));
    const base = parseFloat(String(colPick(r, ['pezzi_base', 'media_base', 'senza_promo', 'base'])).replace(',', '.'));
    return {
      prodotto: String(colPick(r, ['prodotto', 'sku', 'articolo'])).trim(),
      cliente: String(colPick(r, ['cliente', 'customer', 'insegna'])).trim(),
      start,
      end,
      pezzi: isFinite(pezzi) ? pezzi : null,
      base: isFinite(base) ? base : null
    };
  }).filter(p => p.prodotto && p.start);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function historicalUplift(product, cliente) {
  const hist = ((workbookData && workbookData.promoHistory) || []).filter(h => {
    if (String(h.prodotto).toLowerCase() !== String(product).toLowerCase() &&
        String(h.prodotto).toLowerCase().indexOf(String(product).toLowerCase()) === -1 &&
        String(product).toLowerCase().indexOf(String(h.prodotto).toLowerCase()) === -1) return false;
    if (!cliente) return true;
    if (!h.cliente) return true;
    return String(h.cliente).toLowerCase() === String(cliente).toLowerCase();
  });
  if (!hist.length) return null;

  const withPair = hist.filter(h => h.pezzi != null && h.base != null && h.base > 0);
  if (withPair.length) {
    const lifts = withPair.map(h => h.pezzi / h.base - 1);
    return round2(mean(lifts) * 100);
  }

  const withPezzi = hist.filter(h => h.pezzi != null);
  const seriesName = cliente ? (product + ' · ' + cliente) : product;
  const col = workbookData.headers.findIndex(h => String(h).toLowerCase() === seriesName.toLowerCase());
  if (withPezzi.length && col >= 1) {
    const iDate = 0;
    const basePts = [];
    workbookData.rows.forEach(row => {
      const d = row[iDate] instanceof Date ? row[iDate] : parseDate(row[iDate]);
      if (!d) return;
      const v = parseFloat(row[col]);
      if (!isFinite(v)) return;
      const inPromo = hist.some(h => d >= h.start && d <= h.end);
      if (!inPromo) basePts.push(v);
    });
    if (basePts.length >= 4) {
      const mb = mean(basePts);
      if (mb > 0) return round2((mean(withPezzi.map(h => h.pezzi)) / mb - 1) * 100);
    }
  }

  if (col < 1 || !workbookData.rows) return null;
  const iDate = 0;
  const promoPts = [];
  const basePts = [];
  workbookData.rows.forEach(row => {
    const d = row[iDate] instanceof Date ? row[iDate] : parseDate(row[iDate]);
    if (!d) return;
    const v = parseFloat(row[col]);
    if (!isFinite(v)) return;
    const inPromo = hist.some(h => d >= h.start && d <= h.end);
    if (inPromo) promoPts.push(v); else basePts.push(v);
  });
  if (promoPts.length < 2 || basePts.length < 4) return null;
  const mb = mean(basePts);
  if (mb <= 0) return null;
  return round2((mean(promoPts) / mb - 1) * 100);
}

function parseHierarchySheet(workbook) {
  return sheetRows(workbook, ['gerarch', 'hierarch', 'famigl']).map(r => ({
    family: String(colPick(r, ['famiglia', 'family', 'padre'])).trim(),
    product: String(colPick(r, ['prodotto', 'figlio', 'sku', 'series', 'serie'])).trim()
  })).filter(r => r.family && r.product);
}

function parseSubstitutionSheet(workbook) {
  return sheetRows(workbook, ['sostitu', 'phase', 'switch']).map(r => ({
    nuovo: String(colPick(r, ['nuovo', 'new', 'successore'])).trim(),
    vecchio: String(colPick(r, ['vecchio', 'old', 'predecessore'])).trim(),
    fattore: parseFloat(String(colPick(r, ['fattore', 'factor', 'ratio'])).replace(',', '.')) || 1,
    months: Math.max(1, parseInt(colPick(r, ['mesi_passaggio', 'mesi', 'months', 'durata']), 10) || 1),
    startRaw: colPick(r, ['data_inizio', 'inizio', 'start', 'dal']),
    cliente: String(colPick(r, ['cliente', 'customer', 'insegna', 'cliente_nuovo', 'cliente_target'])).trim(),
    origine: String(colPick(r, ['cliente_origine', 'origine', 'analog', 'da_cliente', 'source'])).trim()
  })).filter(r => r.nuovo && r.vecchio);
}

function parsePromoPct(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  let n = parseFloat(String(raw).replace('%', '').replace(',', '.'));
  if (!isFinite(n)) return 0;
  if (Math.abs(n) <= 1 && String(raw).indexOf('%') === -1) n = n * 100;
  return n;
}

function parsePromoSheet(workbook) {
  return sheetRows(workbook, ['promo', 'promozion', 'sconti', 'offert'], ['stor', 'passat']).map(r => {
    const start = parseDate(colPick(r, ['data_inizio', 'dal', 'inizio', 'start', 'data']));
    const end = parseDate(colPick(r, ['data_fine', 'al', 'fine', 'end', 'scadenza'])) || start;
    const sconto = parsePromoPct(colPick(r, ['sconto', 'discount', 'perc_sconto']));
    let uplift = parsePromoPct(colPick(r, ['uplift', 'effetto', 'lift', 'impatto', 'variazione']));
    if (!uplift && sconto) uplift = sconto;
    return {
      prodotto: String(colPick(r, ['prodotto', 'sku', 'articolo', 'series', 'serie'])).trim(),
      cliente: String(colPick(r, ['cliente', 'customer', 'insegna', 'buyer'])).trim(),
      start,
      end,
      sconto,
      uplift,
      source: uplift ? 'file' : ''
    };
  }).filter(p => p.prodotto && p.start);
}

function namesMatch(seriesName, product, cliente) {
  const s = String(seriesName).toLowerCase();
  const p = String(product).toLowerCase();
  if (!s || !p) return false;
  if (cliente) {
    const c = String(cliente).toLowerCase();
    return (s === p || s.indexOf(p) !== -1) && s.indexOf(c) !== -1;
  }
  return s === p || s.indexOf(p) !== -1 || p.indexOf(s) !== -1;
}

function applyPromos(results) {
  const promos = (workbookData.promos || []).slice();
  const notes = [];
  if (!promos.length) return notes;
  const lineOnly = isPro() && !isProMax();
  let hits = 0;
  let missing = 0;
  promos.forEach(pr => {
    if (lineOnly && pr.cliente) {
      pr.skip = true;
      return;
    }
    if (!pr.uplift) {
      const est = isProMax() ? historicalUplift(pr.prodotto, pr.cliente) : null;
      if (est != null) {
        pr.uplift = est;
        pr.source = 'storico';
      } else {
        missing++;
        pr.skip = true;
      }
    }
  });
  results.forEach(r => {
    if (!r.forecast) return;
    r.forecast.forEach((pt, i) => {
      let m = 1;
      promos.forEach(pr => {
        if (pr.skip || !pr.uplift) return;
        if (lineOnly && pr.cliente) return;
        if (!namesMatch(r.name, pr.prodotto, pr.cliente)) return;
        if (pt.date < pr.start) return;
        if (pr.end && pt.date > pr.end) return;
        m *= (1 + pr.uplift / 100);
        hits++;
      });
      if (m !== 1) {
        pt.value = round2(pt.value * m);
        if (r.scenarioA && r.scenarioA[i]) r.scenarioA[i].value = round2(r.scenarioA[i].value * m);
      }
    });
  });
  notes.push('Promozioni: ' + promos.filter(p => !p.skip).length + ' usate, ' + hits + ' periodi toccati.');
  if (missing) notes.push(missing + ' promo senza Uplift e senza storico sufficiente: ignorate. Indica l’effetto % oppure carica Promo_storico.');
  if (lineOnly) notes.push('Piano Pro: le promo con Cliente sono ignorate (servono ProMax).');
  return notes;
}

function findSeries(list, name) {
  const n = String(name).toLowerCase();
  return list.find(s => String(s.name).toLowerCase() === n);
}

function seriesForProduct(list, product) {
  const p = String(product).toLowerCase().trim();
  return (list || []).filter(s => {
    const n = String(s.name).toLowerCase();
    if (n === p) return true;
    if (n.indexOf(p + ' · ') === 0) return true;
    if (n.indexOf(p + ' - ') === 0) return true;
    const left = n.split(' · ')[0];
    return left === p;
  });
}

function seriesLabel(product, cliente) {
  return cliente ? (product + ' · ' + cliente) : product;
}

function resolvePairSeries(list, product, cliente) {
  if (cliente) {
    return findSeries(list, seriesLabel(product, cliente)) || findSeries(list, product);
  }
  return findSeries(list, product);
}

function findSeriesPair(list, product, cliente) {
  if (cliente) return findSeries(list, seriesLabel(product, cliente)) || findSeries(list, product);
  const kids = list.filter(s => String(s.name).toLowerCase().indexOf(String(product).toLowerCase() + ' · ') === 0);
  if (kids.length) return null;
  return findSeries(list, product);
}

function firstPositiveDate(points) {
  const hit = (points || []).find(p => p.value > 0);
  return hit ? hit.date : null;
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function phaseShareOnDate(start, date, months) {
  if (!start) return Math.min(1, 1 / months);
  const k = monthsBetween(start, date) + 1;
  if (k <= 0) return 0;
  return Math.max(0, Math.min(1, k / months));
}

function applyPredecessorPadding(seriesData) {
  const warnings = [];
  const notes = [];
  const rules = workbookData.substitutions || [];
  rules.forEach(rule => {
    const analog = !!(rule.origine && rule.origine !== rule.cliente);
    const neu = resolvePairSeries(seriesData, rule.nuovo, rule.cliente);
    const old = resolvePairSeries(seriesData, rule.vecchio, rule.origine || rule.cliente);
    if (!neu || !old) {
      if (analog && !neu) {
        notes.push('Phase-in ' + seriesLabel(rule.nuovo, rule.cliente) + ' saltato: quella serie non c’è nel file (manca il cliente ' + rule.cliente + ').');
      } else if (!analog) {
        notes.push('Sostituzione ' + rule.vecchio + ' → ' + rule.nuovo + ': manca una delle due serie tra quelle selezionate.');
      }
      return;
    }
    const oldMap = {};
    old.points.forEach(p => { oldMap[p.date.getTime()] = p.value; });
    neu.modelPoints = neu.points.map(p => {
      if (p.value > 0) return { date: p.date, value: p.value };
      const ov = oldMap[p.date.getTime()];
      if (ov != null) return { date: p.date, value: round2(ov * rule.fattore), fromPred: true };
      return { date: p.date, value: 0 };
    });
    const filled = neu.modelPoints.filter(p => p.fromPred).length;
    if (filled) {
      notes.push(rule.nuovo + ': i mesi a 0 (prima del lancio) nello storico di modello usano ' + rule.vecchio + ' × ' + rule.fattore + ' (' + filled + ' mesi). Non è un errore.');
    }
  });
  return { warnings, notes };
}

function trimLeadingZeros(points) {
  let i = 0;
  while (i < points.length && Number(points[i].value) <= 0) i++;
  if (i >= points.length) return points.slice(-6);
  return points.slice(i);
}

function buildLineHistory(oldS, newS, factor) {
  const map = {};
  (oldS.points || []).forEach(p => {
    map[p.date.getTime()] = { date: p.date, old: p.value, neu: 0 };
  });
  (newS.points || []).forEach(p => {
    const k = p.date.getTime();
    map[k] = map[k] || { date: p.date, old: 0, neu: 0 };
    map[k].neu = p.value;
  });
  return Object.keys(map).map(Number).sort((a, b) => a - b).map(k => {
    const row = map[k];
    return { date: row.date, value: row.old + (row.neu / (factor || 1)) };
  });
}

function applyPhaseInOut(results, seriesData, nPeriods, algo, win) {
  const rules = workbookData.substitutions || [];
  if (!rules.length) return results;
  rules.forEach(rule => {
    const newS = resolvePairSeries(seriesData, rule.nuovo, rule.cliente);
    const oldS = resolvePairSeries(seriesData, rule.vecchio, rule.origine || rule.cliente);
    let rNew = findSeries(results, seriesLabel(rule.nuovo, rule.cliente)) || findSeries(results, rule.nuovo);
    const rOld = findSeries(results, seriesLabel(rule.vecchio, rule.origine || rule.cliente)) || findSeries(results, rule.vecchio);
    if (!oldS) return;
    if (!rNew && rOld && rule.cliente) {
      rNew = {
        name: seriesLabel(rule.nuovo, rule.cliente),
        historical: [],
        forecast: rOld.forecast.map(p => ({ date: p.date, value: 0 })),
        scenarioA: rOld.forecast.map(p => ({ date: p.date, value: 0 })),
        extras: [],
        outliers: [],
        notes: ['Serie creata dal phase-in: nessun storico su questo cliente.']
      };
      results.push(rNew);
    }
    if (!rNew && !rOld) return;
    const analog = !!(rule.origine && rule.origine !== rule.cliente);
    const donorNew = newS || { points: [] };
    const line = buildLineHistory(oldS, analog ? { points: [] } : donorNew, analog ? 1 : rule.fattore);
    const live = trimLeadingZeros(line);
    if (live.length < 4) return;
    const values = live.map(p => p.value);
    const dates = live.map(p => p.date);
    const season = inferSeasonLength(dates);
    const rawFc = runAlgoOnValues(values, season, nPeriods, algo, win);
    const recentAvg = values.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, values.length);
    const fc = rawFc.map(v => round2(Math.max(v, recentAvg * 0.6)));
    const lastDate = dates[dates.length - 1];
    const parsedStart = rule.startRaw ? parseDate(rule.startRaw) : null;
    const tailOld = (oldS.points || []).slice(-3);
    const tailNew = (newS.points || []).slice(-3);
    const sumOld = tailOld.reduce((a, p) => a + p.value, 0);
    const sumNew = tailNew.reduce((a, p) => a + p.value, 0);
    const lineNow = sumOld + sumNew / (rule.fattore || 1);
    let shareNow = lineNow > 0 ? (sumNew / (rule.fattore || 1)) / lineNow : 0;
    if (shareNow > 0.85) shareNow = 1;
    if (shareNow < 0.05) shareNow = 0;

    const template = (rNew || rOld).forecast;
    for (let i = 0; i < template.length; i++) {
      const d = template[i].date || new Date(lastDate.getFullYear(), lastDate.getMonth() + i + 1, 1);
      let sn = parsedStart
        ? phaseShareOnDate(parsedStart, d, rule.months)
        : Math.min(1, shareNow + (1 - shareNow) * ((i + 1) / rule.months));
      sn = Math.max(sn, shareNow);
      const lineFc = fc[i];
      if (analog) {
        if (rNew) rNew.forecast[i].value = round2(lineFc * sn * (rule.fattore || 1));
        if (rNew && rNew.scenarioA && rNew.scenarioA[i]) rNew.scenarioA[i].value = rNew.forecast[i].value;
      } else {
        if (rNew) rNew.forecast[i].value = round2(lineFc * sn * rule.fattore);
        if (rOld) rOld.forecast[i].value = round2(lineFc * (1 - sn));
        if (rNew && rNew.scenarioA && rNew.scenarioA[i]) rNew.scenarioA[i].value = rNew.forecast[i].value;
        if (rOld && rOld.scenarioA && rOld.scenarioA[i]) rOld.scenarioA[i].value = rOld.forecast[i].value;
      }
    }

    const s0 = parsedStart && template[0]
      ? phaseShareOnDate(parsedStart, template[0].date, rule.months)
      : Math.min(1, shareNow + (1 - shareNow) / rule.months);
    const note = 'Switch ' + seriesLabel(rule.vecchio, rule.origine || rule.cliente) +
      ' → ' + seriesLabel(rule.nuovo, rule.cliente) +
      ': mix ultimi mesi = nuovo ' + Math.round(shareNow * 100) +
      '%. Fattore ' + rule.fattore +
      (rule.origine ? ('. Analogia da ' + rule.origine) : '') + '.';
    if (rNew) rNew.notes = (rNew.notes || []).concat([note]);
    if (rOld) rOld.notes = (rOld.notes || []).concat([note]);

    const famName = 'Famiglia: Linea_Switch';
    const rFam = results.find(r => r.name === famName) ||
      results.find(r => String(r.name).toLowerCase().includes('linea_switch'));
    if (rFam && rNew && rOld) {
      rFam.forecast.forEach((p, i) => {
        p.value = round2((rNew.forecast[i] ? rNew.forecast[i].value : 0) + (rOld.forecast[i] ? rOld.forecast[i].value : 0));
      });
    }
  });
  return results;
}

function computeMix(children, mode) {
  const totals = {};
  children.forEach(ch => { totals[ch.name] = 0; });
  if (mode === 'seasonal') {
    const byMonth = {};
    children.forEach(ch => {
      ch.points.forEach(p => {
        const m = p.date.getMonth();
        byMonth[m] = byMonth[m] || {};
        byMonth[m][ch.name] = (byMonth[m][ch.name] || 0) + p.value;
      });
    });
    return { type: 'seasonal', byMonth };
  }
  children.forEach(ch => {
    const last = ch.points.slice(-12);
    totals[ch.name] = last.reduce((a, p) => a + p.value, 0);
  });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const share = {};
  Object.keys(totals).forEach(k => { share[k] = totals[k] / sum; });
  return { type: 'recent', share };
}

function mixAt(mix, name, date) {
  if (mix.type === 'recent') return mix.share[name] || 0;
  const m = date.getMonth();
  const slot = mix.byMonth[m] || {};
  const sum = Object.values(slot).reduce((a, b) => a + b, 0) || 1;
  return (slot[name] || 0) / sum;
}

function runAlgoOnValues(values, season, nPeriods, algo, win) {
  if (algo === 'seasonal') return seasonalNaiveForecast(values, season, nPeriods);
  if (algo === 'moving-average') return seasonalMovingAverageForecast(values, season, win, nPeriods);
  if (algo === 'exp-smoothing') return expSmoothingForecast(values, nPeriods, season);
  if (algo === 'holt-winters') return holtWintersForecast(values, season, nPeriods);
  if (algo === 'hw-mult') return holtWintersMultForecast(values, season, nPeriods);
  if (algo === 'damped') return dampedTrendForecast(values, season, nPeriods);
  if (algo === 'momentum') return momentumSeasonForecast(values, season, nPeriods);
  if (algo === 'arima') return arimaForecast(values, season, nPeriods);
  if (algo === 'prophet') return prophetLikeForecast(values, season, nPeriods);
  if (algo === 'optimistic') return bandForecast(values, season, nPeriods, 1);
  if (algo === 'pessimistic') return bandForecast(values, season, nPeriods, -1);
  if (algo === 'compare') return compareModels(values, season, win, nPeriods).forecast;
  return linearRegressionForecast(values, nPeriods, season);
}

function applyFamilyTopDown(results, seriesData, nPeriods, algo, win) {
  const notes = [];
  const hier = workbookData.hierarchy || [];
  if (!hier.length) {
    notes.push('Nessun foglio Gerarchia trovato: disaggregazione saltata.');
    return { results, notes };
  }
  const byFam = {};
  hier.forEach(h => {
    byFam[h.family] = byFam[h.family] || [];
    byFam[h.family].push(h.product);
  });
  const mode = document.getElementById('mix-mode')?.value || 'recent';
  const extraResults = [];
  Object.keys(byFam).forEach(fam => {
    const children = [];
    const seen = {};
    byFam[fam].forEach(prod => {
      seriesForProduct(seriesData, prod).forEach(s => {
        if (!seen[s.name]) { seen[s.name] = 1; children.push(s); }
      });
    });
    if (children.length < 2) {
      notes.push('Famiglia ' + fam + ': servono almeno 2 serie selezionate. Cerco i prodotti del foglio Gerarchia anche se le colonne si chiamano “Prodotto · Cliente”.');
      return;
    }
    const dateMap = {};
    children.forEach(ch => {
      ch.points.forEach(p => {
        const k = p.date.getTime();
        dateMap[k] = dateMap[k] || { date: p.date, value: 0 };
        dateMap[k].value += p.value;
      });
    });
    const famPoints = Object.keys(dateMap).map(Number).sort((a, b) => a - b).map(k => dateMap[k]);
    if (famPoints.length < 6) return;
    let values = famPoints.map(p => p.value);
    const dates = famPoints.map(p => p.date);
    const season = inferSeasonLength(dates);
    let famOutliers = [];
    let famNote = 'Top-down su famiglia ' + fam + '. Mix: ' + (mode === 'seasonal' ? 'stagionale' : 'ultimi 12 mesi') + '.';
    const cleaned = applyOutliers('Famiglia: ' + fam, values, dates, season);
    values = cleaned.values;
    famOutliers = cleaned.items;
    if (cleaned.applied) famNote += ' ' + cleaned.applied + ' outlier famiglia sostituiti.';
    else if (cleaned.items.length) famNote += ' ' + cleaned.items.length + ' punti famiglia da rivedere.';
    const famCmp = compareModels(values, season, win, nPeriods);
    const fc = (algo === 'compare') ? famCmp.forecast : runAlgoOnValues(values, season, nPeriods, algo, win);
    const lastDate = dates[dates.length - 1];
    const gap = workbookData.gapDays || gapDaysFromDates(dates);
    const futureDates = [];
    for (let i = 1; i <= nPeriods; i++) futureDates.push(addPeriods(lastDate, i, gap));
    const mix = computeMix(children, mode);
    extraResults.push({
      name: 'Famiglia: ' + fam,
      historical: famPoints,
      forecast: futureDates.map((d, i) => ({ date: d, value: fc[i] })),
      scenarioA: futureDates.map((d, i) => ({ date: d, value: isPro() ? applyDriverScenario(fc)[i] : fc[i] })),
      extras: [],
      outliers: famOutliers,
      compare: famCmp,
      chosen: algo === 'compare' ? famCmp.best : algo,
      notes: [famNote]
    });
    children.forEach(ch => {
      const res = findSeries(results, ch.name);
      if (!res) return;
      res.forecast = res.forecast.map((p, i) => ({
        date: p.date,
        value: round2(fc[i] * mixAt(mix, ch.name, p.date))
      }));
      res.notes = (res.notes || []).concat(['Disaggregato da famiglia ' + fam + '.']);
    });
  });
  if (!extraResults.length) {
    notes.push('Nessuna riga “Famiglia: …” creata. Seleziona i figli (anche Prodotto · Cliente) e controlla che in Gerarchia i nomi prodotto coincidano.');
  }
  return { results: extraResults.concat(results), notes };
}

function parseDate(val) {
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'number' && isFinite(val)) {
    if (val > 20000 && val < 80000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(date.getTime()) ? null : date;
    }
  }
  const raw = String(val).trim();
  if (!raw || raw.length > 40) return null;
  const iso = new Date(raw);
  if (!isNaN(iso.getTime()) && /\d/.test(raw)) return iso;
  const parts = raw.split(/[\/\-\.]/);
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
    const d2 = parts[2].length === 4
      ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
      : new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function applyModelToSeries(seriesName, modelName) {
  if (!forecastResults || !lastSeriesData) return;
  const wantBest = !modelName || modelName === '__bestfit__';
  if (wantBest) delete seriesAlgoOverride[seriesName];
  else seriesAlgoOverride[seriesName] = modelName;
  const serie = lastSeriesData.find(s => s.name === seriesName);
  const res = forecastResults.find(r => r.name === seriesName);
  if (!serie || !res) {
    alert('Su questa riga (famiglia) il modello si sceglie dalle serie figlie, non dalla famiglia.');
    return;
  }
  const nPeriods = parseInt(document.getElementById('periods').value, 10) || res.forecast.length;
  const win = parseInt(document.getElementById('window-size').value, 10) || 3;
  const src = serie.modelPoints || serie.points;
  let values = src.map(p => p.value);
  const dates = src.map(p => p.date);
  const season = inferSeasonLength(dates);
  const cmp = compareModels(values, season, win, nPeriods);
  let fc;
  const cached = lastServerFits[seriesName];
  if (cached && modelName && String(modelName).indexOf('Server') === 0 && cached.by_name && cached.by_name[modelName]) {
    fc = cached.by_name[modelName];
  } else if (cached && (wantBest || modelName === cached.best) && cached.forecast) {
    fc = cached.forecast;
  } else if (cmp.builders && cmp.builders[modelName]) {
    fc = cmp.builders[modelName]();
  } else {
    fc = wantBest ? cmp.forecast : (res.forecast || []).map(p => p.value);
  }
  fc = continueDecline(values, fc);
  res.forecast = res.forecast.map((p, i) => ({ date: p.date, value: fc[i] != null ? fc[i] : p.value }));
  const mergedRows = ((cmp.rows || []).concat((cached && cached.rows) || []));
  mergedRows.sort((a, b) => (a.mase || 999) - (b.mase || 999));
  const seen = {};
  const rows = mergedRows.filter(r => {
    if (seen[r.name]) return false;
    seen[r.name] = 1;
    return true;
  });
  res.compare = Object.assign({}, cmp, { rows: rows, best: rows[0] ? rows[0].name : cmp.best });
  res.chosen = wantBest ? ((cached && cached.best) || cmp.best) : modelName;
  res.notes = (res.notes || []).filter(n => n.indexOf('Modello scelto') === -1);
  if (!wantBest) res.notes.push('Modello scelto a mano su questa serie: ' + modelName + '.');
  else res.notes.push('Best fit ripristinato su questa serie: ' + cmp.best + '.');
  applyPromos([res]);
  syncScenarioA([res]);
  renderResults(res);
  renderOutlierTable(seriesName);
}

// ===== RENDER RISULTATI =====
function renderResults(result) {
  // Chart
  const ctx = document.getElementById('forecast-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const histLabels = result.historical.map(p => formatDate(p.date));
  const histValues = result.historical.map(p => p.value);
  const forecastLabels = result.forecast.map(p => formatDate(p.date));
  const forecastValues = result.forecast.map(p => p.value);

  const datasets = [
        {
          label: 'Storico',
          data: [...histValues, ...Array(forecastValues.length).fill(null)],
          borderColor: '#2563eb',
          fill: false,
          tension: 0.2,
          pointRadius: 3
        },
        {
          label: 'Base',
          data: [...Array(histValues.length).fill(null), ...forecastValues],
          borderColor: '#059669',
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 3
        }
  ];
  if (result.scenarioA) {
    const a = result.scenarioA.map(p => p.value);
    const same = a.every((v, i) => v === forecastValues[i]);
    if (!same) {
      datasets.push({
        label: collectDrivers().length ? 'Senza variabili' : 'Scenario A (variabile)',
        data: [...Array(histValues.length).fill(null), ...a],
        borderColor: '#d97706',
        borderDash: [2, 3],
        fill: false,
        tension: 0.2,
        pointRadius: 3
      });
    }
  }
  const palette = ['#7c3aed', '#db2777', '#0f766e', '#ea580c', '#4338ca'];
  (result.extras || []).forEach((ex, idx) => {
    datasets.push({
      label: ex.name,
      data: [...Array(histValues.length).fill(null), ...ex.values],
      borderColor: palette[idx % palette.length],
      borderDash: [8, 3],
      fill: false,
      tension: 0.2,
      pointRadius: 3
    });
  });

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...histLabels, ...forecastLabels],
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: {
          display: true,
          text: result.name,
          font: { size: 16, weight: '600' }
        }
      },
      scales: {
        y: { beginAtZero: false }
      }
    }
  });

  const box = document.getElementById('compare-box');
  if (box) {
    if (result.compare && result.compare.rows) {
      box.style.display = 'block';
      box.innerHTML = '<h3>Best fit (MASE) — ' + result.name + '</h3><p>MASE più basso = meglio. Il primo in lista è il migliore; a volte il best fit è la media dei due più vicini. Ora in uso: <strong>' +
        (result.chosen || result.compare.best) + '</strong>.</p>' +
        '<p><button type="button" class="btn btn-secondary btn-apply-model" data-model="__bestfit__">Ripristina best fit</button></p>' +
        '<table><thead><tr><th>Modello</th><th>MASE</th><th>MAPE %</th><th></th></tr></thead><tbody>' +
        result.compare.rows.map((r, i) => '<tr><td>' + r.name + (i === 0 ? ' <em>(1° MASE)</em>' : '') + '</td><td>' + r.mase + '</td><td>' + r.mape +
          '</td><td><button type="button" class="btn btn-text btn-apply-model" data-model="' + r.name + '">Usa su questa serie</button></td></tr>').join('') +
        '</tbody></table>' +
        (result.notes && result.notes.length ? '<ul>' + result.notes.map(n => '<li>' + n + '</li>').join('') + '</ul>' : '');
      box.querySelectorAll('.btn-apply-model').forEach(btn => {
        btn.addEventListener('click', () => applyModelToSeries(result.name, btn.getAttribute('data-model')));
      });
    } else if (result.notes && result.notes.length) {
      box.style.display = 'block';
      box.innerHTML = '<h3>Scenari</h3><ul>' + result.notes.map(n => '<li>' + n + '</li>').join('') + '</ul>';
    } else {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  // Tabella
  const tbody = document.querySelector('#results-table tbody');
  tbody.innerHTML = '';

  const extras = result.extras || [];
  const extraHeads = extras.map(e => e.name).join('</th><th>');
  const thead = document.querySelector('#results-table thead tr');
  if (thead) {
    thead.innerHTML = isPro()
      ? '<th>Data</th><th>Storico</th><th>Base</th><th>Scenario A</th>' + (extraHeads ? '<th>' + extraHeads + '</th>' : '')
      : '<th>Data</th><th>Valore Storico</th><th>Previsione</th>';
  }

  result.historical.forEach(p => {
    const tr = document.createElement('tr');
    const extraEmpty = extras.map(() => '<td>—</td>').join('');
    tr.innerHTML = isPro()
      ? `<td>${formatDate(p.date)}</td><td>${p.value.toLocaleString('it-IT')}</td><td>—</td><td>—</td>${extraEmpty}`
      : `<td>${formatDate(p.date)}</td><td>${p.value.toLocaleString('it-IT')}</td><td>—</td>`;
    tbody.appendChild(tr);
  });

  result.forecast.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.style.background = '#f0fdf4';
    const a = result.scenarioA ? result.scenarioA[i].value.toLocaleString('it-IT') : '';
    const extraCells = extras.map(e => '<td>' + e.values[i].toLocaleString('it-IT') + '</td>').join('');
    tr.innerHTML = isPro()
      ? `<td>${formatDate(p.date)}</td><td>—</td><td><strong>${p.value.toLocaleString('it-IT')}</strong></td><td>${a}</td>${extraCells}`
      : `<td>${formatDate(p.date)}</td><td>—</td><td><strong>${p.value.toLocaleString('it-IT')}</strong></td>`;
    tbody.appendChild(tr);
  });
}

function outlierKey(series, index) {
  return series + '|' + index;
}

function outlierVisible(o, focus) {
  if (!focus) return true;
  if (o.series === focus) return true;
  if (String(focus).indexOf('Famiglia: ') === 0) {
    const fam = String(focus).slice(10).trim().toLowerCase();
    if (String(o.series).toLowerCase() === String(focus).toLowerCase()) return true;
    const products = ((workbookData && workbookData.hierarchy) || [])
      .filter(h => String(h.family).toLowerCase() === fam)
      .map(h => String(h.product).toLowerCase());
    const n = String(o.series).toLowerCase();
    return products.some(p => n === p || n.indexOf(p + ' · ') === 0);
  }
  if (String(focus).indexOf(' · ') === -1) {
    const p = String(focus).toLowerCase();
    const n = String(o.series).toLowerCase();
    return n === p || n.indexOf(p + ' · ') === 0;
  }
  return false;
}

function renderOutlierTable(focus) {
  const box = document.getElementById('outlier-box');
  if (!box) return;
  const rows = lastOutliers.filter(o => outlierVisible(o, focus));
  if (!rows.length) {
    box.style.display = lastOutliers.length ? 'block' : 'none';
    box.innerHTML = lastOutliers.length
      ? '<h3>Outlier</h3><p>Nessun outlier su <strong>' + focus + '</strong>. Cambia serie nel menu per vederne altri.</p>'
      : '';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = '<h3>Outlier di ' + focus + '</h3><p>Solo la serie (o famiglia) che stai guardando. Poi ricalcola.</p>' +
    '<table><thead><tr><th>Serie</th><th>Data</th><th>Originale</th><th>Proposto</th><th>Scelta</th></tr></thead><tbody>' +
    rows.map((o) => {
      const i = lastOutliers.indexOf(o);
      const key = outlierKey(o.series, o.index);
      const keep = outlierDecisions[key] === 'keep';
      return '<tr><td>' + o.series + '</td><td>' + formatDate(o.date) + '</td><td>' +
        o.original.toLocaleString('it-IT') + '</td><td>' + o.suggested.toLocaleString('it-IT') +
        '</td><td><label><input type="radio" name="outidx-' + i + '" value="clean" ' + (!keep ? 'checked' : '') + '> Pulisci</label> ' +
        '<label><input type="radio" name="outidx-' + i + '" value="keep" ' + (keep ? 'checked' : '') + '> Tieni originale</label></td></tr>';
    }).join('') +
    '</tbody></table><p><button type="button" class="btn btn-secondary" id="btn-recalc-outliers">Ricalcola con le mie scelte</button></p>';
  document.getElementById('btn-recalc-outliers')?.addEventListener('click', () => {
    lastOutliers.forEach((o, i) => {
      const key = outlierKey(o.series, o.index);
      const sel = document.querySelector('input[name="outidx-' + i + '"]:checked');
      if (sel) outlierDecisions[key] = sel.value;
    });
    document.getElementById('btn-calculate')?.click();
  });
}

function formatDate(d) {
  if (!(d instanceof Date)) return String(d);
  const g = (workbookData && workbookData.gapDays) || 30;
  if (g <= 10) {
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'short' });
}

// ===== DOWNLOAD EXCEL =====
btnDownload.addEventListener('click', () => {
  if (!forecastResults) return;

  const wb = XLSX.utils.book_new();

  const usedNames = {};
  forecastResults.forEach(result => {
    try {
      const extras = result.extras || [];
      const headers = isPro()
        ? ['Data', 'Storico', 'Base', 'Scenario A', ...extras.map(e => e.name), 'Modifiche dipartimento Sales']
        : ['Data', 'Valore Storico', 'Previsione', 'Modifiche dipartimento Sales'];
      const data = [headers];
      (result.historical || []).forEach(p => {
        data.push(isPro()
          ? [formatDate(p.date), p.value, '', '', ...extras.map(() => ''), '']
          : [formatDate(p.date), p.value, '', '']);
      });
      (result.forecast || []).forEach((p, i) => {
        const a = result.scenarioA && result.scenarioA[i] ? result.scenarioA[i].value : '';
        const extraVals = extras.map(e => (e.values && e.values[i] != null) ? e.values[i] : '');
        data.push(isPro()
          ? [formatDate(p.date), '', p.value, a, ...extraVals, '']
          : [formatDate(p.date), '', p.value, '']);
      });

      const ws = XLSX.utils.aoa_to_sheet(data);
      let sheetName = String(result.name || 'Previsione')
        .replace(/[:\\\/\?\*\[\]]/g, '-')
        .substring(0, 28)
        .trim() || 'Previsione';
      if (usedNames[sheetName]) {
        usedNames[sheetName] += 1;
        sheetName = (sheetName + '_' + usedNames[sheetName]).substring(0, 31);
      } else {
        usedNames[sheetName] = 1;
      }
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    } catch (err) {
      console.error('Foglio Excel saltato', result && result.name, err);
    }
  });

  try {
    XLSX.writeFile(wb, 'previsione_demand_planning_hub.xlsx');
  } catch (err) {
    console.error(err);
    alert('Non riesco a scaricare l’Excel. Riprova dopo aver ricalcolato la previsione.');
  }
});

function isoDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return String(d).slice(0, 10);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return x.getFullYear() + '-' + m + '-' + day;
}

function serializeForecastPayload() {
  return {
    saved_at: new Date().toISOString(),
    tier: currentTier(),
    periods: parseInt((document.getElementById('periods') || {}).value) || 12,
    algorithm: (document.getElementById('algorithm') || {}).value || 'compare',
    series: (forecastResults || []).map(r => ({
      name: r.name,
      chosen: r.chosen || '',
      forecast: (r.forecast || []).map(p => ({ date: isoDay(p.date), value: p.value })),
      history: (r.historical || []).map(p => ({ date: isoDay(p.date), value: p.value })),
      scenarioA: (r.scenarioA || []).map(p => ({ date: isoDay(p.date), value: p.value })),
      extras: r.extras || [],
      outliers: (r.outliers || []).map(o => ({
        series: o.series || r.name,
        date: isoDay(o.date),
        original: o.original,
        suggested: o.suggested,
        index: o.index
      })),
      compare: r.compare || null,
      notes: r.notes || []
    }))
  };
}

function parseDay(s) {
  if (s instanceof Date) return s;
  const p = String(s).slice(0, 10).split('-');
  if (p.length === 3) return new Date(+p[0], +p[1] - 1, +p[2]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function restoreForecastView(payload) {
  const series = (payload && payload.series) || [];
  if (!series.length) {
    alert('Questa previsione non ha dati da riaprire. Ricalcola e salva di nuovo.');
    return;
  }
  if (payload.tier === 'pro' || payload.tier === 'promax') setTier(payload.tier);
  else setTier('promax');
  applyProUi();

  lastSeriesData = series.map((s) => {
    const points = (s.history || []).map((p) => ({ date: parseDay(p.date), value: Number(p.value) }));
    return { name: s.name, points: points, modelPoints: points };
  });
  selectedSeries = lastSeriesData.map((s, i) => ({ name: s.name, index: i + 1 }));

  const nPeriods = payload.periods || ((series[0] && series[0].forecast && series[0].forecast.length) || 12);
  const per = document.getElementById('periods');
  if (per) per.value = nPeriods;
  if (algorithm) algorithm.value = payload.algorithm || 'compare';

  forecastResults = series.map((s) => {
    const hist = (s.history || []).map((p) => ({ date: parseDay(p.date), value: Number(p.value) }));
    const fc = (s.forecast || []).map((p) => ({ date: parseDay(p.date), value: Number(p.value) }));
    const scen = (s.scenarioA || []).map((p) => ({ date: parseDay(p.date), value: Number(p.value) }));
    let compare = s.compare && s.compare.rows ? { rows: s.compare.rows, best: s.compare.best || s.chosen } : null;
    if (!compare && hist.length >= 8) {
      const values = hist.map((p) => p.value);
      const season = inferSeasonLength(hist.map((p) => p.date));
      compare = compareModels(values, season, 3, fc.length || nPeriods);
    }
    return {
      name: s.name,
      chosen: s.chosen || (compare && compare.best) || '',
      historical: hist,
      forecast: fc,
      scenarioA: scen.length ? scen : fc.slice(),
      extras: s.extras || [],
      outliers: (s.outliers || []).map((o) => ({ ...o, date: parseDay(o.date), series: o.series || s.name })),
      compare: compare,
      notes: (s.notes || []).concat(['Valori della previsione salvata. Se cambi modello o outlier, ricalcoli.'])
    };
  });

  lastOutliers = forecastResults.flatMap((r) => (r.outliers || []).map((o) => ({ ...o, series: r.name })));
  if (!lastOutliers.length && isPro()) {
    forecastResults.forEach((r) => {
      const values = r.historical.map((p) => p.value);
      const dates = r.historical.map((p) => p.date);
      const season = inferSeasonLength(dates);
      const cleaned = applyOutliers(r.name, values, dates, season);
      r.outliers = cleaned.items || [];
    });
    lastOutliers = forecastResults.flatMap((r) => (r.outliers || []).map((o) => ({ ...o, series: r.name })));
  }

  startApp();
  const up = document.getElementById('step-upload');
  const cols = document.getElementById('step-columns');
  const cfg = document.getElementById('step-config');
  const results = document.getElementById('step-results');
  if (up) up.style.display = 'none';
  if (cols) cols.style.display = 'none';
  if (cfg) cfg.style.display = 'none';
  if (results) results.style.display = 'block';
  populateSeriesPicker();
  if (forecastResults[0]) {
    renderResults(forecastResults[0]);
    renderOutlierTable(forecastResults[0].name);
  }
  window.scrollTo({ top: (results || document.body).offsetTop - 80, behavior: 'smooth' });
}

async function tryOpenSavedForecast() {
  if (/(?:\?|&)go=upload(?:&|$)/.test(location.search) || location.hash === '#upload') startApp();
  const m = /forecast=(\d+)/.exec(location.search);
  if (!m) return;
  const tok = localStorage.getItem('dph_token');
  if (!tok) {
    window.location.href = 'area.html';
    return;
  }
  const res = await fetch('/api/forecasts/' + m[1], { headers: { Authorization: 'Bearer ' + tok } });
  if (!res.ok) {
    alert('Non trovo questa previsione.');
    return;
  }
  const f = await res.json();
  restoreForecastView(f.payload || {});
}

async function updateAuthNav() {
  const a = document.getElementById('nav-account');
  if (!a) return;
  const tok = localStorage.getItem('dph_token');
  if (!tok) {
    a.textContent = 'Accedi';
    a.href = 'area.html';
    return;
  }
  try {
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + tok } });
    if (!res.ok) throw new Error('no');
    const me = await res.json();
    a.textContent = me.azienda ? ('Area · ' + me.azienda) : 'Area aziendale';
    a.href = 'area.html';
  } catch (e) {
    a.textContent = 'Accedi';
    a.href = 'area.html';
  }
}
updateAuthNav();
tryOpenSavedForecast();

async function postFormApi(url, fields) {
  const fd = new FormData();
  Object.keys(fields).forEach(k => fd.append(k, fields[k]));
  const res = await fetch(url, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || 'Errore ' + res.status);
  return body;
}

async function saveForecastToServer(token) {
  const payload = JSON.stringify(serializeForecastPayload());
  const fd = new FormData();
  fd.append('title', 'Previsione ' + new Date().toLocaleString('it-IT'));
  fd.append('payload', payload);
  const res = await fetch('/api/forecasts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || 'Salvataggio non riuscito');
  let extra = '';
  if (body.mape_n) extra = '\nMAPE sulla previsione precedente: ' + body.mape_previous + '% (' + body.mape_n + ' punti).';
  alert('Previsione salvata. Apro l\'area aziendale.' + extra);
  window.location.href = 'area.html';
}

// ===== SALVA (account + server) =====
btnSave.addEventListener('click', async () => {
  if (!forecastResults) return;
  const tok = localStorage.getItem('dph_token');
  if (tok) {
    try {
      await saveForecastToServer(tok);
      return;
    } catch (err) {
      localStorage.removeItem('dph_token');
    }
  }
  modalRegister.style.display = 'flex';
});

modalClose.addEventListener('click', () => {
  modalRegister.style.display = 'none';
});

modalRegister.addEventListener('click', (e) => {
  if (e.target === modalRegister) modalRegister.style.display = 'none';
});

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  try {
    let auth;
    try {
      auth = await postFormApi('/api/login', { email, password });
    } catch (err) {
      auth = await postFormApi('/api/register', {
        email,
        password,
        nome: document.getElementById('reg-nome').value || 'Nome',
        cognome: document.getElementById('reg-cognome').value || 'Cognome',
        azienda: document.getElementById('reg-azienda').value || 'Azienda'
      });
    }
    localStorage.setItem('dph_token', auth.token);
    await saveForecastToServer(auth.token);
    modalRegister.style.display = 'none';
  } catch (err) {
    alert(err.message || 'Non riesco a salvare. Accendi il server (vedi ISTRUZIONI-SERVER.txt).');
  }
});

// ===== NUOVA PREVISIONE =====
btnNew.addEventListener('click', () => {
  stepResults.style.display = 'none';
  stepConfig.style.display = 'none';
  stepColumns.style.display = 'none';
  fileInfo.style.display = 'none';
  uploadZone.style.display = 'block';
  fileInput.value = '';
  workbookData = null;
  selectedSeries = [];
  forecastResults = null;
  outlierDecisions = {};
  lastOutliers = [];
  seriesAlgoOverride = {};
  lastSeriesData = [];
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});

// ===== PRO BUTTONS (placeholder) =====
document.getElementById('btn-pro')?.addEventListener('click', () => {
  window.location.href = 'abbonamento.html';
});
document.getElementById('btn-pro-2')?.addEventListener('click', () => {
  window.location.href = 'abbonamento.html';
});
