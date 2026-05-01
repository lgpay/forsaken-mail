#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const repoRoot = path.resolve(__dirname, '..');
const config = require(path.join(repoRoot, 'modules/config'));

const argv = process.argv.slice(2);
const args = {
  from: null,
  to: null,
  force: false,
  pretty: true,
  help: false
};

for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (token === '--from') {
    args.from = argv[i + 1];
    i += 1;
  } else if (token === '--to') {
    args.to = argv[i + 1];
    i += 1;
  } else if (token === '--force') {
    args.force = true;
  } else if (token === '--compact') {
    args.pretty = false;
  } else if (token === '--help' || token === '-h') {
    args.help = true;
  } else {
    fail('Unknown argument: ' + token);
  }
}

if (args.help) {
  printHelp();
  process.exit(0);
}

const storageConfig = config.storage || {};
const defaultSqlitePath = path.resolve(repoRoot, './data/forsaken-mail.sqlite');
const defaultJsonPath = path.resolve(repoRoot, storageConfig.path || './data/forsaken-mail.json');
const sourcePath = path.resolve(repoRoot, args.from || defaultSqlitePath);
const targetPath = path.resolve(repoRoot, args.to || defaultJsonPath);

main();

function main() {
  ensureSourceExists(sourcePath);
  ensureSqliteFile(sourcePath);
  ensureTargetWritable(targetPath, args.force);

  const db = new DatabaseSync(sourcePath, { readonly: true });
  try {
    ensureMailsTable(db, sourcePath);
    const rows = db.prepare(`
      SELECT id, inbox, mail_to, mail_from, subject, text_body, html_body, headers_json, raw_json, received_at, created_at
      FROM mails
      ORDER BY id ASC
    `).all();

    const jsonState = buildJsonState(rows);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(jsonState, null, args.pretty ? 2 : 0) + (args.pretty ? '\n' : ''));

    const summary = summarize(rows);
    console.log(JSON.stringify({
      ok: true,
      from: sourcePath,
      to: targetPath,
      mails: summary.mails,
      inboxes: summary.inboxes,
      nextId: jsonState.nextId
    }, null, 2));
  } finally {
    db.close();
  }
}

function buildJsonState(rows) {
  const mails = rows.map(row => ({
    id: Number(row.id),
    inbox: row.inbox || '',
    mail_to: row.mail_to || '',
    mail_from: row.mail_from || '',
    subject: row.subject || '',
    text_body: row.text_body || '',
    html_body: row.html_body || '',
    headers_json: normalizeJsonText(row.headers_json),
    raw_json: normalizeJsonText(row.raw_json),
    received_at: normalizeDateText(row.received_at),
    created_at: normalizeDateText(row.created_at)
  }));

  const maxId = mails.reduce((acc, row) => Math.max(acc, Number(row.id) || 0), 0);
  return {
    nextId: maxId + 1,
    mails
  };
}

function normalizeJsonText(value) {
  if (!value) return '{}';
  if (typeof value !== 'string') {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return '{}';
    }
  }

  try {
    return JSON.stringify(JSON.parse(value));
  } catch (_) {
    return JSON.stringify({ raw: value });
  }
}

function normalizeDateText(value) {
  if (!value) return new Date(0).toISOString();
  const text = String(value).trim();
  if (!text) return new Date(0).toISOString();

  if (/z$/i.test(text) || /[+-]\d\d:?\d\d$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (match) {
    const [, year, month, day, hour, minute, second, ms = '0'] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms.padEnd(3, '0')}Z`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function summarize(rows) {
  const inboxes = new Set();
  rows.forEach(row => {
    if (row.inbox) inboxes.add(row.inbox);
  });
  return {
    mails: rows.length,
    inboxes: inboxes.size
  };
}

function ensureSourceExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fail('Source SQLite file not found: ' + filePath);
  }
}

function ensureSqliteFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    const prefix = buffer.slice(0, bytesRead).toString('utf8');
    if (!prefix.startsWith('SQLite format 3')) {
      fail('Source file is not a SQLite database: ' + filePath);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function ensureMailsTable(db, filePath) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mails'").get();
  if (!row) {
    fail('SQLite database does not contain a mails table: ' + filePath);
  }
}

function ensureTargetWritable(filePath, force) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  if (!existing.trim()) {
    return;
  }

  if (!force) {
    fail('Target file already exists and is not empty: ' + filePath + ' (use --force to overwrite)');
  }
}

function printHelp() {
  console.log(`Usage: node ./scripts/migrate-sqlite-to-json.js [options]\n\nOptions:\n  --from <path>    Source SQLite file (default: ./data/forsaken-mail.sqlite)\n  --to <path>      Target JSON file (default: storage.path from config)\n  --force          Overwrite existing non-empty target JSON file\n  --compact        Write minified JSON instead of pretty JSON\n  -h, --help       Show this help\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
