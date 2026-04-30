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
  res.json({ ok: true });
});

router.get('/inboxes/:inbox/mails', function(req, res) {
  let inbox = String(req.params.inbox || '').trim().toLowerCase();
  if (!isValidInboxName(inbox, config.keywordBlackList)) {
    return res.status(400).json({ error: 'invalid inbox name' });
  }

  let mails = storage.listMails(inbox).map(toMailSummary);
  res.json({ inbox, mails });
});

router.get('/mails/:id', function(req, res) {
  let mail = toMailDetail(storage.getMail(req.params.id));
  if (!mail) {
    return res.status(404).json({ error: 'mail not found' });
  }
  res.json(mail);
});

module.exports = router;
