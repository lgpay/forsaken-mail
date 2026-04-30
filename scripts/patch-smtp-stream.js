'use strict';

const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '..', 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js'),
  path.join(__dirname, '..', 'node_modules', 'mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js'),
  path.join(__dirname, '..', 'node_modules', 'node-mailin', 'node_modules', 'smtp-server', 'lib', 'smtp-stream.js')
];

function patchFile(file) {
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

let touched = 0;
for (const file of targets) {
  if (patchFile(file)) touched++;
}

console.log(`smtp-stream patch applied to ${touched} file(s)`);
