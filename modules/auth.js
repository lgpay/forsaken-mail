'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const authConfig = config.auth || {};
const sessions = new Map();
const statePath = path.resolve(__dirname, '..', authConfig.statePath || './data/auth-state.json');
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 32 * 1024 * 1024 };
fs.mkdirSync(path.dirname(statePath), { recursive: true });

function getCookie(req, name) {
  const cookieHeader = req && req.headers ? req.headers.cookie || '' : '';
  const parts = cookieHeader.split(';').map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === name) return decodeURIComponent(value);
  }
  return '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64'),
    hash.toString('base64')
  ].join('$');
}

function verifyScryptPassword(password, record) {
  const parts = String(record || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [_, nValue, rValue, pValue, saltValue, hashValue] = parts;
  const N = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || N < 2 || r < 1 || p < 1) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, 'base64');
    const expected = Buffer.from(hashValue, 'base64');
    if (!salt.length || !expected.length) return false;
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(32 * 1024 * 1024, 128 * N * r + 1024 * 1024)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function normalizeState(parsed) {
  if (!parsed || !parsed.passwordHash) return null;
  return {
    passwordHash: String(parsed.passwordHash),
    passwordChangedAt: parsed.passwordChangedAt || null,
    generatedAt: parsed.generatedAt || null
  };
}

function loadState() {
  if (fs.existsSync(statePath)) {
    try {
      const state = normalizeState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
      if (state) return state;
    } catch (_) {}
  }

  const configured = String(authConfig.ownerPassword || '').trim();
  if (!configured) {
    throw new Error('Owner password is not configured. Set OWNER_PASSWORD_FILE, OWNER_PASSWORD, or auth.ownerPassword before starting the service.');
  }

  const state = {
    passwordHash: createPasswordHash(configured),
    passwordChangedAt: new Date().toISOString(),
    generatedAt: null
  };
  persistState(state);
  return state;
}

function persistState(nextState) {
  const tempPath = statePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(nextState, null, 2));
  fs.renameSync(tempPath, statePath);
}

let state = loadState();

function getSessionTtlMs() {
  const hours = Number(authConfig.sessionTtlHours || 168);
  return Math.max(1, hours) * 60 * 60 * 1000;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function createSession() {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + getSessionTtlMs();
  sessions.set(token, { token, expiresAt, role: 'owner' });
  return { token, expiresAt };
}

function clearSession(token) {
  if (token) {
    sessions.delete(token);
  }
}

function getSession(token) {
  cleanupExpiredSessions();
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function getSessionFromRequest(req) {
  const token = getCookie(req, 'fm_session');
  return getSession(token);
}

function isOwnerRequest(req) {
  return !!getSessionFromRequest(req);
}

function verifyPassword(password) {
  const storedHash = state.passwordHash;
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    return verifyScryptPassword(password, storedHash);
  }

  if (!LEGACY_SHA256_PATTERN.test(storedHash)) return false;
  const valid = safeEqual(sha256(String(password || '')), storedHash);
  if (valid) {
    state = {
      passwordHash: createPasswordHash(String(password || '')),
      passwordChangedAt: state.passwordChangedAt || new Date().toISOString(),
      generatedAt: state.generatedAt || null
    };
    persistState(state);
  }
  return valid;
}

function changePassword(newPassword) {
  const normalized = String(newPassword || '').trim();
  if (normalized.length < 8) {
    const error = new Error('password too short');
    error.code = 'PASSWORD_TOO_SHORT';
    throw error;
  }

  state = {
    passwordHash: createPasswordHash(normalized),
    passwordChangedAt: new Date().toISOString(),
    generatedAt: state.generatedAt || null
  };
  persistState(state);
  return getAuthInfo();
}

function getAuthInfo() {
  return {
    statePath,
    passwordChangedAt: state.passwordChangedAt || null
  };
}

function requireHttps() {
  return authConfig.requireHttps !== false;
}

function isSecureRequest(req) {
  return !requireHttps() || !!(req && req.secure);
}

function buildSetCookie(token, expiresAt) {
  const parts = [
    'fm_session=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly'
  ];
  if (requireHttps()) parts.push('Secure');
  parts.push(
    'SameSite=Strict',
    'Max-Age=' + Math.floor((expiresAt - Date.now()) / 1000)
  );
  return parts.join('; ');
}

function buildClearCookie() {
  const parts = ['fm_session=', 'Path=/', 'HttpOnly'];
  if (requireHttps()) parts.push('Secure');
  parts.push('SameSite=Strict', 'Max-Age=0');
  return parts.join('; ');
}

module.exports = {
  createSession,
  clearSession,
  getSession,
  getSessionFromRequest,
  isOwnerRequest,
  verifyPassword,
  changePassword,
  getAuthInfo,
  buildSetCookie,
  buildClearCookie,
  cleanupExpiredSessions,
  isSecureRequest,
  requireHttps
};
