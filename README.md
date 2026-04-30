Forsaken-Mail
==============
A self-hosted disposable mail service.

[Online Demo](http://disposable.dhc-app.com)

## Quick-win redevelopment notes

This branch upgrades the original demo into a more practical self-hosted tool:

- SQLite mail persistence
- Inbox history API
- Mail detail API
- Inbox name validation
- Basic HTML sanitization
- Per-inbox mail retention limit
- TTL-based mail cleanup

### Storage

Default storage path:

```bash
./data/forsaken-mail.json
```

### Config

Edit `config-default.json`:

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
  }
}
```

### APIs

- `GET /api/` health check
- `GET /api/inboxes/:inbox/mails` list inbox history
- `GET /api/mails/:id` get mail detail

### Inbox rules

Custom inbox names must:

- start with a lowercase letter or digit
- contain only `a-z`, `0-9`, `.`, `_`, `-`
- be 2 to 32 chars long
- not include reserved keywords from `keywordBlackList`

### Installation

#### Setting up your DNS correctly

In order to receive emails, your smtp server address should be made available somewhere. Two records should be added to your DNS records. Let us pretend that we want to receive emails at `*@subdomain.domain.com`:
- First an MX record: `subdomain.domain.com MX 10 mxsubdomain.domain.com`
- Then an A record: `mxsubdomain.domain.com A the.ip.address.of.your.mailin.server`

You can use an [smtp server tester](http://mxtoolbox.com/diagnostic.aspx) to verify that everything is correct.

#### Let's Go

general way:
```bash
npm install && npm start
```

if you want to run this inside a docker container
```bash
docker build -t denghongcai/forsaken-mail .
docker run --name forsaken-mail -d -p 25:25 -p 3000:3000 denghongcai/forsaken-mail
```

Open your browser and type in
```bash
http://localhost:3000
```

Enjoy!

