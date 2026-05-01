const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tmpDir = path.join(repoRoot, '.tmp', 'tests');
fs.mkdirSync(tmpDir, { recursive: true });

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function loadStorageWithConfig(storageConfig, extraConfig = {}) {
  const configModulePath = path.join(repoRoot, 'modules', 'config.js');
  const storageModulePath = path.join(repoRoot, 'modules', 'storage.js');

  clearModule(configModulePath);
  clearModule(storageModulePath);

  require.cache[require.resolve(configModulePath)] = {
    id: require.resolve(configModulePath),
    filename: require.resolve(configModulePath),
    loaded: true,
    exports: {
      storage: storageConfig,
      keywordBlackList: [],
      ...extraConfig
    }
  };

  return require(storageModulePath);
}

function testJsonStorageRoundtrip() {
  const filePath = path.join(tmpDir, 'roundtrip.json');
  fs.rmSync(filePath, { force: true });

  const storage = loadStorageWithConfig({
    path: './.tmp/tests/roundtrip.json',
    maxMailsPerInbox: 2,
    mailTtlHours: 48,
    maxBodyChars: 20
  });

  const saved = storage.saveMail('demo', {
    headers: {
      to: 'demo@example.com',
      from: 'sender@example.com',
      subject: 'Hello',
      date: '2026-05-01T10:00:00.000Z'
    },
    text: 'abcdefghijklmnopqrstuvwxyz',
    html: '<b>hello</b>'
  });

  assert.equal(saved.id, 1);
  assert.equal(saved.text_body, 'abcdefghijklmnopqrst');

  const mails = storage.listMails('demo');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].subject, 'Hello');

  const storedRaw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(storedRaw.mails.length, 1);
}

function testSqliteGuard() {
  const filePath = path.join(tmpDir, 'legacy.sqlite');
  fs.writeFileSync(filePath, 'SQLite format 3\0legacy');

  const storage = loadStorageWithConfig({
    path: './.tmp/tests/legacy.sqlite',
    maxMailsPerInbox: 2,
    mailTtlHours: 48,
    maxBodyChars: 20
  });

  assert.equal(typeof storage.getStatus, 'function');
  assert.equal(storage.getStatus().blocked, true);
  assert.match(storage.getStatus().reason, /SQLite/i);
  assert.throws(() => storage.saveMail('demo', { headers: {} }), /SQLite/i);
}

function testUtils() {
  clearModule(path.join(repoRoot, 'modules', 'utils.js'));
  const { isValidInboxName, sanitizeHtml } = require(path.join(repoRoot, 'modules', 'utils.js'));

  assert.equal(isValidInboxName('demo_box', ['admin']), true);
  assert.equal(isValidInboxName('ad', ['admin']), true);
  assert.equal(isValidInboxName('Admin-box', ['admin']), false);
  assert.equal(isValidInboxName('x', []), false);
  assert.equal(isValidInboxName('bad/name', []), false);

  const sanitized = sanitizeHtml('<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(2)">x</a></div>');
  assert(!sanitized.includes('<script'));
  assert(!sanitized.includes('onclick='));
  assert(!sanitized.includes('javascript:'));
}

function testSqliteMigrationScript() {
  const sqlitePath = path.join(tmpDir, 'migrate-source.sqlite');
  const jsonPath = path.join(tmpDir, 'migrate-target.json');
  fs.rmSync(sqlitePath, { force: true });
  fs.rmSync(jsonPath, { force: true });

  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(sqlitePath)});
    db.exec(\`
      CREATE TABLE mails (
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
        created_at TEXT NOT NULL
      );
    \`);
    db.prepare('INSERT INTO mails (inbox, mail_to, mail_from, subject, text_body, html_body, headers_json, raw_json, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('demo', 'demo@example.com', 'sender@example.com', 'Subject', 'plain', '<b>html</b>', '{"x":1}', '{"y":2}', '2026-05-01 09:30:00', '2026-05-01 09:31:00');
    db.close();
  `;
  execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, stdio: 'pipe' });

  const output = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'migrate-sqlite-to-json.js'), '--from', sqlitePath, '--to', jsonPath], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const summary = JSON.parse(output);
  assert.equal(summary.ok, true);
  assert.equal(summary.mails, 1);
  assert.equal(summary.inboxes, 1);

  const migrated = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(migrated.nextId, 2);
  assert.equal(migrated.mails.length, 1);
  assert.equal(migrated.mails[0].inbox, 'demo');
  assert.equal(migrated.mails[0].subject, 'Subject');
  assert.equal(migrated.mails[0].received_at, '2026-05-01T09:30:00.000Z');
}

function testPatchScript() {
  const fixtureDir = path.join(tmpDir, 'patch-fixture');
  const libDir = path.join(fixtureDir, 'node_modules', 'smtp-server', 'lib');
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.mkdirSync(libDir, { recursive: true });

  fs.writeFileSync(path.join(libDir, 'smtp-stream.js'), [
    'function SMTPStream() {',
    '    this.closed = false;',
    '}',
    'SMTPStream.prototype._write = function () {',
    '    if (this.closed) return;',
    '    if (!this.closed) return true;',
    '};',
    'SMTPStream.prototype._flushData = function () {',
    '    if (this._remainder && !this.closed) return;',
    '};',
    ''
  ].join('\n'));

  fs.writeFileSync(path.join(libDir, 'smtp-connection.js'), [
    'SMTPConnection.prototype._onClose = function () {',
    '    if (this._parser) {',
    '        this._parser.closed = true;',
    '    }',
    '};',
    ''
  ].join('\n'));

  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'patch-smtp-stream.js')], {
    cwd: fixtureDir,
    stdio: 'pipe'
  });

  const patchedStream = fs.readFileSync(path.join(libDir, 'smtp-stream.js'), 'utf8');
  const patchedConnection = fs.readFileSync(path.join(libDir, 'smtp-connection.js'), 'utf8');

  assert(patchedStream.includes('this._openclawClosed = false;'));
  assert(!patchedStream.includes('this.closed = false;'));
  assert(patchedStream.includes('if (this._openclawClosed) return;'));
  assert(patchedStream.includes('if (!this._openclawClosed) return true;'));
  assert(patchedConnection.includes("if ('_openclawClosed' in this._parser)"));
  assert(!patchedConnection.includes('this._parser.closed = true;'));
}

try {
  testJsonStorageRoundtrip();
  testSqliteGuard();
  testUtils();
  testSqliteMigrationScript();
  testPatchScript();
  console.log('ok');
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
