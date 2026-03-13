/* =============================================
   Emma Lernsystem – app.js
   ============================================= */

'use strict';

// ============================================
// DATEN-MODELL
// ============================================

const LEVELS = [
  { name: 'Lernling',        min: 0,   max: 49,  emoji: '🌱' },
  { name: 'Aufsteigerin',    min: 50,  max: 149, emoji: '⭐' },
  { name: 'Fortgeschrittene',min: 150, max: 299, emoji: '🌟' },
  { name: 'Expertin',        min: 300, max: 499, emoji: '💫' },
  { name: 'Meisterin',       min: 500, max: Infinity, emoji: '🏆' },
];

// Punkte pro abgeschlossenem Thema: 10 Basis + 4 pro Stern
function calcPoints(sterne) {
  return 10 + (sterne * 4);
}

function getLevel(pts) {
  return LEVELS.find(l => pts >= l.min && pts <= l.max) || LEVELS[0];
}

function getNextLevel(pts) {
  const idx = LEVELS.findIndex(l => pts >= l.min && pts <= l.max);
  return LEVELS[idx + 1] || null;
}

// Default-Plan für Mathe (basiert auf Emma's Lernprofil aus CLAUDE.md)
const DEFAULT_PLAN = {
  mathe: {
    themen: [
      { id: 1, name: 'Geometrie: Flächen von Quadrat & Rechteck', status: 'abgeschlossen', sterne: 4 },
      { id: 2, name: 'Kreis: Radius & Durchmesser',               status: 'aktuell',       sterne: 0 },
      { id: 3, name: 'Schriftliche Multiplikation',                status: 'geplant',       sterne: 0 },
      { id: 4, name: 'Schriftliche Division',                      status: 'geplant',       sterne: 0 },
    ],
    streak: 0,
    letzteUebung: null,
    nextId: 5,
  },
  deutsch: {
    themen: [],
    streak: 0,
    letzteUebung: null,
    nextId: 1,
  },
};

// ============================================
// STATE
// ============================================

const state = {
  apiKey:      localStorage.getItem('emma_api_key') || '',
  currentTab:  'mathe',
  uploads:     { mathe: null, deutsch: null },
  plan:        loadPlan(),
  abschluss:   { fach: null, themaId: null, sterne: 0 },
  editing:     null,  // { fach, id } – welches Thema gerade umbenannt wird
};

function loadPlan() {
  try {
    const raw = localStorage.getItem('emma_lernplan');
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_PLAN);
  } catch {
    return structuredClone(DEFAULT_PLAN);
  }
}

function savePlan() {
  localStorage.setItem('emma_lernplan', JSON.stringify(state.plan));
  // Auch in Drive speichern wenn eingeloggt
  if (DRIVE.isLoggedIn()) {
    DRIVE.writeFile('lernplan.json', JSON.stringify(state.plan, null, 2)).catch(console.error);
  }
}

function getPlan(fach) { return state.plan[fach]; }

function calcGesamtpunkte(fach) {
  return getPlan(fach).themen
    .filter(t => t.status === 'abgeschlossen')
    .reduce((sum, t) => sum + calcPoints(t.sterne), 0);
}

function getAktuellesThema(fach) {
  return getPlan(fach).themen.find(t => t.status === 'aktuell') || null;
}

// ============================================
// DOM HELPERS
// ============================================

const $ = id => document.getElementById(id);

function showStatus(el, msg, type = 'success') {
  el.textContent = msg;
  el.className = 'status-msg ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showLoading(text = 'Wird verarbeitet…') {
  $('loading-text').textContent = text;
  $('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  $('loading-overlay').classList.add('hidden');
}

// ============================================
// RANKING RENDER
// ============================================

function renderRanking(fach) {
  const pts      = calcGesamtpunkte(fach);
  const level    = getLevel(pts);
  const next     = getNextLevel(pts);
  const doneCount = getPlan(fach).themen.filter(t => t.status === 'abgeschlossen').length;
  const streak   = getPlan(fach).streak || 0;

  $('level-badge-' + fach).textContent = level.emoji + ' ' + level.name;
  $('level-pts-' + fach).textContent   = pts + ' Punkte gesamt';
  $('streak-val-' + fach).textContent  = streak;
  $('done-val-' + fach).textContent    = doneCount;

  if (next) {
    const pct = Math.min(100, Math.round(((pts - level.min) / (next.min - level.min)) * 100));
    $('xp-fill-' + fach).style.width  = pct + '%';
    $('xp-label-' + fach).textContent = pts + ' / ' + next.min + ' XP → ' + next.name;
  } else {
    $('xp-fill-' + fach).style.width  = '100%';
    $('xp-label-' + fach).textContent = 'Maximales Level erreicht! 🏆';
  }
}

// ============================================
// LERNPLAN RENDER
// ============================================

function starsDisplay(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderPlan(fach) {
  const plan     = getPlan(fach);
  const bodyEl   = $('plan-body-' + fach);
  const hintName = $('topic-hint-name-' + fach);

  if (!plan.themen.length) {
    bodyEl.innerHTML = '<p class="placeholder-text">Noch kein Lernplan. Füge das erste Thema hinzu.</p>';
    hintName.textContent = '– kein Thema gesetzt –';
    return;
  }

  const aktuelles = getAktuellesThema(fach);
  hintName.textContent = aktuelles ? aktuelles.name : '– alle Themen abgeschlossen –';

  const html = plan.themen.map((t, idx) => {
    const cls = 'plan-item--' + t.status;
    const dot = t.status === 'abgeschlossen' ? '✓'
               : t.status === 'aktuell'      ? '→'
               :                               (idx + 1);
    const tag = t.status === 'abgeschlossen' ? 'Abgeschlossen'
               : t.status === 'aktuell'      ? 'Aktuell'
               :                               'Geplant';

    const starsHtml = t.status === 'abgeschlossen'
      ? `<span class="plan-stars">${starsDisplay(t.sterne)}</span>`
      : '';

    const isEditing = state.editing && state.editing.fach === fach && state.editing.id === t.id;

    const nameHtml = isEditing
      ? `<div class="plan-rename-row">
           <input class="plan-rename-input" id="rename-input-${fach}-${t.id}"
             type="text" value="${escHtml(t.name)}" />
           <button class="plan-btn plan-btn--done"  data-action="rename-save"   data-fach="${fach}" data-id="${t.id}">✓</button>
           <button class="plan-btn plan-btn--up"    data-action="rename-cancel" data-fach="${fach}" data-id="${t.id}">✕</button>
         </div>`
      : `<div class="plan-name-row">
           <span class="plan-name">${escHtml(t.name)}</span>
           <button class="plan-btn plan-btn--edit" data-action="rename" data-fach="${fach}" data-id="${t.id}" title="Umbenennen">✏</button>
         </div>`;

    const actionsHtml = t.status !== 'abgeschlossen' ? `
      <div class="plan-actions">
        ${t.status === 'aktuell' ? `<button class="plan-btn plan-btn--done" data-action="done" data-fach="${fach}" data-id="${t.id}">✓ Abschließen</button>` : ''}
        ${t.status === 'geplant' ? `<button class="plan-btn plan-btn--done" data-action="activate" data-fach="${fach}" data-id="${t.id}" ${aktuelles ? 'disabled title="Erst das aktuelle Thema abschließen"' : ''}>Als aktuell setzen</button>` : ''}
        ${idx > 0 ? `<button class="plan-btn plan-btn--up" data-action="up" data-fach="${fach}" data-id="${t.id}">↑</button>` : ''}
        ${idx < plan.themen.length - 1 ? `<button class="plan-btn plan-btn--down" data-action="down" data-fach="${fach}" data-id="${t.id}">↓</button>` : ''}
        <button class="plan-btn plan-btn--del" data-action="del" data-fach="${fach}" data-id="${t.id}">✕</button>
      </div>` : '';

    const lineHtml = idx < plan.themen.length - 1
      ? `<div class="plan-line"></div>` : '';

    return `
      <div class="plan-item ${cls}">
        ${lineHtml}
        <div class="plan-dot-col">
          <div class="plan-dot">${dot}</div>
        </div>
        <div class="plan-content">
          ${nameHtml}
          <div class="plan-meta">
            <span class="plan-status-tag">${tag}</span>
            ${starsHtml}
          </div>
          ${actionsHtml}
        </div>
      </div>`;
  }).join('');

  bodyEl.innerHTML = `<div class="plan-timeline">${html}</div>`;

  bodyEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handlePlanAction(btn));
  });

  // Enter / Escape im Rename-Input
  bodyEl.querySelectorAll('.plan-rename-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const saveBtn = bodyEl.querySelector(`[data-action="rename-save"][data-id="${input.id.split('-').pop()}"]`);
        if (saveBtn) saveBtn.click();
      } else if (e.key === 'Escape') {
        const cancelBtn = bodyEl.querySelector(`[data-action="rename-cancel"]`);
        if (cancelBtn) cancelBtn.click();
      }
    });
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function handlePlanAction(btn) {
  const { action, fach, id } = btn.dataset;
  const plan = getPlan(fach);
  const idx  = plan.themen.findIndex(t => t.id == id);
  if (idx === -1) return;

  if (action === 'rename') {
    state.editing = { fach, id: parseInt(id) };
    renderPlan(fach);
    const input = document.getElementById(`rename-input-${fach}-${id}`);
    if (input) { input.focus(); input.select(); }
    return;
  } else if (action === 'rename-save') {
    const input = document.getElementById(`rename-input-${fach}-${id}`);
    const newName = input ? input.value.trim() : '';
    if (newName) plan.themen[idx].name = newName;
    state.editing = null;
    commitPlan(fach);
    return;
  } else if (action === 'rename-cancel') {
    state.editing = null;
    renderPlan(fach);
    return;
  } else if (action === 'done') {
    openAbschlussModal(fach, parseInt(id));
  } else if (action === 'activate') {
    plan.themen[idx].status = 'aktuell';
    commitPlan(fach);
  } else if (action === 'up' && idx > 0) {
    [plan.themen[idx - 1], plan.themen[idx]] = [plan.themen[idx], plan.themen[idx - 1]];
    commitPlan(fach);
  } else if (action === 'down' && idx < plan.themen.length - 1) {
    [plan.themen[idx + 1], plan.themen[idx]] = [plan.themen[idx], plan.themen[idx + 1]];
    commitPlan(fach);
  } else if (action === 'del') {
    if (confirm(`"${plan.themen[idx].name}" wirklich löschen?`)) {
      plan.themen.splice(idx, 1);
      commitPlan(fach);
    }
  }
}

function commitPlan(fach) {
  savePlan();
  renderPlan(fach);
  renderRanking(fach);
}

// ============================================
// THEMA ABSCHLIESSEN MODAL
// ============================================

function openAbschlussModal(fach, themaId) {
  const plan  = getPlan(fach);
  const thema = plan.themen.find(t => t.id === themaId);
  if (!thema) return;

  state.abschluss = { fach, themaId, sterne: 0 };

  $('abschluss-thema-name').textContent = thema.name;
  $('abschluss-confirm').disabled = true;
  resetStars();
  $('abschluss-modal').classList.remove('hidden');
}

function resetStars() {
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active', 'hover'));
}

function initAbschlussModal() {
  const stars = document.querySelectorAll('.star-btn');

  stars.forEach(btn => {
    const val = parseInt(btn.dataset.val);

    btn.addEventListener('mouseenter', () => {
      stars.forEach(b => b.classList.toggle('hover', parseInt(b.dataset.val) <= val));
    });
    btn.addEventListener('mouseleave', () => {
      stars.forEach(b => b.classList.remove('hover'));
    });
    btn.addEventListener('click', () => {
      state.abschluss.sterne = val;
      stars.forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) <= val));
      $('abschluss-confirm').disabled = false;
    });
  });

  $('abschluss-cancel').addEventListener('click', () => {
    $('abschluss-modal').classList.add('hidden');
  });

  $('abschluss-confirm').addEventListener('click', () => {
    const { fach, themaId, sterne } = state.abschluss;
    const plan  = getPlan(fach);
    const thema = plan.themen.find(t => t.id === themaId);
    if (!thema) return;

    thema.status = 'abgeschlossen';
    thema.sterne = sterne;

    // Nächstes geplantes Thema automatisch aktivieren
    const naechstes = plan.themen.find(t => t.status === 'geplant');
    if (naechstes) naechstes.status = 'aktuell';

    // Streak updaten
    const heute = new Date().toDateString();
    if (plan.letzteUebung !== heute) {
      const gestern = new Date(Date.now() - 86400000).toDateString();
      plan.streak   = (plan.letzteUebung === gestern) ? (plan.streak || 0) + 1 : 1;
      plan.letzteUebung = heute;
    }

    $('abschluss-modal').classList.add('hidden');
    commitPlan(fach);
  });
}

// ============================================
// THEMA HINZUFÜGEN
// ============================================

function initAddTopic(fach) {
  $('add-topic-btn-' + fach).addEventListener('click', () => {
    $('add-topic-form-' + fach).classList.remove('hidden');
    $('new-topic-input-' + fach).focus();
  });

  $('add-topic-cancel-' + fach).addEventListener('click', () => {
    $('add-topic-form-' + fach).classList.add('hidden');
    $('new-topic-input-' + fach).value = '';
  });

  $('add-topic-save-' + fach).addEventListener('click', () => {
    const name = $('new-topic-input-' + fach).value.trim();
    if (!name) return;

    const plan = getPlan(fach);
    plan.themen.push({
      id:     plan.nextId++,
      name,
      status: 'geplant',
      sterne: 0,
    });

    $('add-topic-form-' + fach).classList.add('hidden');
    $('new-topic-input-' + fach).value = '';
    commitPlan(fach);
  });

  // Enter-Taste
  $('new-topic-input-' + fach).addEventListener('keydown', e => {
    if (e.key === 'Enter') $('add-topic-save-' + fach).click();
    if (e.key === 'Escape') $('add-topic-cancel-' + fach).click();
  });
}

// ============================================
// TABS
// ============================================

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.remove('hidden');
      state.currentTab = btn.dataset.tab;
    });
  });
}

// ============================================
// COLLAPSE / EXPAND
// ============================================

function initToggles() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target    = $(btn.dataset.target);
      const collapsed = target.classList.toggle('collapsed');
      btn.classList.toggle('collapsed', collapsed);
    });
  });
}

// ============================================
// FOTO UPLOAD
// ============================================

function initUpload(fach) {
  const input   = $('upload-' + fach);
  const preview = $('preview-' + fach);
  const label   = $('upload-label-' + fach);
  const btn     = $('analyse-' + fach);

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      label.textContent = file.name;
      state.uploads[fach] = { file, dataUrl: e.target.result };
      btn.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  btn.addEventListener('click', () => handleAnalyse(fach));
}

// ============================================
// ANALYSE – Anthropic API
// ============================================

async function handleAnalyse(fach) {
  if (!state.uploads[fach]) return;
  if (!state.apiKey) { showSetupModal(); return; }

  const statusEl = $('analyse-status-' + fach);
  const { dataUrl } = state.uploads[fach];

  // Base64 ohne Data-URL-Prefix
  const base64 = dataUrl.split(',')[1];
  const mediaType = dataUrl.split(';')[0].split(':')[1]; // z.B. image/jpeg

  const aktuellesThema = getAktuellesThema(fach);
  const kontext = $('kontext-' + fach).value || '(kein Kontext vorhanden)';

  const systemPrompt = fach === 'mathe'
    ? `Du bist ein erfahrener Grundschullehrer in NRW. Du analysierst Fotos von Hausaufgaben und Arbeitsblättern eines Kindes der Klasse 4 namens Emma.
Emmas bekannte Schwächen: Textaufgaben werden falsch interpretiert, arbeitet zu schnell ohne vollständiges Lesen, Zeitmanagement bei Klassenarbeiten.
Antworte immer auf Deutsch, klar und strukturiert.`
    : `Du bist ein erfahrener Grundschullehrer in NRW für das Fach Deutsch. Du analysierst Fotos von Hausaufgaben und Arbeitsblättern eines Kindes der Klasse 4 namens Emma.
Antworte immer auf Deutsch, klar und strukturiert.`;

  const userPrompt = `Hier ist der aktuelle Lernkontext für ${fach === 'mathe' ? 'Mathematik' : 'Deutsch'}:

${kontext}

${aktuellesThema ? `Aktuelles Thema im Lernplan: "${aktuellesThema.name}"` : ''}

Analysiere das Foto dieses Arbeitsblatts / dieser Hausaufgabe und erstelle einen kurzen strukturierten Bericht mit:

## Erkanntes Thema
(Was wird hier geübt?)

## Schwierigkeitsgrad
(Passend für Klasse 4 NRW? Zu leicht / angemessen / zu schwer?)

## Beobachtungen
(Was hat Emma richtig gemacht? Wo gibt es Fehler oder Auffälligkeiten?)

## Empfehlung
(Was sollte als nächstes geübt werden? Passt das zum Lernplan?)

## Kontext-Update
(1-3 Sätze die direkt an den bestehenden Kontext angehängt werden sollen, im Stil: "Datum: [heute]. Beobachtung: ...")

Halte dich kurz und präzise. Keine langen Einleitungen.`;

  showLoading('Foto wird analysiert…');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            state.apiKey,
        'anthropic-version':    '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text',  text: userPrompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data   = await response.json();
    const result = data.content[0].text;

    // Analyse-Ergebnis anzeigen
    showAnalyseResult(fach, result);

    // Kontext-Update extrahieren und anhängen
    const updateMatch = result.match(/## Kontext-Update\s*([\s\S]*?)(?=##|$)/i);
    if (updateMatch) {
      const update   = updateMatch[1].trim();
      const existing = $('kontext-' + fach).value;
      const updated  = existing
        ? existing + '\n\n---\n' + update
        : update;
      $('kontext-' + fach).value = updated;
      localStorage.setItem('emma_kontext_' + fach, updated);
      if (DRIVE.isLoggedIn()) {
        await DRIVE.writeFile(`kontext-${fach}.md`, updated);
      }
    }

    // Lernstrategie im Hintergrund automatisch aktualisieren
    generateStrategy(fach).catch(console.error);

  } catch (e) {
    showStatus(statusEl, 'Fehler: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function showAnalyseResult(fach, text) {
  const statusEl = $('analyse-status-' + fach);

  // Ergebnis-Box aufbauen
  let box = document.getElementById('analyse-result-' + fach);
  if (!box) {
    box = document.createElement('div');
    box.id = 'analyse-result-' + fach;
    box.className = 'analyse-result';
    statusEl.parentNode.insertBefore(box, statusEl.nextSibling);
  }

  // Markdown-ähnliche Formatierung (nur ## Überschriften + Zeilenumbrüche)
  const html = text
    .replace(/## (.+)/g, '<h4>$1</h4>')
    .replace(/\n/g, '<br>');

  box.innerHTML = `
    <div class="analyse-result-header">
      <strong>Analyse-Ergebnis</strong>
      <button class="btn-ghost-small" onclick="this.closest('.analyse-result').remove()">✕</button>
    </div>
    <div class="analyse-result-body">${html}</div>
    <p class="analyse-result-hint">✅ Kontext wurde automatisch aktualisiert.</p>
  `;

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================
// KONTEXT
// ============================================

function initKontext(fach) {
  const saved = localStorage.getItem('emma_kontext_' + fach);
  if (saved) $('kontext-' + fach).value = saved;

  $('save-kontext-' + fach).addEventListener('click', async () => {
    const text = $('kontext-' + fach).value;
    localStorage.setItem('emma_kontext_' + fach, text);

    if (DRIVE.isLoggedIn()) {
      try {
        await DRIVE.writeFile(`kontext-${fach}.md`, text);
        showStatus($('kontext-status-' + fach), 'In Google Drive gespeichert.');
      } catch (e) {
        showStatus($('kontext-status-' + fach), 'Drive-Fehler: ' + e.message, 'error');
      }
    } else {
      showStatus($('kontext-status-' + fach), 'Lokal gespeichert (nicht mit Drive verbunden).');
    }
  });
}

// ============================================
// PDF PLACEHOLDER
// ============================================

function initPdfButtons(fach) {
  $('gen-uebung-' + fach).addEventListener('click', () => handleGeneratePdf(fach, 'uebung'));
  $('gen-klausur-' + fach).addEventListener('click', () => handleGeneratePdf(fach, 'klausur'));
}

async function handleGeneratePdf(fach, modus) {
  if (!state.apiKey) { showSetupModal(); return; }

  const thema = getAktuellesThema(fach);
  if (!thema) {
    alert('Bitte erst ein aktuelles Thema im Lernplan setzen.');
    return;
  }

  const label = modus === 'klausur' ? 'Klassenarbeit' : 'Übungsblatt';
  showLoading(`${label} wird generiert…`);

  try {
    await PDF.generate(fach, modus, state.apiKey);
  } catch (e) {
    alert('Fehler beim Generieren: ' + e.message);
  } finally {
    hideLoading();
  }
}

// ============================================
// API KEY
// ============================================

function showSetupModal() {
  $('setup-modal').classList.remove('hidden');
}

function initApiKeySetup() {
  $('save-api-key').addEventListener('click', () => {
    const key = $('api-key-input').value.trim();
    if (!key.startsWith('sk-ant-')) { alert('Ungültiger API Key.'); return; }
    saveApiKey(key);
    $('setup-modal').classList.add('hidden');
  });

  if (state.apiKey) $('settings-api-key').value = state.apiKey;

  $('save-settings-api-key').addEventListener('click', () => {
    const key = $('settings-api-key').value.trim();
    if (!key.startsWith('sk-ant-')) {
      showStatus($('settings-api-status'), 'Ungültiger API Key.', 'error');
      return;
    }
    saveApiKey(key);
    showStatus($('settings-api-status'), 'API Key gespeichert.');
  });

  if (!state.apiKey) showSetupModal();
}

function saveApiKey(key) {
  state.apiKey = key;
  localStorage.setItem('emma_api_key', key);
}

// ============================================
// LERNSTRATEGIE
// ============================================

function initStrategy(fach) {
  // Gespeicherte Strategie laden
  const saved = localStorage.getItem('emma_strategie_' + fach);
  if (saved) renderStrategy(fach, saved);

  $('update-strategy-' + fach).addEventListener('click', () => handleGenerateStrategy(fach));
}

async function handleGenerateStrategy(fach) {
  if (!state.apiKey) { showSetupModal(); return; }

  const btn = $('update-strategy-' + fach);
  btn.textContent = '…';
  btn.disabled = true;

  try {
    await generateStrategy(fach);
    // Strategie-Card aufklappen
    const body = $('strategy-body-' + fach);
    const toggle = body.previousElementSibling?.querySelector('.toggle-btn');
    body.classList.remove('collapsed');
    if (toggle) toggle.classList.remove('collapsed');
  } catch (e) {
    alert('Fehler beim Generieren der Lernstrategie: ' + e.message);
  } finally {
    btn.textContent = '↺ Aktualisieren';
    btn.disabled = false;
  }
}

async function generateStrategy(fach) {
  const fachName  = fach === 'mathe' ? 'Mathematik' : 'Deutsch';
  const kontext   = $('kontext-' + fach).value || '(kein Kontext vorhanden)';
  const plan      = getPlan(fach);
  const punkte    = calcGesamtpunkte(fach);
  const level     = getLevel(punkte);

  const abgeschlossen = plan.themen.filter(t => t.status === 'abgeschlossen');
  const aktuell       = plan.themen.find(t => t.status === 'aktuell');
  const geplant       = plan.themen.filter(t => t.status === 'geplant');

  const planZusammenfassung = `
Abgeschlossene Themen: ${abgeschlossen.map(t => `"${t.name}" (${t.sterne}★)`).join(', ') || 'keine'}
Aktuelles Thema: ${aktuell ? `"${aktuell.name}"` : 'keines'}
Geplante Themen: ${geplant.map(t => `"${t.name}"`).join(', ') || 'keine'}
Gesamtpunkte: ${punkte} (Level: ${level.name})
Streak: ${plan.streak || 0} Tage`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Du bist ein erfahrener Grundschullehrer in NRW. Erstelle eine kompakte Lernstrategie für Emma, Klasse 4, Fach ${fachName}.

Lernkontext:
${kontext}

Lernplan-Status:
${planZusammenfassung}

Erstelle eine strukturierte Lernstrategie mit genau diesen Abschnitten (Markdown-Format, kurz und konkret):

## Stärken
(2–3 Stichpunkte was gut klappt)

## Schwächen & Baustellen
(2–3 konkrete Punkte worauf zu achten ist)

## Empfehlungen
(3 konkrete Maßnahmen für die nächsten 2–3 Wochen)

## Nächste Themen
(1–2 Themenvorschläge die nach dem aktuellen Thema sinnvoll wären)

Halte es kurz, klar und elterngerecht – keine Fachsprache.`,
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Speichern
  localStorage.setItem('emma_strategie_' + fach, text);
  if (DRIVE.isLoggedIn()) {
    await DRIVE.writeFile(`lernstrategie-${fach}.md`, text);
  }

  renderStrategy(fach, text);
}

function renderStrategy(fach, markdown) {
  const body = $('strategy-body-' + fach);

  // Einfaches Markdown → HTML (##, -, **)
  const html = markdown
    .replace(/## (.+)/g, '<h4 class="strat-heading">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•] (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  const lastUpdate = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  body.innerHTML = `
    <div class="strategy-content">${html}</div>
    <p class="strategy-updated">Zuletzt aktualisiert: ${lastUpdate}</p>
  `;
}

// ============================================
// GOOGLE AUTH
// ============================================

function updateAuthUI() {
  const loggedIn = DRIVE.isLoggedIn();
  $('google-login-btn').classList.toggle('hidden', loggedIn);
  $('google-logout-btn').classList.toggle('hidden', !loggedIn);
  $('user-info').classList.toggle('hidden', !loggedIn);
  if (loggedIn && DRIVE.getUserEmail()) {
    $('user-info').textContent = DRIVE.getUserEmail();
  }
}

function initGoogleAuth() {
  $('google-login-btn').addEventListener('click', () => DRIVE.login());
  $('google-logout-btn').addEventListener('click', () => {
    DRIVE.logout();
    updateAuthUI();
  });
}

// Lädt Kontext + Lernplan aus Drive und aktualisiert die App
async function loadFromDrive() {
  showLoading('Drive wird geladen…');
  try {
    // Lernplan
    const planRaw = await DRIVE.readFile('lernplan.json');
    if (planRaw) {
      try {
        const parsed = JSON.parse(planRaw);
        state.plan = parsed;
        localStorage.setItem('emma_lernplan', planRaw);
      } catch { /* korrupte Datei ignorieren */ }
    } else {
      // Erster Start: Default-Plan in Drive schreiben
      await DRIVE.writeFile('lernplan.json', JSON.stringify(state.plan, null, 2));
    }

    // Kontext-Dateien + Lernstrategie
    for (const fach of ['mathe', 'deutsch']) {
      const kontext = await DRIVE.readFile(`kontext-${fach}.md`);
      if (kontext) {
        $('kontext-' + fach).value = kontext;
        localStorage.setItem('emma_kontext_' + fach, kontext);
      } else {
        const lokal = localStorage.getItem('emma_kontext_' + fach) || '';
        if (lokal) await DRIVE.writeFile(`kontext-${fach}.md`, lokal);
      }

      const strategie = await DRIVE.readFile(`lernstrategie-${fach}.md`);
      if (strategie) {
        localStorage.setItem('emma_strategie_' + fach, strategie);
        renderStrategy(fach, strategie);
      }

      renderPlan(fach);
      renderRanking(fach);
    }
  } catch (e) {
    console.error('Drive Ladefehler:', e);
  } finally {
    hideLoading();
  }
}

// ============================================
// INIT
// ============================================

async function init() {
  initTabs();
  initToggles();
  initAbschlussModal();

  ['mathe', 'deutsch'].forEach(fach => {
    initAddTopic(fach);
    initUpload(fach);
    initKontext(fach);
    initPdfButtons(fach);
    initStrategy(fach);
    renderPlan(fach);
    renderRanking(fach);
  });

  initApiKeySetup();
  initGoogleAuth();

  // Drive initialisieren (Token aus URL-Hash oder localStorage)
  try {
    const loggedIn = await DRIVE.init();
    updateAuthUI();
    if (loggedIn) await loadFromDrive();
  } catch (e) {
    console.error('Drive init Fehler:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
