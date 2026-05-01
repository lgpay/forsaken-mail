Forsaken-Mail
==============
A self-hosted disposable mail service with persisted inbox history.

[Online Demo](http://disposable.dhc-app.com)

## What this fork adds

This fork turns the original real-time demo into something more practical for personal/self-hosted use:

- persisted inbox history
- inbox history API
- mail detail API
- custom inbox name validation
- basic HTML sanitization before rendering
- per-inbox retention limit
- TTL-based cleanup
- legacy SQLite → JSON migration script
- storage health reporting when legacy data blocks startup

## Architecture

- **SMTP ingest**: `mailin`
- **Web/API**: Express + socket.io
- **Storage**: JSON file storage
- **Frontend**: static HTML + jQuery

Real-time push is still preserved, while history is loaded through API calls.

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure

Edit `config-default.json` as needed:

```json
{
  "mailin": {
    "host": "0.0.0.0",
    "port": 25,
    "disableWebhook": true
  },
  "web": {
    "port": 3000
  },
  "storage": {
    "path": "./data/forsaken-mail.sqlite",
    "maxMailsPerInbox": 100,
    "mailTtlHours": 48,
    "maxBodyChars": 200000
  },
  "host": "arm.3w.pm",
  "keywordBlackList": [
    "admin",
    "postmaster",
    "system",
    "webmaster",
    "administrator",
    "hostmaster",
    "service",
    "server",
    "root"
  ]
}
```

### 3) Start the app

```bash
npm start
```

Open:

```bash
http://localhost:3000
```

### 4) Run checks

```bash
npm test
```

## Storage notes

Current code uses **JSON file storage**.

Default configured path is still:

```bash
./data/forsaken-mail.sqlite
```

That filename is kept mostly for backward compatibility with older deployments, but **the current implementation writes JSON into that path**.

### Recommendation

For new deployments, it is cleaner to change the path to a `.json` filename, for example:

```json
{
  "storage": {
    "path": "./data/forsaken-mail.json"
  }
}
```

### Legacy SQLite detection

If `storage.path` still points at an actual old SQLite database file, the app now:

- reports storage status from `GET /api/`
- returns `503` from mail APIs
- avoids silently treating the old database as an empty inbox

This makes migration issues obvious instead of hiding them.

## SQLite migration

If you still have mail data in the old SQLite format, migrate it first:

```bash
npm run migrate:sqlite -- --from ./data/forsaken-mail.sqlite --to ./data/forsaken-mail.json
```

Useful flags:

- `--force` overwrite an existing non-empty target JSON file
- `--compact` write minified JSON
- `--help` show usage

The script prints a JSON summary with:

- migrated mail count
- inbox count
- resulting `nextId`

### Typical migration flow

```bash
# 1. Export old SQLite storage into JSON
npm run migrate:sqlite -- --from ./data/forsaken-mail.sqlite --to ./data/forsaken-mail.json

# 2. Update config to point to the JSON file
#    storage.path = ./data/forsaken-mail.json

# 3. Start the service again
npm start
```

## APIs

### `GET /api/`

Health check and storage status.

Example response:

```json
{
  "ok": true,
  "storage": {
    "path": "/app/data/forsaken-mail.json",
    "blocked": false,
    "format": "json",
    "reason": ""
  }
}
```

### `GET /api/inboxes/:inbox/mails`

List inbox history.

Example:

```bash
curl http://localhost:3000/api/inboxes/demo/mails
```

### `GET /api/mails/:id`

Fetch mail detail.

Example:

```bash
curl http://localhost:3000/api/mails/1
```

If storage is blocked because the configured file is still a legacy SQLite database, these APIs return `503` with the detected storage reason.

## Inbox rules

Custom inbox names must:

- start with a lowercase letter or digit
- contain only `a-z`, `0-9`, `.`, `_`, `-`
- be 2 to 32 chars long
- not include reserved keywords from `keywordBlackList`

## DNS setup

To receive emails, your SMTP server must be reachable and correctly published in DNS.

Assume you want to receive mail at:

```text
*@subdomain.domain.com
```

Then configure:

- MX record: `subdomain.domain.com MX 10 mxsubdomain.domain.com`
- A record: `mxsubdomain.domain.com A <your-server-ip>`

You can verify this with an SMTP / MX tester such as:

- <http://mxtoolbox.com/diagnostic.aspx>

## Docker

Build:

```bash
docker build -t denghongcai/forsaken-mail .
```

Run:

```bash
docker run --name forsaken-mail -d -p 25:25 -p 3000:3000 denghongcai/forsaken-mail
```

## Project status

This is still a lightweight self-hosted disposable mailbox project, not a hardened large-scale mail platform.

Already improved:

- persisted history
- basic validation
- cleanup limits
- migration tooling
- startup/storage diagnostics

Still reasonable future work:

- attachment support
- rate limiting / abuse controls
- multi-domain support
- admin view
- production deployment polish

## License

GPL-2.0
