'use strict';

const config = require('./config');

const inboxes = new Map();
const sessions = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function getConfiguredHost() {
  return String(config.host || '').trim();
}

function resolveHost(runtimeHost) {
  const normalizedRuntime = String(runtimeHost || '').trim().toLowerCase();
  if (normalizedRuntime) {
    return normalizedRuntime;
  }
  const configured = getConfiguredHost();
  return configured || 'localhost';
}

function getAddress(inbox, runtimeHost) {
  return `${inbox}@${resolveHost(runtimeHost)}`;
}

function cleanup() {
  const now = Date.now();
  for (const [inbox, entry] of inboxes.entries()) {
    if (!entry) {
      inboxes.delete(inbox);
      continue;
    }

    const onlineCount = entry.sessions ? entry.sessions.size : 0;
    const expired = entry.expiresAt && entry.expiresAt <= now;
    if (entry.mode === 'anonymous' && onlineCount === 0 && expired) {
      inboxes.delete(inbox);
    }
  }
}

function ensureAnonymousInbox(inbox) {
  cleanup();
  if (!inboxes.has(inbox)) {
    inboxes.set(inbox, {
      inbox,
      mode: 'anonymous',
      expiresAt: Date.now() + DEFAULT_TTL_MS,
      sessions: new Set(),
      mailIds: [],
      mails: []
    });
  }

  const entry = inboxes.get(inbox);
  entry.mode = 'anonymous';
  entry.expiresAt = Date.now() + DEFAULT_TTL_MS;
  entry.sessions = entry.sessions || new Set();
  entry.mailIds = entry.mailIds || [];
  entry.mails = entry.mails || [];
  return entry;
}

function ensurePersistentInbox(inbox) {
  cleanup();
  if (!inboxes.has(inbox)) {
    inboxes.set(inbox, {
      inbox,
      mode: 'persistent',
      expiresAt: null,
      sessions: new Set(),
      mailIds: [],
      mails: []
    });
  }

  const entry = inboxes.get(inbox);
  entry.mode = 'persistent';
  entry.expiresAt = null;
  entry.sessions = entry.sessions || new Set();
  entry.mailIds = entry.mailIds || [];
  entry.mails = entry.mails || [];
  return entry;
}

function bindSession(sessionId, inbox, mode, runtimeHost, ownerId) {
  cleanup();
  unbindSession(sessionId);
  const entry = mode === 'persistent' ? ensurePersistentInbox(inbox) : ensureAnonymousInbox(inbox);
  entry.sessions.add(sessionId);
  sessions.set(sessionId, { inbox, mode, host: resolveHost(runtimeHost), ownerId: ownerId || null });
  return entry;
}

function unbindSession(sessionId, ownerId) {
  const current = sessions.get(sessionId);
  if (!current || (ownerId && current.ownerId !== ownerId)) return;
  const entry = inboxes.get(current.inbox);
  if (entry && entry.sessions) {
    entry.sessions.delete(sessionId);
    if (entry.mode === 'anonymous' && entry.sessions.size === 0) {
      entry.expiresAt = Date.now() + DEFAULT_TTL_MS;
    }
  }
  sessions.delete(sessionId);
  cleanup();
}

function getSessionInbox(sessionId, runtimeHost) {
  cleanup();
  const current = sessions.get(sessionId);
  if (!current) return null;
  const entry = inboxes.get(current.inbox);
  if (!entry) return null;
  const host = resolveHost(runtimeHost || current.host);
  return {
    inbox: entry.inbox,
    mode: entry.mode,
    address: getAddress(entry.inbox, host),
    host
  };
}

function getInboxMode(inbox) {
  cleanup();
  const entry = inboxes.get(inbox);
  return entry ? entry.mode : 'persistent';
}

function saveAnonymousMail(inbox, mail) {
  const entry = ensureAnonymousInbox(inbox);
  entry.mails.unshift(mail);
  entry.mailIds = entry.mails.map(item => item.id);
  entry.expiresAt = Date.now() + DEFAULT_TTL_MS;
  if (entry.mails.length > 30) {
    entry.mails = entry.mails.slice(0, 30);
    entry.mailIds = entry.mailIds.slice(0, 30);
  }
}

function listAnonymousMails(inbox) {
  cleanup();
  const entry = inboxes.get(inbox);
  if (!entry || entry.mode !== 'anonymous') return [];
  return entry.mails.slice();
}

function getAnonymousMailById(id) {
  cleanup();
  const target = Number(id);
  for (const entry of inboxes.values()) {
    if (!entry || entry.mode !== 'anonymous') continue;
    const match = (entry.mails || []).find(mail => mail.id === target);
    if (match) return match;
  }
  return null;
}

function canAccessInbox(sessionId, inbox, isOwner) {
  if (isOwner) return true;
  const current = sessions.get(sessionId);
  return !!(current && current.inbox === inbox);
}

module.exports = {
  bindSession,
  unbindSession,
  getSessionInbox,
  getInboxMode,
  saveAnonymousMail,
  listAnonymousMails,
  getAnonymousMailById,
  canAccessInbox,
  ensureAnonymousInbox,
  ensurePersistentInbox,
  getAddress,
  resolveHost,
  cleanup
};
