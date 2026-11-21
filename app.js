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
  shareBtn: $('shareBtn'), toast: $('toast'),
  cam: $('cam'), video: $('video'), switchCam: $('switchCam'), zoom: $('zoom'), zoomWrap: $('zoomWrap'),
  torchBtn: $('torchBtn'), camLabel: $('camLabel'),
  flash: $('flash'), flashIcon: $('flashIcon'), flashTitle: $('flashTitle'), flashSub: $('flashSub')
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
  if (t.length > 3 && t === t.toUpperCase()) t = t.toLowerCase(); // GROSSBUCHSTABEN (Allergene) normal schreiben
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

// Eigene Zutatenliste (zutaten.js) ergänzt die Angaben der Datenbank
function applyOwnList(ing) {
  const [verdict, why] = window.ZutatenCheck ? ZutatenCheck.judge(ing.text || ing.id || '') : [null, null];
  const i = { ...ing };
  if (verdict === 'meat') { i.vegan = 'no'; i.vegetarian = 'no'; }
  else if (verdict === 'animal') { i.vegan = 'no'; if (i.vegetarian !== 'no') i.vegetarian = 'yes'; }
  else if (verdict === 'plant') { if (i.vegan !== 'no') i.vegan = 'yes'; if (i.vegetarian !== 'no') i.vegetarian = 'yes'; }
  else if (verdict === 'maybe') { i.vegan = i.vegan || 'maybe'; i.vegetarian = i.vegetarian || 'maybe'; }
  i.own = verdict;
  i.why = why;
  return i;
}

function classify(p) {
  const tags = p.ingredients_analysis_tags || [];
  const labels = p.labels_tags || [];
  const cats = p.categories_tags || [];
  const text = p.ingredients_text_de || p.ingredients_text || '';

  let ings = flattenIngredients(p.ingredients).map(applyOwnList);
  const known = new Set(ings.map((i) => ingredientName(i).toLowerCase()));
  // Zusätzlich den Zutatentext selbst durchsuchen (findet z. B. "Sahnepulver", wenn die Datenbank es nicht kennt)
  const fromText = window.ZutatenCheck ? ZutatenCheck.splitIngredients(text).map((t) => applyOwnList({ text: t })) : [];
  for (const i of fromText) {
    const key = ingredientName(i).toLowerCase();
    if (known.has(key)) continue;
    if (i.own === 'meat' || i.own === 'animal' || !p.ingredients || !p.ingredients.length) { ings.push(i); known.add(key); }
  }

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
  const hasIngredients = ings.length > 0 || !!text;

  const base = { nonVegetarian, nonVeganOnly, maybeVegan, maybeVegetarian, labelVegan, labelVegetarian };

  // Offizielles Vegan-Siegel hat Vorrang
  if (labelVegan) return { ...base, level: 'green' };

  // ROT: Fleisch, Fisch oder andere nicht-vegetarische Zutaten
  if (!labelVegetarian && (tags.includes('en:non-vegetarian') || nonVegetarian.length || meatCategory)) {
    return { ...base, level: 'red', meatCategory };
  }

  // GELB: tierische Zutaten gefunden, aber kein Fleisch/Fisch
  if (nonVeganOnly.length || tags.includes('en:non-vegan')) return { ...base, level: 'yellow', veganUnclear: false };

  // GRÜN: laut Datenbank vegan
  if (tags.includes('en:vegan')) return { ...base, level: 'green' };

  // Vegetarisch-Siegel, Vegan aber offen
  if (labelVegetarian) return { ...base, level: 'yellow', veganUnclear: true };

  // Keine Zutaten bekannt: ehrlich "unklar"
  if (!hasIngredients) return { ...base, level: 'grey', reason: 'noIngredients' };

  // Zutaten bekannt, nichts Tierisches gefunden
  return { ...base, level: 'green', byOwnList: true };
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
    const check = [...new Set([...r.maybeVegan, ...r.maybeVegetarian])];
    r.maybeVegan = check;
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

/* ---------- Deutliche Rückmeldung: Vollbild, Ton, Vibration ---------- */

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* kein Ton möglich */ }
}

function beep(notes) {
  if (!audioCtx) return;
  let t = audioCtx.currentTime;
  for (const [freq, dur] of notes) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + 0.05;
  }
}

const SOUNDS = {
  detected: [[1400, 0.09]],
  green: [[880, 0.12], [1320, 0.2]],
  yellow: [[700, 0.15], [700, 0.15]],
  red: [[330, 0.22], [250, 0.3]],
  grey: [[500, 0.2]]
};
const VIBES = { detected: 80, green: [120], yellow: [120, 80, 120], red: [300, 100, 300], grey: [60] };

function feedback(kind) {
  beep(SOUNDS[kind] || SOUNDS.grey);
  if (navigator.vibrate) navigator.vibrate(VIBES[kind] || 60);
}

let flashTimer = null;
function showFlash(level, icon, title, sub, autoHideMs) {
  clearTimeout(flashTimer);
  els.flash.className = 'flash ' + level;
  els.flashIcon.textContent = icon;
  els.flashTitle.textContent = title;
  els.flashSub.textContent = sub || '';
  els.flash.hidden = false;
  if (autoHideMs) flashTimer = setTimeout(hideFlash, autoHideMs);
}
function hideFlash() {
  clearTimeout(flashTimer);
  els.flash.hidden = true;
}

/* ---------- Produkt nachschlagen ---------- */

async function lookup(code, fromScan = false) {
  code = String(code).replace(/\D/g, '');
  if (code.length < 8) { toast('Bitte eine gültige Barcode-Nummer eingeben.'); return; }
  if (busy) return;
  busy = true;
  unlockAudio();
  await stopCamera();

  if (fromScan) feedback('detected');
  showFlash('loading', '✓', 'Barcode erkannt', 'EAN ' + code + ' wird geprüft…');
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
    feedback(r.level);
    showFlash(r.level, LEVELS[r.level].icon, LEVELS[r.level].title.toUpperCase(), name, 1800);
    addHistory({ code, name, level: r.level });
  } catch (err) {
    console.error(err);
    showResultCard('grey', 'Keine Verbindung', 'Das Produkt konnte gerade nicht geladen werden. Bist du online?');
    els.details.innerHTML = '<p class="note">Im Supermarkt ist der Empfang manchmal schlecht. Einfach nochmal versuchen.</p>';
    feedback('grey');
    showFlash('grey', '!', 'Keine Verbindung', 'Bitte nochmal versuchen.', 1800);
  } finally {
    busy = false;
  }
}

function notFound(code) {
  setProduct(null, code);
  showResultCard('grey', 'Nicht gefunden', 'Dieses Produkt ist noch nicht in der Datenbank.');
  els.details.innerHTML = `<p class="note">Bitte die Zutatenliste auf der Packung lesen. Wenn du magst, kannst du das Produkt bei <a href="https://de.openfoodfacts.org/produkt/${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a> eintragen, dann kennen es alle.</p>`;
  feedback('grey');
  showFlash('grey', '?', 'Nicht gefunden', 'Produkt ist nicht in der Datenbank.', 1800);
  addHistory({ code, name: 'Unbekanntes Produkt', level: 'grey' });
}

/* ---------- Kamera ---------- */

// Prüfziffer von EAN-8/EAN-13/UPC-A: verhindert Fehl-Erkennungen
function validEan(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return code.length === 6 || code.length === 7; // UPC-E durchlassen
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

const CAM_KEY = 'veganCheckCamera';
let stream = null;
let detector = null;
let detectLoop = null;
let backCams = [];
let camIndex = 0;
let lastCode = '';
let sameCount = 0;

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => supported.includes(f));
    return wanted.length ? new BarcodeDetector({ formats: wanted }) : null;
  } catch (e) { return null; }
}

// Rückkameras sortieren: Hauptkamera zuerst, Weitwinkel/Tele/Makro nach hinten
function rankCameras(devices) {
  const vids = devices.filter((d) => d.kind === 'videoinput');
  let back = vids.filter((d) => /back|rear|rück|environment|hinten|außen/i.test(d.label));
  if (!back.length) back = vids.filter((d) => !/front|user|vorder|selfie/i.test(d.label));
  if (!back.length) back = vids;
  const penalty = (l) => (/ultra|wide|weitwinkel|0[.,]5/i.test(l) ? 20 : 0) + (/tele|zoom/i.test(l) ? 10 : 0) + (/macro|makro|depth|tiefe|ir\b/i.test(l) ? 30 : 0);
  const num = (l) => { const m = l.match(/(\d+)\s*,/) || l.match(/(\d+)(?!.*\d)/); return m ? Number(m[1]) : 99; };
  return back.slice().sort((a, b) => (penalty(a.label) - penalty(b.label)) || (num(a.label) - num(b.label)));
}

function videoConstraints(deviceId) {
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  return deviceId ? { ...base, deviceId: { exact: deviceId } } : { ...base, facingMode: { ideal: 'environment' } };
}

async function openStream(deviceId) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId), audio: false });
  els.video.srcObject = stream;
  await els.video.play().catch(() => {});
  await tuneTrack();
}

async function tuneTrack() {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const adv = {};
  if (caps.focusMode && caps.focusMode.includes('continuous')) adv.focusMode = 'continuous';
  if (caps.exposureMode && caps.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
  if (Object.keys(adv).length) { try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { /* egal */ } }

  // Zoom-Regler (bei manchen Handys wechselt das auch auf die Hauptlinse)
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    els.zoom.min = caps.zoom.min;
    els.zoom.max = Math.min(caps.zoom.max, 5);
    els.zoom.step = caps.zoom.step || 0.1;
    const start = Math.min(Math.max(1.5, caps.zoom.min), els.zoom.max);
    els.zoom.value = start;
    try { await track.applyConstraints({ advanced: [{ zoom: start }] }); } catch (e) { /* egal */ }
    els.zoomWrap.hidden = false;
  } else {
    els.zoomWrap.hidden = true;
  }
  els.torchBtn.hidden = !caps.torch;
  els.torchBtn.classList.remove('on');

  const s = track.getSettings ? track.getSettings() : {};
  els.camLabel.textContent = backCams.length > 1 ? `Kamera ${camIndex + 1}/${backCams.length}` : '';
  if (s.width) els.camLabel.textContent = [els.camLabel.textContent, `${s.width}×${s.height}`].filter(Boolean).join(' · ');
}

async function startScanner() {
  unlockAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    els.hint.textContent = 'Dieser Browser erlaubt keinen Kamerazugriff. Tippe die Nummer unter dem Barcode ein.';
    return;
  }
  els.startBtn.disabled = true;
  els.startBtn.textContent = 'Kamera wird gestartet…';
  try {
    detector = detector || await nativeDetector();
    if (!detector) return startFallbackScanner();

    // Erst irgendeine Rückkamera öffnen, dann sind die Kameranamen lesbar
    await openStream(null);
    backCams = rankCameras(await navigator.mediaDevices.enumerateDevices());
    let saved = null;
    try { saved = localStorage.getItem(CAM_KEY); } catch (e) { /* egal */ }
    const savedIdx = backCams.findIndex((d) => d.deviceId === saved);
    camIndex = savedIdx >= 0 ? savedIdx : 0;
    const current = stream.getVideoTracks()[0].getSettings().deviceId;
    if (backCams[camIndex] && backCams[camIndex].deviceId !== current) await openStream(backCams[camIndex].deviceId);
    else await tuneTrack();

    els.switchCam.hidden = backCams.length < 2;
    els.cam.hidden = false;
    els.startBtn.hidden = true;
    els.hint.textContent = 'Barcode in den weißen Rahmen halten, etwa 15–20 cm Abstand. Unscharf? Zoom-Regler oder „Kamera“ antippen.';
    scanning = true;
    runDetection();
  } catch (err) {
    console.error(err);
    cameraFailed();
  }
}

function runDetection() {
  clearTimeout(detectLoop);
  const tick = async () => {
    if (!scanning) return;
    if (els.video.readyState >= 2) {
      try {
        const codes = await detector.detect(els.video);
        const hit = codes.map((c) => c.rawValue).find(validEan);
        if (hit) {
          // Zweimal hintereinander derselbe Code = sicher erkannt (bei gültiger Prüfziffer reicht einmal)
          sameCount = hit === lastCode ? sameCount + 1 : 1;
          lastCode = hit;
          if (hit.length >= 8 || sameCount >= 2) { lastCode = ''; sameCount = 0; lookup(hit, true); return; }
        }
      } catch (e) { /* nächster Versuch */ }
    }
    detectLoop = setTimeout(tick, 80);
  };
  tick();
}

async function switchCamera() {
  if (backCams.length < 2) return;
  camIndex = (camIndex + 1) % backCams.length;
  try { localStorage.setItem(CAM_KEY, backCams[camIndex].deviceId); } catch (e) { /* egal */ }
  try { await openStream(backCams[camIndex].deviceId); } catch (e) { toast('Diese Kamera lässt sich nicht öffnen.'); }
  toast(`Kamera ${camIndex + 1} von ${backCams.length}`, 1200);
}

async function toggleTorch() {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  const on = !els.torchBtn.classList.contains('on');
  try { await track.applyConstraints({ advanced: [{ torch: on }] }); els.torchBtn.classList.toggle('on', on); } catch (e) { /* egal */ }
}

async function setZoom() {
  const track = stream && stream.getVideoTracks()[0];
  if (track) { try { await track.applyConstraints({ advanced: [{ zoom: Number(els.zoom.value) }] }); } catch (e) { /* egal */ } }
}

// Ersatz für Browser ohne eingebauten Barcode-Scanner (z. B. iPhone)
async function startFallbackScanner() {
  if (!window.Html5Qrcode) { cameraFailed(); return; }
  if (!scanner) {
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode('reader', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false });
  }
  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        qrbox: (w, h) => { const width = Math.floor(Math.min(w * 0.85, 360)); return { width, height: Math.floor(Math.min(width * 0.5, h * 0.6)) }; },
        videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] }
      },
      (text) => { if (validEan(text)) lookup(text, true); },
      () => {}
    );
    scanning = true;
    els.startBtn.hidden = true;
    els.hint.textContent = 'Barcode in den Rahmen halten, etwa 15–20 cm Abstand.';
  } catch (err) {
    console.error(err);
    cameraFailed();
  }
}

function cameraFailed() {
  els.startBtn.disabled = false;
  els.startBtn.textContent = '📷 Scannen starten';
  els.hint.textContent = 'Kein Kamerazugriff. Bitte erlaube die Kamera in den Browser-Einstellungen oder tippe die Nummer unter dem Barcode ein.';
}

async function stopCamera() {
  scanning = false;
  clearTimeout(detectLoop);
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  els.cam.hidden = true;
  if (scanner && scanner.isScanning) { try { await scanner.stop(); } catch (e) { /* schon gestoppt */ } }
}

function backToScan() {
  hideFlash();
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
els.switchCam.addEventListener('click', switchCamera);
els.torchBtn.addEventListener('click', toggleTorch);
els.zoom.addEventListener('input', setZoom);
els.flash.addEventListener('click', hideFlash);
renderHistory();

// Barcode direkt per Link öffnen, z. B. ...?ean=4000417025005
const params = new URLSearchParams(location.search);
if (params.get('ean')) lookup(params.get('ean'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Für Tests
window.VeganCheck = { classify, applyOwnList, rankCameras, validEan };
