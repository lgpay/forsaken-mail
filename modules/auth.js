'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const authConfig = config.auth || {};
const sessions = new Map();
const statePath = path.resolve(__dirname, '..', authConfig.statePath || './data/auth-state.json');
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

function generatePassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
}

function loadState() {
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (parsed && parsed.passwordHash) {
        return {
          passwordHash: String(parsed.passwordHash),
          generatedPassword: parsed.generatedPassword ? String(parsed.generatedPassword) : '',
          passwordChangedAt: parsed.passwordChangedAt || null,
          generatedAt: parsed.generatedAt || null
        };
      }
    } catch (_) {}
  }

  const configured = String(authConfig.ownerPassword || '').trim();
  if (configured) {
    const state = {
      passwordHash: sha256(configured),
      generatedPassword: '',
      passwordChangedAt: new Date().toISOString(),
      generatedAt: null
    };
    persistState(state);
    return state;
  }

  const generatedPassword = generatePassword();
  const state = {
    passwordHash: sha256(generatedPassword),
    generatedPassword,
    passwordChangedAt: null,
    generatedAt: new Date().toISOString()
  };
  persistState(state);
  console.log('[auth] Generated initial owner password:', generatedPassword);
  console.log('[auth] Stored auth state at:', statePath);
  return state;
}

function persistState(state) {
  const tempPath = statePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
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
  return sha256(String(password || '')) === state.passwordHash;
}

function changePassword(newPassword) {
  const normalized = String(newPassword || '').trim();
  if (normalized.length < 8) {
    const error = new Error('password too short');
    error.code = 'PASSWORD_TOO_SHORT';
    throw error;
  }

  state = {
    passwordHash: sha256(normalized),
    generatedPassword: '',
    passwordChangedAt: new Date().toISOString(),
    generatedAt: state.generatedAt || new Date().toISOString()
  };
  persistState(state);
  return getAuthInfo();
}

function getAuthInfo() {
  return {
    statePath,
    hasConfiguredPassword: !state.generatedPassword,
    generatedPassword: state.generatedPassword || '',
    generatedAt: state.generatedAt || null,
    passwordChangedAt: state.passwordChangedAt || null
  };
}

function buildSetCookie(token, expiresAt) {
  const parts = [
    'fm_session=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor((expiresAt - Date.now()) / 1000)
  ];
  return parts.join('; ');
}

function buildClearCookie() {
  return 'fm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
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
  cleanupExpiredSessions
};
