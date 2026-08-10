'use strict';

const crypto = require('crypto');

const RESERVED_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function sanitizeHtml(html) {
  // HTML mail is rendered inside a sandboxed iframe on the client. Do not rely
  // on regex rewriting as a security boundary; preserve it for that isolated view.
  return html ? String(html) : '';
}

function isValidInboxName(id, keywordBlackList) {
  if (!id) return false;
  const normalized = String(id).trim().toLowerCase();
  if (!RESERVED_PATTERN.test(normalized)) return false;
  if ((keywordBlackList || []).some(keyword => normalized.includes(String(keyword).toLowerCase()))) {
    return false;
  }
  return true;
}

function createAnonymousInboxId() {
  return 'anon-' + crypto.randomBytes(5).toString('hex');
}

function toMailSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    inbox: row.inbox,
    from: row.mail_from,
    to: row.mail_to,
    subject: row.subject || '无主题',
    receivedAt: row.received_at
  };
}

function toMailDetail(row) {
  if (!row) return null;
  let headers = {};
  try {
    headers = row.headers_json ? JSON.parse(row.headers_json) : {};
  } catch (_) {}

  return {
    id: row.id,
    inbox: row.inbox,
    from: row.mail_from,
    to: row.mail_to,
    subject: row.subject || '无主题',
    receivedAt: row.received_at,
    text: row.text_body || '',
    html: sanitizeHtml(row.html_body || ''),
    headers
  };
}

module.exports = {
  sanitizeHtml,
  isValidInboxName,
  createAnonymousInboxId,
  toMailSummary,
  toMailDetail
};
