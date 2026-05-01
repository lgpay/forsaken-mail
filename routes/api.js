/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

let express = require('express');
let router = express.Router();
let storage = require('../modules/storage');
let config = require('../modules/config');
let { isValidInboxName, toMailSummary, toMailDetail } = require('../modules/utils');

router.get('/', function(req, res) {
  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  res.status(storageStatus.blocked ? 503 : 200).json({ ok: !storageStatus.blocked, storage: storageStatus });
});

router.get('/inboxes/:inbox/mails', function(req, res) {
  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  if (storageStatus.blocked) {
    return res.status(503).json({ error: storageStatus.reason, storage: storageStatus });
  }

  let inbox = String(req.params.inbox || '').trim().toLowerCase();
  if (!isValidInboxName(inbox, config.keywordBlackList)) {
    return res.status(400).json({ error: 'invalid inbox name' });
  }

  let mails = storage.listMails(inbox).map(toMailSummary);
  res.json({ inbox, mails });
});

router.get('/mails/:id', function(req, res) {
  const storageStatus = storage.getStatus ? storage.getStatus() : { blocked: false };
  if (storageStatus.blocked) {
    return res.status(503).json({ error: storageStatus.reason, storage: storageStatus });
  }

  let mail = toMailDetail(storage.getMail(req.params.id));
  if (!mail) {
    return res.status(404).json({ error: 'mail not found' });
  }
  res.json(mail);
});

module.exports = router;
