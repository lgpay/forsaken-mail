const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tmpDir = path.join(repoRoot, '.tmp', 'tests');
fs.mkdirSync(tmpDir, { recursive: true });

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function injectConfig(configValue) {
  const configModulePath = path.join(repoRoot, 'modules', 'config.js');
  clearModule(configModulePath);
  require.cache[require.resolve(configModulePath)] = {
    id: require.resolve(configModulePath),
    filename: require.resolve(configModulePath),
    loaded: true,
    exports: configValue
  };
}

function loadStorageWithConfig(storageConfig, extraConfig = {}) {
  const storageModulePath = path.join(repoRoot, 'modules', 'storage.js');
  clearModule(storageModulePath);
  injectConfig({
    storage: storageConfig,
    keywordBlackList: [],
    auth: { statePath: './.tmp/tests/auth-storage.json' },
    ...extraConfig
  });
  return require(storageModulePath);
}

function loadConfigWithEnv(ownerPassword, ownerPasswordFile) {
  const configModulePath = path.join(repoRoot, 'modules', 'config.js');
  const configJsonPath = path.join(repoRoot, 'config-default.json');
  if (ownerPassword === undefined) {
    delete process.env.OWNER_PASSWORD;
  } else {
    process.env.OWNER_PASSWORD = ownerPassword;
  }
  if (ownerPasswordFile === undefined) {
    delete process.env.OWNER_PASSWORD_FILE;
  } else {
    process.env.OWNER_PASSWORD_FILE = ownerPasswordFile;
  }
  clearModule(configModulePath);
  clearModule(configJsonPath);
  return require(configModulePath);
}

function testConfigEnvironment() {
  const previousPassword = process.env.OWNER_PASSWORD;
  const previousPasswordFile = process.env.OWNER_PASSWORD_FILE;
  const secretPath = path.join(tmpDir, 'owner-password.secret');
  const statePath = path.join(tmpDir, 'auth-env-state.json');
  fs.writeFileSync(secretPath, 'file-password-123\n');
  fs.rmSync(statePath, { force: true });

  try {
    assert.equal(loadConfigWithEnv('env-password-123').auth.ownerPassword, 'env-password-123');
    assert.equal(loadConfigWithEnv('env-password-123', secretPath).auth.ownerPassword, 'file-password-123');
    assert.equal(loadConfigWithEnv(undefined, secretPath).auth.ownerPassword, 'file-password-123');
    assert.equal(loadConfigWithEnv().auth.ownerPassword, '');
    assert.throws(() => loadConfigWithEnv('env-password-123', ''), /OWNER_PASSWORD_FILE must not be empty/);
    assert.throws(() => loadConfigWithEnv(undefined, path.join(tmpDir, 'missing.secret')), /ENOENT/);

    const config = loadConfigWithEnv(undefined, secretPath);
    config.auth.statePath = './.tmp/tests/auth-env-state.json';
    injectConfig(config);
    clearModule(path.join(repoRoot, 'modules', 'auth.js'));
    const auth = require(path.join(repoRoot, 'modules', 'auth.js'));
    assert.equal(auth.verifyPassword('file-password-123'), true);
    assert.match(JSON.parse(fs.readFileSync(statePath, 'utf8')).passwordHash, /^scrypt\$/);
  } finally {
    fs.rmSync(secretPath, { force: true });
    fs.rmSync(statePath, { force: true });
    if (previousPassword === undefined) delete process.env.OWNER_PASSWORD;
    else process.env.OWNER_PASSWORD = previousPassword;
    if (previousPasswordFile === undefined) delete process.env.OWNER_PASSWORD_FILE;
    else process.env.OWNER_PASSWORD_FILE = previousPasswordFile;
    clearModule(path.join(repoRoot, 'modules', 'config.js'));
    clearModule(path.join(repoRoot, 'config-default.json'));
  }
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
      date: new Date().toISOString()
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

function testTransientMailDoesNotPersist() {
  const filePath = path.join(tmpDir, 'transient.json');
  fs.rmSync(filePath, { force: true });

  const storage = loadStorageWithConfig({
    path: './.tmp/tests/transient.json',
    maxMailsPerInbox: 2,
    mailTtlHours: 48,
    maxBodyChars: 20
  });

  const transient = storage.createTransientMail('anon-1', {
    headers: {
      to: 'anon-1@example.com',
      from: 'sender@example.com',
      subject: 'Transient'
    },
    text: 'hello'
  });

  assert.equal(transient.subject, 'Transient');
  assert.equal(fs.existsSync(filePath), false);
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
  injectConfig({ storage: { path: './.tmp/tests/utils.json' }, auth: { statePath: './.tmp/tests/auth-utils.json' }, keywordBlackList: [] });
  clearModule(path.join(repoRoot, 'modules', 'utils.js'));
  const { isValidInboxName, sanitizeHtml, createAnonymousInboxId } = require(path.join(repoRoot, 'modules', 'utils.js'));

  assert.equal(isValidInboxName('demo_box', ['admin']), true);
  assert.equal(isValidInboxName('ad', ['admin']), true);
  assert.equal(isValidInboxName('Admin-box', ['admin']), false);
  assert.equal(isValidInboxName('x', []), false);
  assert.equal(isValidInboxName('bad/name', []), false);
  assert(createAnonymousInboxId().startsWith('anon-'));

  const html = '<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(2)">x</a></div>';
  assert.equal(sanitizeHtml(html), html);
}

function testAuthModule() {
  const authStatePath = path.join(tmpDir, 'auth-state.json');
  fs.rmSync(authStatePath, { force: true });

  injectConfig({ auth: { ownerPassword: 'initialpassword123', statePath: './.tmp/tests/auth-state.json', sessionTtlHours: 1, requireHttps: true } });
  clearModule(path.join(repoRoot, 'modules', 'auth.js'));
  let auth = require(path.join(repoRoot, 'modules', 'auth.js'));

  const info = auth.getAuthInfo();
  assert.equal(Object.prototype.hasOwnProperty.call(info, 'generatedPassword'), false);
  assert.equal(auth.verifyPassword('initialpassword123'), true);
  assert.match(JSON.parse(fs.readFileSync(authStatePath, 'utf8')).passwordHash, /^scrypt\$/);

  const session = auth.createSession();
  assert(session.token);
  assert(auth.getSession(session.token));
  const cookie = auth.buildSetCookie(session.token, session.expiresAt);
  assert(cookie.includes('fm_session='));
  assert(cookie.includes('HttpOnly'));
  assert(cookie.includes('Secure'));
  assert(cookie.includes('SameSite=Strict'));

  const req = { headers: { cookie: 'fm_session=' + encodeURIComponent(session.token) }, secure: true };
  assert.equal(auth.isOwnerRequest(req), true);
  assert.equal(auth.isSecureRequest(req), true);
  assert.equal(auth.isSecureRequest({ secure: false }), false);

  auth.changePassword('newpassword123');
  assert.equal(auth.verifyPassword('newpassword123'), true);
  assert.throws(() => auth.changePassword('123'), /password too short/);

  auth.clearSession(session.token);
  assert.equal(auth.isOwnerRequest(req), false);

  fs.writeFileSync(authStatePath, JSON.stringify({ passwordHash: crypto.createHash('sha256').update('legacy-password').digest('hex') }));
  clearModule(path.join(repoRoot, 'modules', 'auth.js'));
  auth = require(path.join(repoRoot, 'modules', 'auth.js'));
  assert.equal(auth.verifyPassword('wrong-password'), false);
  assert.match(JSON.parse(fs.readFileSync(authStatePath, 'utf8')).passwordHash, /^[a-f0-9]{64}$/);
  assert.equal(auth.verifyPassword('legacy-password'), true);
  assert.match(JSON.parse(fs.readFileSync(authStatePath, 'utf8')).passwordHash, /^scrypt\$/);
}

function testInboxesModule() {
  injectConfig({ host: 'mail.test', auth: { statePath: './.tmp/tests/auth-inboxes.json' } });
  clearModule(path.join(repoRoot, 'modules', 'inboxes.js'));
  const inboxes = require(path.join(repoRoot, 'modules', 'inboxes.js'));

  inboxes.bindSession('s1', 'anon-abc', 'anonymous', 'auto.mail.test');
  let info = inboxes.getSessionInbox('s1');
  assert.equal(info.mode, 'anonymous');
  assert.equal(info.address, 'anon-abc@auto.mail.test');

  info = inboxes.getSessionInbox('s1', 'viewer.mail.test');
  assert.equal(info.address, 'anon-abc@viewer.mail.test');
  assert.equal(inboxes.getAddress('demo', 'current.example.com'), 'demo@current.example.com');
  assert.equal(inboxes.getAddress('demo', ''), 'demo@mail.test');

  const transientMail = {
    id: 11,
    inbox: 'anon-abc',
    subject: 'test',
    mail_from: 'a@test',
    mail_to: 'anon-abc@mail.test',
    text_body: 'hello',
    html_body: '',
    headers_json: '{}',
    received_at: new Date().toISOString()
  };
  inboxes.saveAnonymousMail('anon-abc', transientMail);
  assert.equal(inboxes.listAnonymousMails('anon-abc').length, 1);
  assert.equal(inboxes.getAnonymousMailById(11).subject, 'test');
  assert.equal(inboxes.canAccessInbox('s1', 'anon-abc', false), true);
  assert.equal(inboxes.canAccessInbox('other', 'anon-abc', false), false);

  inboxes.bindSession('owner1', 'custombox', 'persistent');
  info = inboxes.getSessionInbox('owner1');
  assert.equal(info.mode, 'persistent');
  assert.equal(inboxes.getInboxMode('custombox'), 'persistent');
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
  testTransientMailDoesNotPersist();
  testSqliteGuard();
  testUtils();
  testConfigEnvironment();
  testAuthModule();
  testInboxesModule();
  testSqliteMigrationScript();
  testPatchScript();
  console.log('ok');
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
