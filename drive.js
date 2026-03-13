/* =============================================
   Emma Lernsystem – drive.js
   Google Drive API – Google Identity Services (GIS)
   Kein Redirect, Popup-basiert, dauerhafter Login
   ============================================= */

'use strict';

const DRIVE = (() => {

  const CLIENT_ID   = '1025906065481-4o7uqgog4gqoalk0uqhjnee9ukkug2ad.apps.googleusercontent.com';
  const SCOPE       = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
  const FOLDER_NAME = 'Emma-Lernsystem';

  let _token     = null;
  let _expiry    = 0;
  let _folderId  = null;
  let _fileIds   = {};
  let _userEmail = null;
  let _tokenClient = null;  // GIS TokenClient

  // ---- Token Handling ----

  function _saveToken(token, expiresIn) {
    _token  = token;
    _expiry = Date.now() + (parseInt(expiresIn) - 60) * 1000;
    localStorage.setItem('emma_g_token',  token);
    localStorage.setItem('emma_g_expiry', String(_expiry));
    localStorage.setItem('emma_g_email',  _userEmail || '');
  }

  function _loadToken() {
    const t = localStorage.getItem('emma_g_token');
    const e = parseInt(localStorage.getItem('emma_g_expiry') || '0');
    if (t && Date.now() < e) {
      _token     = t;
      _expiry    = e;
      _userEmail = localStorage.getItem('emma_g_email') || null;
      return true;
    }
    return false;
  }

  function _clearToken() {
    _token = null; _expiry = 0; _folderId = null; _fileIds = {}; _userEmail = null;
    localStorage.removeItem('emma_g_token');
    localStorage.removeItem('emma_g_expiry');
    localStorage.removeItem('emma_g_email');
  }

  // ---- GIS TokenClient initialisieren ----

  function _initTokenClient(callback) {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback,
    });
  }

  // Token anfordern – gibt Promise zurück, löst mit true/false auf
  function _requestToken(prompt = '') {
    return new Promise((resolve, reject) => {
      _initTokenClient(async (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        _token = response.access_token;
        await _fetchUserEmail();
        _saveToken(response.access_token, response.expires_in || 3600);
        resolve(true);
      });
      _tokenClient.requestAccessToken({ prompt });
    });
  }

  // ---- Login / Logout ----

  // Erster Login: mit Account-Auswahl
  async function login() {
    await _requestToken('select_account');
  }

  // Stilles Re-Login: kein Popup wenn Google-Session noch aktiv
  async function _silentRefresh() {
    try {
      await _requestToken('');
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    if (_token) {
      google.accounts.oauth2.revoke(_token, () => {});
    }
    _clearToken();
  }

  function isLoggedIn() {
    return !!_token && Date.now() < _expiry;
  }

  function getUserEmail() { return _userEmail; }

  // ---- API Hilfsfunktionen ----

  async function _api(url, opts = {}) {
    // Token abgelaufen? → Stilles Refresh versuchen
    if (!isLoggedIn() && _token) {
      const ok = await _silentRefresh();
      if (!ok) throw new Error('Nicht mehr eingeloggt.');
    }

    const res = await fetch(url, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${_token}`,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function _fetchUserEmail() {
    try {
      const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${_token}` },
      });
      const data = await info.json();
      _userEmail = data.email || null;
    } catch { /* ignorieren */ }
  }

  // ---- Ordner ----

  async function _getOrCreateFolder() {
    if (_folderId) return _folderId;
    const q   = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await _api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if (res.files?.length) { _folderId = res.files[0].id; return _folderId; }
    const folder = await _api('https://www.googleapis.com/drive/v3/files', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    _folderId = folder.id;
    return _folderId;
  }

  // ---- Datei lesen ----

  async function readFile(filename) {
    const folderId = await _getOrCreateFolder();
    if (!_fileIds[filename]) {
      const q   = `name='${filename}' and '${folderId}' in parents and trashed=false`;
      const res = await _api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
      if (!res.files?.length) return null;
      _fileIds[filename] = res.files[0].id;
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${_fileIds[filename]}?alt=media`,
      { headers: { 'Authorization': `Bearer ${_token}` } }
    );
    if (!res.ok) return null;
    return res.text();
  }

  // ---- Datei schreiben ----

  async function writeFile(filename, content) {
    const folderId = await _getOrCreateFolder();
    const blob     = new Blob([content], { type: 'text/plain' });
    if (!_fileIds[filename]) {
      const q   = `name='${filename}' and '${folderId}' in parents and trashed=false`;
      const res = await _api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
      if (res.files?.length) _fileIds[filename] = res.files[0].id;
    }
    if (_fileIds[filename]) {
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${_fileIds[filename]}?uploadType=media`,
        { method: 'PATCH', headers: { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'text/plain' }, body: blob }
      );
    } else {
      const meta = JSON.stringify({ name: filename, parents: [folderId] });
      const form = new FormData();
      form.append('metadata', new Blob([meta], { type: 'application/json' }));
      form.append('file', blob);
      const res  = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Authorization': `Bearer ${_token}` }, body: form }
      );
      const data = await res.json();
      _fileIds[filename] = data.id;
    }
  }

  // ---- Init ----

  async function init() {
    // Warten bis GIS geladen ist
    await _waitForGIS();

    // Gespeichertes Token noch gültig?
    if (_loadToken()) return true;

    // Token abgelaufen aber E-Mail bekannt → stilles Refresh versuchen
    const savedEmail = localStorage.getItem('emma_g_email');
    if (savedEmail) {
      const ok = await _silentRefresh();
      if (ok) return true;
    }

    return false;
  }

  function _waitForGIS() {
    return new Promise(resolve => {
      if (typeof google !== 'undefined' && google.accounts) { resolve(); return; }
      const interval = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  return { init, login, logout, isLoggedIn, getUserEmail, readFile, writeFile };

})();
