/* Vegan-Check: Barcode scannen und Produkt bei Open Food Facts nachschlagen. */
'use strict';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = [
  'code', 'product_name', 'product_name_de', 'generic_name_de', 'brands', 'quantity',
  'image_front_small_url', 'ingredients', 'ingredients_text', 'ingredients_text_de',
  'ingredients_analysis_tags', 'labels_tags', 'categories_tags'
].join(',');

// Kategorien, die eindeutig Fleisch oder Fisch sind
const MEAT_CATEGORIES = [
  'en:meats', 'en:meat-based-products', 'en:prepared-meats', 'en:sausages', 'en:hams',
  'en:poultries', 'en:beef', 'en:pork', 'en:fishes', 'en:seafood', 'en:canned-fishes',
  'en:smoked-fishes', 'en:crustaceans', 'en:salamis', 'en:bacon'
];

const $ = (id) => document.getElementById(id);
const els = {
  reader: $('reader'), startBtn: $('startBtn'), hint: $('cameraHint'), scanArea: $('scanArea'),
  result: $('result'), card: $('resultCard'), icon: $('statusIcon'), title: $('statusTitle'),
  sub: $('statusSub'), img: $('productImg'), name: $('productName'), meta: $('productMeta'),
  details: $('details'), nextBtn: $('nextBtn'), manualForm: $('manualForm'), manualInput: $('manualInput'),
  history: $('history'), historySection: $('historySection'), clearHistory: $('clearHistory'),
  shareBtn: $('shareBtn'), toast: $('toast')
};

let scanner = null;
let scanning = false;
let busy = false;

/* ---------- Hilfsfunktionen ---------- */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, ms = 2500) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { els.toast.hidden = true; }, ms);
}

// Zutaten können verschachtelt sein (z. B. "Schokolade (Zucker, Kakaobutter, ...)")
function flattenIngredients(list, out = []) {
  for (const ing of list || []) {
    out.push(ing);
    if (ing.ingredients) flattenIngredients(ing.ingredients, out);
  }
  return out;
}

function ingredientName(ing) {
  let t = (ing.text || '').replace(/_/g, '').trim();
  if (!t && ing.id) t = ing.id.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function uniqueNames(ings) {
  const seen = new Set();
  const out = [];
  for (const i of ings) {
    const n = ingredientName(i);
    const key = n.toLowerCase();
    if (n && !seen.has(key)) { seen.add(key); out.push(n); }
  }
  return out;
}

/* ---------- Bewertung ---------- */

function classify(p) {
  const tags = p.ingredients_analysis_tags || [];
  const labels = p.labels_tags || [];
  const cats = p.categories_tags || [];
  const ings = flattenIngredients(p.ingredients);

  const nonVegetarian = uniqueNames(ings.filter((i) => i.vegetarian === 'no'));
  // Bei "vielleicht" nur die genaueste Zutat zeigen (z. B. "Lecithine" statt "Emulgator")
  const leaves = ings.filter((i) => !(i.ingredients && i.ingredients.length));
  const maybeVegetarian = uniqueNames(leaves.filter((i) => i.vegetarian === 'maybe'));
  const nonVegetarianSet = new Set(nonVegetarian.map((n) => n.toLowerCase()));
  const nonVeganOnly = uniqueNames(ings.filter((i) => i.vegan === 'no'))
    .filter((n) => !nonVegetarianSet.has(n.toLowerCase()));
  const maybeVegan = uniqueNames(leaves.filter((i) => i.vegan === 'maybe'));

  const labelVegan = labels.includes('en:vegan');
  const labelVegetarian = labels.includes('en:vegetarian');
  const meatCategory = cats.some((c) => MEAT_CATEGORIES.includes(c));
  const hasIngredients = ings.length > 0 || !!(p.ingredients_text || p.ingredients_text_de);

  const base = { nonVegetarian, nonVeganOnly, maybeVegan, maybeVegetarian, labelVegan, labelVegetarian };

  // Offizielles Vegan-Siegel hat Vorrang
  if (labelVegan) return { ...base, level: 'green' };

  // ROT: Fleisch, Fisch oder andere nicht-vegetarische Zutaten
  if (!labelVegetarian && (tags.includes('en:non-vegetarian') || nonVegetarian.length || meatCategory)) {
    return { ...base, level: 'red', meatCategory };
  }

  // GRÜN: laut Zutatenanalyse vegan
  if (tags.includes('en:vegan')) return { ...base, level: 'green' };

  // GELB: vegetarisch, aber nicht (sicher) vegan
  if (labelVegetarian || tags.includes('en:vegetarian')) {
    const surelyNotVegan = tags.includes('en:non-vegan') || nonVeganOnly.length > 0;
    return { ...base, level: 'yellow', veganUnclear: !surelyNotVegan };
  }

  if (!hasIngredients) return { ...base, level: 'grey', reason: 'noIngredients' };
  return { ...base, level: 'grey', reason: 'unclear' };
}

const LEVELS = {
  green: { icon: '✓', title: 'Vegan', short: 'vegan' },
  yellow: { icon: '!', title: 'Vegetarisch', short: 'vegetarisch' },
  red: { icon: '✕', title: 'Nicht vegetarisch', short: 'mit Fleisch/Fisch' },
  grey: { icon: '?', title: 'Unklar', short: 'unklar' }
};

function list(items, cls) {
  return '<ul>' + items.map((n) => `<li class="${cls}">${esc(n)}</li>`).join('') + '</ul>';
}

function renderDetails(r, p) {
  let html = '';
  let sub = '';

  if (r.level === 'green') {
    sub = r.labelVegan ? 'Trägt ein Vegan-Siegel.' : 'Laut Zutatenliste keine tierischen Zutaten.';
    if (!r.labelVegan && r.maybeVegan.length) {
      html += '<h3>Kurz prüfen</h3><p class="note">Diese Zutaten sind meist pflanzlich, können aber tierischen Ursprungs sein:</p>' + list(r.maybeVegan, 'warn');
    }
  } else if (r.level === 'yellow') {
    if (r.veganUnclear) {
      sub = 'Vegetarisch. Ob es vegan ist, ist nicht sicher.';
      html += '<h3>Möglicherweise nicht vegan</h3>';
      html += r.maybeVegan.length ? list(r.maybeVegan, 'warn') : '<p class="note">Einzelne Zutaten konnten nicht eindeutig zugeordnet werden.</p>';
    } else {
      sub = 'Enthält tierische Zutaten, aber kein Fleisch oder Fisch.';
      html += '<h3>Nicht vegan</h3>';
      html += r.nonVeganOnly.length ? list(r.nonVeganOnly, 'bad') : '<p class="note">Laut Datenbank nicht vegan, die genaue Zutat ist aber nicht markiert.</p>';
      if (r.maybeVegan.length) html += '<h3>Möglicherweise nicht vegan</h3>' + list(r.maybeVegan, 'warn');
    }
  } else if (r.level === 'red') {
    sub = 'Enthält Fleisch, Fisch oder andere nicht-vegetarische Zutaten.';
    html += '<h3>Nicht vegetarisch</h3>';
    html += r.nonVegetarian.length
      ? list(r.nonVegetarian, 'bad')
      : `<p class="note">${r.meatCategory ? 'Das Produkt ist als Fleisch- oder Fischprodukt eingeordnet.' : 'Laut Datenbank nicht vegetarisch.'}</p>`;
    if (r.nonVeganOnly.length) html += '<h3>Außerdem nicht vegan</h3>' + list(r.nonVeganOnly, 'warn');
  } else {
    if (r.reason === 'noIngredients') {
      sub = 'Für dieses Produkt ist keine Zutatenliste hinterlegt.';
    } else {
      sub = 'Die Zutaten lassen sich nicht sicher zuordnen.';
      if (r.maybeVegetarian.length) html += '<h3>Könnte tierisch sein</h3>' + list(r.maybeVegetarian, 'warn');
      else if (r.maybeVegan.length) html += '<h3>Könnte tierisch sein</h3>' + list(r.maybeVegan, 'warn');
    }
    html += `<p class="note">Bitte die Zutatenliste auf der Packung lesen. Du kannst das Produkt auch bei <a href="https://de.openfoodfacts.org/produkt/${esc(p.code)}" target="_blank" rel="noopener">Open Food Facts</a> ergänzen, dann klappt es beim nächsten Mal.</p>`;
  }

  const ingText = p.ingredients_text_de || p.ingredients_text;
  if (ingText) {
    html += `<details><summary class="note" style="margin-top:14px;cursor:pointer">Ganze Zutatenliste anzeigen</summary><p class="note">${esc(ingText.replace(/_/g, ''))}</p></details>`;
  }
  return { html, sub };
}

/* ---------- Anzeige ---------- */

function showResultCard(level, title, sub) {
  els.card.className = 'card ' + level;
  els.icon.textContent = level === 'loading' ? '…' : LEVELS[level].icon;
  els.title.textContent = title;
  els.sub.textContent = sub;
  els.scanArea.hidden = true;
  els.result.hidden = false;
  window.scrollTo({ top: 0 });
}

function setProduct(p, code) {
  const name = p ? (p.product_name_de || p.product_name || p.generic_name_de || 'Unbenanntes Produkt') : 'Unbekanntes Produkt';
  els.name.textContent = name;
  els.meta.textContent = [p && p.brands, p && p.quantity, 'EAN ' + code].filter(Boolean).join(' · ');
  if (p && p.image_front_small_url) {
    els.img.src = p.image_front_small_url;
    els.img.hidden = false;
  } else {
    els.img.hidden = true;
    els.img.removeAttribute('src');
  }
  return name;
}

async function lookup(code) {
  code = String(code).replace(/\D/g, '');
  if (code.length < 8) { toast('Bitte eine gültige Barcode-Nummer eingeben.'); return; }
  if (busy) return;
  busy = true;
  await pauseScanner();

  showResultCard('loading', 'Suche…', 'Produkt wird nachgeschlagen.');
  setProduct(null, code);
  els.name.textContent = '';
  els.details.innerHTML = '';

  try {
    const res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`);
    if (res.status === 404) return notFound(code);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status !== 1 || !data.product) return notFound(code);

    const p = data.product;
    p.code = p.code || code;
    const r = classify(p);
    const { html, sub } = renderDetails(r, p);
    const name = setProduct(p, code);
    showResultCard(r.level, LEVELS[r.level].title, sub);
    els.details.innerHTML = html;
    if (navigator.vibrate) navigator.vibrate(r.level === 'green' ? 60 : [60, 80, 60]);
    addHistory({ code, name, level: r.level });
  } catch (err) {
    console.error(err);
    showResultCard('grey', 'Keine Verbindung', 'Das Produkt konnte gerade nicht geladen werden. Bist du online?');
    els.details.innerHTML = '<p class="note">Im Supermarkt ist der Empfang manchmal schlecht. Einfach nochmal versuchen.</p>';
  } finally {
    busy = false;
  }
}

function notFound(code) {
  setProduct(null, code);
  showResultCard('grey', 'Nicht gefunden', 'Dieses Produkt ist noch nicht in der Datenbank.');
  els.details.innerHTML = `<p class="note">Bitte die Zutatenliste auf der Packung lesen. Wenn du magst, kannst du das Produkt bei <a href="https://de.openfoodfacts.org/produkt/${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a> eintragen, dann kennen es alle.</p>`;
  addHistory({ code, name: 'Unbekanntes Produkt', level: 'grey' });
}

/* ---------- Kamera ---------- */

async function startScanner() {
  if (!window.Html5Qrcode) { toast('Scanner konnte nicht geladen werden.'); return; }
  if (!scanner) {
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode('reader', {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      useBarCodeDetectorIfSupported: true,
      verbose: false
    });
  }
  els.startBtn.disabled = true;
  els.startBtn.textContent = 'Kamera wird gestartet…';
  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        qrbox: (w, h) => {
          const width = Math.floor(Math.min(w * 0.85, 360));
          return { width, height: Math.floor(Math.min(width * 0.5, h * 0.6)) };
        },
        aspectRatio: 1.333
      },
      (text) => lookup(text),
      () => {}
    );
    scanning = true;
    els.startBtn.hidden = true;
    els.hint.textContent = 'Halte den Barcode in den Rahmen. Es geht automatisch los.';
  } catch (err) {
    console.error(err);
    els.startBtn.disabled = false;
    els.startBtn.textContent = '📷 Scannen starten';
    els.hint.textContent = 'Kein Kamerazugriff. Bitte erlaube die Kamera in den Browser-Einstellungen oder tippe die Nummer unter dem Barcode ein.';
  }
}

async function pauseScanner() {
  if (scanner && scanning) {
    try { await scanner.stop(); } catch (e) { /* schon gestoppt */ }
    scanning = false;
  }
}

function backToScan() {
  els.result.hidden = true;
  els.scanArea.hidden = false;
  els.manualInput.value = '';
  els.startBtn.hidden = false;
  els.startBtn.disabled = false;
  els.startBtn.textContent = '📷 Scannen starten';
  startScanner();
}

/* ---------- Verlauf ---------- */

const HKEY = 'veganCheckHistory';

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; }
}

function addHistory(entry) {
  let h = readHistory().filter((e) => e.code !== entry.code);
  h.unshift({ ...entry, t: Date.now() });
  h = h.slice(0, 30);
  try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) { /* egal */ }
  renderHistory();
}

function renderHistory() {
  const h = readHistory();
  els.historySection.hidden = h.length === 0;
  els.history.innerHTML = h.map((e) =>
    `<li data-code="${esc(e.code)}"><span class="dot ${esc(e.level)}"></span><span class="h-name">${esc(e.name)}</span><span class="h-label">${esc(LEVELS[e.level] ? LEVELS[e.level].short : '')}</span></li>`
  ).join('');
}

/* ---------- Teilen ---------- */

async function share() {
  const url = location.href.split('#')[0].split('?')[0];
  const data = { title: 'Vegan-Check', text: 'Scanne Produkte im Supermarkt und sieh sofort, ob sie vegan sind:', url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast('Link kopiert. Jetzt einfach verschicken!');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    prompt('Diesen Link verschicken:', url);
  }
}

/* ---------- Start ---------- */

els.startBtn.addEventListener('click', startScanner);
els.nextBtn.addEventListener('click', backToScan);
els.manualForm.addEventListener('submit', (e) => { e.preventDefault(); lookup(els.manualInput.value); });
els.history.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-code]');
  if (li) lookup(li.dataset.code);
});
els.clearHistory.addEventListener('click', () => {
  try { localStorage.removeItem(HKEY); } catch (e) { /* egal */ }
  renderHistory();
});
els.shareBtn.addEventListener('click', share);
renderHistory();

// Barcode direkt per Link öffnen, z. B. ...?ean=4000417025005
const params = new URLSearchParams(location.search);
if (params.get('ean')) lookup(params.get('ean'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Für Tests
window.VeganCheck = { classify };
