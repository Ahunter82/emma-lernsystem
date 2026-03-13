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
// ANALYSE (Placeholder – Anthropic API kommt in Schritt 3)
// ============================================

function handleAnalyse(fach) {
  if (!state.uploads[fach]) return;
  if (!state.apiKey) { showSetupModal(); return; }
  showStatus($('analyse-status-' + fach), 'Analyse-Funktion wird in Schritt 3 implementiert (Anthropic API).', 'info');
}

// ============================================
// KONTEXT
// ============================================

function initKontext(fach) {
  const saved = localStorage.getItem('emma_kontext_' + fach);
  if (saved) $('kontext-' + fach).value = saved;

  $('save-kontext-' + fach).addEventListener('click', () => {
    localStorage.setItem('emma_kontext_' + fach, $('kontext-' + fach).value);
    showStatus($('kontext-status-' + fach), 'Lokal gespeichert (Google Drive folgt in Schritt 2).');
  });
}

// ============================================
// PDF PLACEHOLDER
// ============================================

function initPdfButtons(fach) {
  $('gen-uebung-' + fach).addEventListener('click', () => {
    const thema = getAktuellesThema(fach);
    if (!thema) {
      alert('Bitte erst ein aktuelles Thema im Lernplan setzen.');
      return;
    }
    alert(`PDF-Generierung (Schritt 5) für:\n"${thema.name}"`);
  });

  $('gen-klausur-' + fach).addEventListener('click', () => {
    alert('Klassenarbeit-Simulation wird in Schritt 6 implementiert.');
  });
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
// GOOGLE AUTH PLACEHOLDER
// ============================================

function initGoogleAuth() {
  $('google-login-btn').addEventListener('click', () => {
    alert('Google Drive Login wird in Schritt 2 implementiert.');
  });
  $('google-logout-btn').addEventListener('click', () => {
    alert('Google Drive Logout wird in Schritt 2 implementiert.');
  });
}

// ============================================
// INIT
// ============================================

function init() {
  initTabs();
  initToggles();
  initAbschlussModal();

  ['mathe', 'deutsch'].forEach(fach => {
    initAddTopic(fach);
    initUpload(fach);
    initKontext(fach);
    initPdfButtons(fach);
    renderPlan(fach);
    renderRanking(fach);
  });

  initApiKeySetup();
  initGoogleAuth();
}

document.addEventListener('DOMContentLoaded', init);
