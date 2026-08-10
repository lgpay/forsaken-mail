/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

let express = require('express');
let router = express.Router();
let storage = require('../modules/storage');
let config = require('../modules/config');
let auth = require('../modules/auth');
let inboxes = require('../modules/inboxes');
let { isValidInboxName, toMailSummary, toMailDetail } = require('../modules/utils');

function requireSecureTransport(req, res) {
  if (auth.isSecureRequest(req)) return true;
  res.status(400).json({ error: 'HTTPS is required for owner authentication' });
  return false;
}

function getViewer(req) {
  return {
    isOwner: auth.isOwnerRequest(req)
  };
}

function getRequestRuntimeHost(req) {
  const hostHeader = String((req.headers && req.headers.host) || '').trim().toLowerCase();
  if (!hostHeader) return '';
  return hostHeader.split(':')[0];
}

router.get('/', function(req, res) {
  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  const viewer = getViewer(req);
  res.status(storageStatus.blocked ? 503 : 200).json({
    ok: !storageStatus.blocked,
    storage: storageStatus,
    viewer,
    auth: auth.getAuthInfo(),
    host: inboxes.resolveHost(getRequestRuntimeHost(req))
  });
});

router.get('/auth/status', function(req, res) {
  res.json({
    ok: true,
    isOwner: auth.isOwnerRequest(req),
    auth: auth.getAuthInfo(),
    host: inboxes.resolveHost(getRequestRuntimeHost(req))
  });
});

router.post('/auth/login', function(req, res) {
  if (!requireSecureTransport(req, res)) return;
  const password = req.body && req.body.password;
  if (!auth.verifyPassword(password)) {
    return res.status(401).json({ error: 'invalid password' });
  }

  const session = auth.createSession();
  res.setHeader('Set-Cookie', auth.buildSetCookie(session.token, session.expiresAt));
  res.json({ ok: true, isOwner: true, expiresAt: session.expiresAt, auth: auth.getAuthInfo() });
});

router.post('/auth/logout', function(req, res) {
  if (!requireSecureTransport(req, res)) return;
  const session = auth.getSessionFromRequest(req);
  if (session) {
    auth.clearSession(session.token);
  }
  res.setHeader('Set-Cookie', auth.buildClearCookie());
  res.json({ ok: true, isOwner: false });
});

router.post('/auth/change-password', function(req, res) {
  if (!requireSecureTransport(req, res)) return;
  if (!auth.isOwnerRequest(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const currentPassword = req.body && req.body.currentPassword;
  const newPassword = req.body && req.body.newPassword;
  if (!auth.verifyPassword(currentPassword)) {
    return res.status(400).json({ error: 'current password invalid' });
  }

  try {
    const authInfo = auth.changePassword(newPassword);
    res.json({ ok: true, auth: authInfo });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'change password failed' });
  }
});

router.get('/session/inbox', function(req, res) {
  const sessionId = String(req.headers['x-inbox-session'] || '').trim();
  const current = inboxes.getSessionInbox(sessionId, getRequestRuntimeHost(req));
  res.json({ ok: true, inbox: current });
});

router.get('/inboxes/:inbox/mails', function(req, res) {
  if (auth.isOwnerRequest(req) && !requireSecureTransport(req, res)) return;
  let inbox = String(req.params.inbox || '').trim().toLowerCase();
  if (!isValidInboxName(inbox, config.keywordBlackList)) {
    return res.status(400).json({ error: 'invalid inbox name' });
  }

  const sessionId = String(req.headers['x-inbox-session'] || '').trim();
  const isOwner = auth.isOwnerRequest(req);
  if (!inboxes.canAccessInbox(sessionId, inbox, isOwner)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const mode = inboxes.getInboxMode(inbox);
  if (mode === 'anonymous') {
    return res.json({ inbox, mode, mails: inboxes.listAnonymousMails(inbox).map(toMailSummary) });
  }

  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  if (storageStatus.blocked) {
    return res.status(503).json({ error: storageStatus.reason, storage: storageStatus });
  }

  let mails = storage.listMails(inbox).map(toMailSummary);
  res.json({ inbox, mode: 'persistent', mails });
});

router.get('/mails/:id', function(req, res) {
  if (auth.isOwnerRequest(req) && !requireSecureTransport(req, res)) return;
  const sessionId = String(req.headers['x-inbox-session'] || '').trim();
  const isOwner = auth.isOwnerRequest(req);

  let anonymousMail = toMailDetail(inboxes.getAnonymousMailById(req.params.id));
  if (anonymousMail) {
    if (!inboxes.canAccessInbox(sessionId, anonymousMail.inbox, isOwner)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return res.json(anonymousMail);
  }

  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  if (storageStatus.blocked) {
    return res.status(503).json({ error: storageStatus.reason, storage: storageStatus });
  }

  let mail = toMailDetail(storage.getMail(req.params.id));
  if (!mail) {
    return res.status(404).json({ error: 'mail not found' });
  }

  if (!isOwner) {
    return res.status(403).json({ error: 'forbidden' });
  }

  res.json(mail);
});

module.exports = router;
