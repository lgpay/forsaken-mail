'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

const smtpStreamTargets = [
  path.join(projectRoot, 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js'),
  path.join(projectRoot, 'node_modules', 'mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js'),
  path.join(projectRoot, 'node_modules', 'node-mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js')
];

const smtpConnectionTargets = [
  path.join(projectRoot, 'node_modules', 'smtp-server', 'lib', 'smtp-connection.js'),
  path.join(projectRoot, 'node_modules', 'mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-connection.js'),
  path.join(projectRoot, 'node_modules', 'node-mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-connection.js')
];

function patchSmtpStream(file) {
  if (!fs.existsSync(file)) return false;
  let source = fs.readFileSync(file, 'utf8');
  let patched = source
    .replace(/this\.closed = false;/g, 'this._openclawClosed = false;')
    .replace(/if \(this\.closed\)/g, 'if (this._openclawClosed)')
    .replace(/!this\.closed/g, '!this._openclawClosed');

  if (patched !== source) {
    fs.writeFileSync(file, patched);
    return true;
  }
  return false;
}

function patchSmtpConnection(file) {
  if (!fs.existsSync(file)) return false;
  let source = fs.readFileSync(file, 'utf8');
  let patched = source.replace(
    /this\._parser\.closed = true;/g,
    "if ('_openclawClosed' in this._parser) {\n        this._parser._openclawClosed = true;\n    }"
  );

  if (patched !== source) {
    fs.writeFileSync(file, patched);
    return true;
  }
  return false;
}

let touched = 0;
for (const file of smtpStreamTargets) {
  if (patchSmtpStream(file)) touched++;
}
for (const file of smtpConnectionTargets) {
  if (patchSmtpConnection(file)) touched++;
}

console.log(`smtp compatibility patch applied to ${touched} file(s)`);
