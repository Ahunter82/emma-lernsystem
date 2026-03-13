/* =============================================
   Emma Lernsystem – drive.js
   Google Drive API Wrapper (OAuth Implicit Flow)
   ============================================= */

'use strict';

const DRIVE = (() => {

  const CLIENT_ID    = '1025906065481-4o7uqgog4gqoalk0uqhjnee9ukkug2ad.apps.googleusercontent.com';
  const SCOPE        = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
  const FOLDER_NAME  = 'Emma-Lernsystem';

  // Redirect URI muss exakt mit Google Console übereinstimmen
  const REDIRECT_URI = window.location.hostname === 'ahunter82.github.io'
    ? 'https://ahunter82.github.io/emma-lernsystem'
    : 'http://localhost';

  // ---- interner State ----
  let _token    = null;
  let _expiry   = 0;
  let _folderId = null;
  let _fileIds  = {};   // filename → fileId Cache
  let _userEmail = null;

  // ---- Token Handling ----

  function _saveToken(token, expiresIn) {
    _token  = token;
    _expiry = Date.now() + (parseInt(expiresIn) - 60) * 1000; // 60s Puffer
    localStorage.setItem('emma_g_token',  token);
    localStorage.setItem('emma_g_expiry', _expiry);
  }

  function _loadToken() {
    const t = localStorage.getItem('emma_g_token');
    const e = parseInt(localStorage.getItem('emma_g_expiry') || '0');
    if (t && Date.now() < e) { _token = t; _expiry = e; return true; }
    return false;
  }

  function _clearToken() {
    _token = null; _expiry = 0; _folderId = null; _fileIds = {}; _userEmail = null;
    localStorage.removeItem('emma_g_token');
    localStorage.removeItem('emma_g_expiry');
  }

  // Liest Token + User-Email aus URL-Hash nach OAuth-Redirect
  async function handleCallback() {
    const hash   = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token  = params.get('access_token');
    const expires = params.get('expires_in');
    const error  = params.get('error');

    if (error) {
      history.replaceState(null, '', window.location.pathname);
      throw new Error('Google Login abgebrochen: ' + error);
    }
    if (!token) return false;

    _saveToken(token, expires);
    history.replaceState(null, '', window.location.pathname);
    await _fetchUserEmail();
    return true;
  }

  function isLoggedIn() {
    return !!_token && Date.now() < _expiry;
  }

  function getUserEmail() { return _userEmail; }

  // ---- OAuth Login / Logout ----

  function login() {
    const p = new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'token',
      scope:         SCOPE,
      prompt:        'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  function logout() {
    _clearToken();
  }

  // ---- API Hilfsfunktionen ----

  async function _api(url, opts = {}) {
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
    // 204 No Content
    if (res.status === 204) return null;
    return res.json();
  }

  async function _fetchUserEmail() {
    try {
      const info = await _api('https://www.googleapis.com/oauth2/v2/userinfo');
      _userEmail = info.email;
    } catch { /* ignorieren */ }
  }

  // ---- Ordner ----

  async function _getOrCreateFolder() {
    if (_folderId) return _folderId;

    const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await _api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);

    if (res.files?.length) {
      _folderId = res.files[0].id;
      return _folderId;
    }

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
      const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
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

  // ---- Datei schreiben (anlegen oder updaten) ----

  async function writeFile(filename, content) {
    const folderId = await _getOrCreateFolder();
    const blob     = new Blob([content], { type: 'text/plain' });

    // FileId aus Cache oder Drive-Suche
    if (!_fileIds[filename]) {
      const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
      const res = await _api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
      if (res.files?.length) _fileIds[filename] = res.files[0].id;
    }

    if (_fileIds[filename]) {
      // Update
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${_fileIds[filename]}?uploadType=media`,
        { method: 'PATCH', headers: { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'text/plain' }, body: blob }
      );
    } else {
      // Neu anlegen (multipart)
      const meta = JSON.stringify({ name: filename, parents: [folderId] });
      const form = new FormData();
      form.append('metadata', new Blob([meta], { type: 'application/json' }));
      form.append('file', blob);
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Authorization': `Bearer ${_token}` }, body: form }
      );
      const data = await res.json();
      _fileIds[filename] = data.id;
    }
  }

  // ---- Init: Token laden + ggf. Callback verarbeiten ----

  async function init() {
    // 1. OAuth-Callback aus URL-Hash?
    const fromCallback = await handleCallback();
    if (fromCallback) return true;

    // 2. Gespeichertes Token noch gültig?
    if (_loadToken()) {
      await _fetchUserEmail();
      return true;
    }

    return false;
  }

  // Public API
  return { init, login, logout, isLoggedIn, getUserEmail, readFile, writeFile };

})();
