'use strict';
(() => {
  const CONFIG = window.BLOBBY_CONFIG || {};
  const ACTIVATION_KEY = 'blobby.license.activation.v1';
  const INSTALLATION_KEY = 'blobby.license.installation.v1';
  const VERIFY_INTERVAL_MS = Math.max(1, Number(CONFIG.VERIFY_INTERVAL_HOURS || 12)) * 60 * 60 * 1000;
  const OFFLINE_GRACE_MS = Math.max(1, Number(CONFIG.OFFLINE_GRACE_HOURS || 72)) * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;

  const $ = (id) => document.getElementById(id);
  const gate = $('licenseGate');
  const form = $('licenseForm');
  const input = $('licenseKeyInput');
  const button = $('licenseSubmit');
  const status = $('licenseStatus');
  const detail = $('licenseDetail');
  const support = $('licenseSupport');
  let appLoaded = false;
  let checking = false;
  let unlocked = false;
  let visibilityCheckInFlight = false;

  function configured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(CONFIG.SUPABASE_URL || '')) &&
      String(CONFIG.SUPABASE_PUBLISHABLE_KEY || '').length > 20 &&
      !String(CONFIG.SUPABASE_PUBLISHABLE_KEY || '').includes('YOUR_');
  }

  function readJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function randomInstallationId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  function installationId() {
    let id = '';
    try { id = localStorage.getItem(INSTALLATION_KEY) || ''; } catch {}
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      id = randomInstallationId();
      try { localStorage.setItem(INSTALLATION_KEY, id); } catch {}
    }
    return id;
  }

  function normalizeKey(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = raw.startsWith('BLOBBY') ? raw.slice(6) : raw;
    return body ? `BLOBBY-${body.match(/.{1,4}/g)?.join('-') || body}` : '';
  }

  function forceLicenseViewport() {
    try {
      if (window.BlobbyBridge?.isAppInventor?.()) window.BlobbyBridge.send('HOME');
    } catch {}
  }

  function message(kind, text, more = '') {
    document.body.dataset.licenseUi = kind;
    status.textContent = text || '';
    detail.textContent = more || '';
  }
  function setBusy(value) {
    checking = value;
    input.disabled = value;
    button.disabled = value;
    button.textContent = value ? 'Checking…' : 'Unlock blobby';
  }
  function showGate(kind = 'idle', text = 'Enter your access key to continue.', more = '') {
    forceLicenseViewport();
    const wasUnlocked = unlocked;
    unlocked = false;
    document.body.dataset.licenseState = 'locked';
    if (wasUnlocked) window.dispatchEvent(new CustomEvent('blobby:license-locked'));
    gate.hidden = false;
    message(kind, text, more);
    setTimeout(() => { if (!checking) input.focus(); }, 30);
  }

  function loadApp() {
    if (appLoaded) return;
    appLoaded = true;
    const s = document.createElement('script');
    s.src = './app.js';
    s.async = false;
    s.dataset.blobbyMain = 'true';
    s.onerror = () => {
      appLoaded = false;
      showGate('error', 'blobby.vip could not start.', 'Reload the page and try again.');
    };
    document.body.appendChild(s);
  }
  function unlock(mode = 'online') {
    unlocked = true;
    gate.hidden = true;
    document.body.dataset.licenseState = 'unlocked';
    document.body.dataset.licenseMode = mode;
    loadApp();
    window.dispatchEvent(new CustomEvent('blobby:license-unlocked', { detail: { mode } }));
  }

  function saveActivation(data) {
    const previous = readJSON(ACTIVATION_KEY, {}) || {};
    const next = {
      token: String(data.token || previous.token || ''),
      keyHint: String(data.keyHint || previous.keyHint || ''),
      assignedName: String(data.assignedName || previous.assignedName || ''),
      expiresAt: data.expiresAt || previous.expiresAt || null,
      lastVerified: Date.now()
    };
    writeJSON(ACTIVATION_KEY, next);
    return next;
  }
  function clearActivation() {
    try { localStorage.removeItem(ACTIVATION_KEY); } catch {}
  }
  function cachedExpired(saved) {
    if (!saved?.expiresAt) return false;
    const t = new Date(saved.expiresAt).getTime();
    return Number.isFinite(t) && t <= Date.now();
  }

  function functionUrl() {
    return String(CONFIG.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/license-public';
  }

  async function api(action, payload) {
    if (!configured()) throw Object.assign(new Error('owner_setup_required'), { code: 'owner_setup_required' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(functionUrl(), {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({ action, ...payload })
      });
      let body = {};
      try { body = await res.json(); } catch {}
      if (res.status === 429) return { ok: false, code: 'rate_limited' };
      if (!res.ok) return { ok: false, code: body.code || 'server_error' };
      return body;
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, code: 'offline' };
      return { ok: false, code: 'offline' };
    } finally { clearTimeout(timer); }
  }

  function applyFailure(code) {
    const map = {
      invalid: ['invalid', 'That access key could not be verified.', 'Check the key and try again.'],
      already_activated: ['blocked', 'This access key is already activated on another installation.', 'Contact the administrator if you changed devices.'],
      expired: ['blocked', 'This access key has expired.', 'Contact the administrator if you need renewed access.'],
      revoked: ['blocked', 'This access key has been revoked.', 'Contact the administrator if you believe this is a mistake.'],
      installation_reset: ['blocked', 'This installation is no longer registered.', 'Enter your access key again, or contact the administrator.'],
      token_invalid: ['invalid', 'Your saved activation is no longer valid.', 'Enter your access key again.'],
      rate_limited: ['blocked', 'Too many attempts.', 'Wait a little while before trying again.'],
      owner_setup_required: ['error', 'Owner setup is not complete.', 'Configure config.js and deploy the Supabase backend before issuing keys.'],
      server_error: ['error', 'The access server is temporarily unavailable.', 'Try again shortly.'],
      offline: ['offline', 'blobby.vip needs an internet connection to verify your access.', 'Reconnect and try again.']
    };
    const [kind, text, more] = map[code] || map.server_error;
    showGate(kind, text, more);
  }

  async function activate(key) {
    setBusy(true);
    message('validating', 'Checking your access key…', 'This normally takes only a moment.');
    const result = await api('activate', { key: normalizeKey(key), installationId: installationId() });
    setBusy(false);
    if (result?.ok && result.status === 'active' && result.token) {
      saveActivation(result);
      message('success', 'Access granted.', 'Opening blobby.vip…');
      setTimeout(() => unlock('online'), 220);
      return;
    }
    applyFailure(result?.code || result?.status || 'server_error');
  }

  async function verify(saved, { allowOffline = true, background = false } = {}) {
    if (!saved?.token) return { ok: false, code: 'token_invalid' };
    const result = await api('verify', { token: saved.token, installationId: installationId() });
    if (result?.ok && result.status === 'active' && result.token) {
      saveActivation(result);
      return { ok: true, mode: 'online' };
    }
    if ((result?.code === 'offline' || result?.code === 'server_error') && allowOffline) {
      const age = Date.now() - Number(saved.lastVerified || 0);
      if (!cachedExpired(saved) && age >= 0 && age <= OFFLINE_GRACE_MS) return { ok: true, mode: 'offline' };
    }
    if (!background && !['offline','server_error'].includes(result?.code)) clearActivation();
    return { ok: false, code: result?.code || result?.status || 'server_error' };
  }

  async function bootstrap() {
    document.body.dataset.licenseState = 'booting';
    forceLicenseViewport();
    if (CONFIG.SUPPORT_URL) {
      support.href = CONFIG.SUPPORT_URL;
      support.hidden = false;
    }
    if (!configured()) {
      applyFailure('owner_setup_required');
      return;
    }
    const saved = readJSON(ACTIVATION_KEY, null);
    if (!saved?.token) {
      showGate('idle', 'Enter your access key to continue.', 'One key can be active on one installation at a time.');
      return;
    }
    if (cachedExpired(saved)) {
      clearActivation();
      applyFailure('expired');
      return;
    }
    const age = Date.now() - Number(saved.lastVerified || 0);
    if (age >= 0 && age < VERIFY_INTERVAL_MS) {
      unlock('cached');
      return;
    }
    message('validating', 'Verifying your access…', '');
    const result = await verify(saved, { allowOffline: true });
    if (result.ok) unlock(result.mode);
    else applyFailure(result.code);
  }

  async function verifyWhenDue() {
    if (!unlocked || visibilityCheckInFlight || document.visibilityState !== 'visible') return;
    const saved = readJSON(ACTIVATION_KEY, null);
    if (!saved?.token) return;
    if (Date.now() - Number(saved.lastVerified || 0) < VERIFY_INTERVAL_MS) return;
    visibilityCheckInFlight = true;
    const result = await verify(saved, { allowOffline: true, background: true });
    visibilityCheckInFlight = false;
    if (!result.ok && !['offline','server_error'].includes(result.code)) {
      clearActivation();
      applyFailure(result.code);
    }
  }

  input.addEventListener('input', () => {
    const start = input.selectionStart;
    const next = normalizeKey(input.value);
    if (input.value !== next) input.value = next;
    try { input.setSelectionRange(Math.min(start + 1, next.length), Math.min(start + 1, next.length)); } catch {}
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (checking) return;
    const key = normalizeKey(input.value);
    if (!/^BLOBBY-(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}$/.test(key)) {
      message('invalid', 'Enter a complete blobby.vip access key.', 'Example: BLOBBY-ABCD-EFGH-JKLM-NPQR');
      input.focus();
      return;
    }
    activate(key);
  });
  document.addEventListener('visibilitychange', verifyWhenDue);

  window.BlobbyLicense = Object.freeze({
    state: () => ({ unlocked, mode: document.body.dataset.licenseMode || '', configured: configured() }),
    reverify: verifyWhenDue,
    chatCredentials: () => {
      const saved = readJSON(ACTIVATION_KEY, null);
      return {
        token: saved?.token || '',
        installationId: installationId(),
        assignedName: saved?.assignedName || '',
        keyHint: saved?.keyHint || ''
      };
    }
  });

  bootstrap();
})();
