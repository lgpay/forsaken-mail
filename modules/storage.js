'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

const storageConfig = config.storage || {};
const dataDir = path.resolve(__dirname, '..', 'data');
const storagePath = path.resolve(__dirname, '..', storageConfig.path || './data/forsaken-mail.json');
const defaultState = { nextId: 1, mails: [] };
const SQLITE_MAGIC = 'SQLite format 3';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(storagePath), { recursive: true });

function detectStorageMode() {
  if (!fs.existsSync(storagePath)) {
    return { blocked: false, format: 'json', reason: '' };
  }

  try {
    const fd = fs.openSync(storagePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    const prefix = buffer.slice(0, bytesRead).toString('utf8');

    if (prefix.startsWith(SQLITE_MAGIC)) {
      return {
        blocked: true,
        format: 'sqlite',
        reason: 'Storage file is a legacy SQLite database, but the current build expects JSON storage. Please migrate or point storage.path to a JSON file.'
      };
    }
  } catch (error) {
    return {
      blocked: true,
      format: 'unknown',
      reason: 'Failed to inspect storage file: ' + error.message
    };
  }

  return { blocked: false, format: 'json', reason: '' };
}

const storageStatus = detectStorageMode();

function ensureWritableStorage() {
  if (!storageStatus.blocked) {
    return;
  }

  const error = new Error(storageStatus.reason);
  error.code = 'STORAGE_BLOCKED';
  throw error;
}

function loadState() {
  ensureWritableStorage();

  if (!fs.existsSync(storagePath)) {
    return { ...defaultState };
  }

  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      nextId: Number(parsed.nextId || 1),
      mails: Array.isArray(parsed.mails) ? parsed.mails : []
    };
  } catch (_) {
    return { ...defaultState };
  }
}

let state = storageStatus.blocked ? { ...defaultState } : loadState();

function persist() {
  ensureWritableStorage();
  const tempPath = storagePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  fs.renameSync(tempPath, storagePath);
}

function clampBody(value) {
  if (!value) return '';
  const maxBodyChars = Number(storageConfig.maxBodyChars || 200000);
  return String(value).slice(0, maxBodyChars);
}

function normalizeReceivedAt(headers) {
  const dateValue = headers && headers.date ? new Date(headers.date) : new Date();
  if (Number.isNaN(dateValue.getTime())) {
    return new Date().toISOString();
  }
  return dateValue.toISOString();
}

function cleanupExpiredInMemory() {
  const ttlHours = Number(storageConfig.mailTtlHours || 48);
  const cutoff = Date.now() - (ttlHours * 60 * 60 * 1000);
  state.mails = state.mails.filter(mail => {
    const ts = new Date(mail.received_at).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

function cleanupInboxInMemory(inbox) {
  const maxMailsPerInbox = Number(storageConfig.maxMailsPerInbox || 100);
  const inboxMails = state.mails
    .filter(mail => mail.inbox === inbox)
    .sort((a, b) => {
      const ta = new Date(a.received_at).getTime();
      const tb = new Date(b.received_at).getTime();
      return tb - ta || b.id - a.id;
    });
  const keepIds = new Set(inboxMails.slice(0, maxMailsPerInbox).map(mail => mail.id));
  state.mails = state.mails.filter(mail => mail.inbox !== inbox || keepIds.has(mail.id));
}

function createMailRecord(inbox, data) {
  const headers = data && data.headers ? data.headers : {};
  const receivedAt = normalizeReceivedAt(headers);

  return {
    id: state.nextId++,
    inbox,
    mail_to: headers.to || '',
    mail_from: headers.from || '',
    subject: headers.subject || '',
    text_body: clampBody(data.text || ''),
    html_body: clampBody(data.html || ''),
    headers_json: JSON.stringify(headers),
    raw_json: JSON.stringify(data),
    received_at: receivedAt,
    created_at: new Date().toISOString()
  };
}

function saveMail(inbox, data) {
  ensureWritableStorage();
  const record = createMailRecord(inbox, data);

  state.mails.push(record);
  cleanupInboxInMemory(inbox);
  cleanupExpiredInMemory();
  persist();

  return record;
}

function createTransientMail(inbox, data) {
  return createMailRecord(inbox, data);
}

function listMails(inbox) {
  ensureWritableStorage();
  cleanupExpiredInMemory();
  persist();
  const maxMailsPerInbox = Number(storageConfig.maxMailsPerInbox || 100);
  return state.mails
    .filter(mail => mail.inbox === inbox)
    .sort((a, b) => {
      const ta = new Date(a.received_at).getTime();
      const tb = new Date(b.received_at).getTime();
      return tb - ta || b.id - a.id;
    })
    .slice(0, maxMailsPerInbox);
}

function getMail(id) {
  ensureWritableStorage();
  cleanupExpiredInMemory();
  persist();
  return state.mails.find(mail => mail.id === Number(id)) || null;
}

function cleanupExpired() {
  ensureWritableStorage();
  cleanupExpiredInMemory();
  persist();
}

function getStatus() {
  return {
    path: storagePath,
    ...storageStatus
  };
}

module.exports = {
  saveMail,
  createTransientMail,
  listMails,
  getMail,
  cleanupExpired,
  getStatus
};
