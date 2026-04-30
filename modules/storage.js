'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const storageConfig = config.storage || {};
const dbPath = path.resolve(__dirname, '..', storageConfig.path || './data/forsaken-mail.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inbox TEXT NOT NULL,
    mail_to TEXT,
    mail_from TEXT,
    subject TEXT,
    text_body TEXT,
    html_body TEXT,
    headers_json TEXT,
    raw_json TEXT,
    received_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mails_inbox_received_at ON mails (inbox, received_at DESC);
`);

const insertStmt = db.prepare(`
  INSERT INTO mails (
    inbox, mail_to, mail_from, subject, text_body, html_body, headers_json, raw_json, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listStmt = db.prepare(`
  SELECT id, inbox, mail_to, mail_from, subject, received_at
  FROM mails
  WHERE inbox = ?
  ORDER BY datetime(received_at) DESC, id DESC
  LIMIT ?
`);

const getStmt = db.prepare(`
  SELECT * FROM mails WHERE id = ?
`);

const cleanupInboxStmt = db.prepare(`
  DELETE FROM mails
  WHERE inbox = ? AND id NOT IN (
    SELECT id FROM mails WHERE inbox = ? ORDER BY datetime(received_at) DESC, id DESC LIMIT ?
  )
`);

const cleanupExpiredStmt = db.prepare(`
  DELETE FROM mails
  WHERE datetime(received_at) < datetime('now', ?)
`);

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

function saveMail(inbox, data) {
  const headers = data && data.headers ? data.headers : {};
  const receivedAt = normalizeReceivedAt(headers);
  const result = insertStmt.run(
    inbox,
    headers.to || '',
    headers.from || '',
    headers.subject || '',
    clampBody(data.text || ''),
    clampBody(data.html || ''),
    JSON.stringify(headers),
    JSON.stringify(data),
    receivedAt
  );

  cleanupInbox(inbox);
  cleanupExpired();

  return {
    id: Number(result.lastInsertRowid),
    inbox,
    mail_to: headers.to || '',
    mail_from: headers.from || '',
    subject: headers.subject || '',
    text_body: clampBody(data.text || ''),
    html_body: clampBody(data.html || ''),
    headers_json: JSON.stringify(headers),
    raw_json: JSON.stringify(data),
    received_at: receivedAt
  };
}

function cleanupInbox(inbox) {
  const maxMailsPerInbox = Number(storageConfig.maxMailsPerInbox || 100);
  cleanupInboxStmt.run(inbox, inbox, maxMailsPerInbox);
}

function cleanupExpired() {
  const ttlHours = Number(storageConfig.mailTtlHours || 48);
  cleanupExpiredStmt.run(`-${ttlHours} hours`);
}

function listMails(inbox) {
  const maxMailsPerInbox = Number(storageConfig.maxMailsPerInbox || 100);
  return listStmt.all(inbox, maxMailsPerInbox);
}

function getMail(id) {
  return getStmt.get(Number(id));
}

module.exports = {
  saveMail,
  listMails,
  getMail,
  cleanupExpired
};
