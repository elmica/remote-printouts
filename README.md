# remote-printouts

Firebase Realtime Database bridge for a Raspberry Pi print server. Listens for print jobs and printer-list refresh triggers in Firebase, then talks to [jprint](openapi.json) on `localhost:3001`.

## Prerequisites

On the Pi:

- **Node.js 20+** (`node --version`)
- **jprint** already running (default `http://localhost:3001`)
- A **Firebase project** with Realtime Database enabled
- A **Firebase service account key** (JSON) with access to that database

Deploy RTDB rules from [`firebase/database.rules.json`](firebase/database.rules.json) in the Firebase console or via CLI.

## Install on the Raspberry Pi

SSH into the Pi, then:

```bash
# 1. Clone the repo
sudo mkdir -p /opt
sudo git clone https://github.com/elmica/remote-printouts.git /opt/remote-printouts
cd /opt/remote-printouts

# 2. Install dependencies and build
npm ci
npm run build
```

## Configure

```bash
# 3. Create a dedicated user (if it doesn't exist yet)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin remote-printouts

# 4. Create config directory
sudo mkdir -p /etc/remote-printouts
sudo chmod 700 /etc/remote-printouts

# 5. Copy your Firebase service account key to the Pi, then:
sudo cp /path/to/your-service-account.json /etc/remote-printouts/service-account.json
sudo chmod 600 /etc/remote-printouts/service-account.json

# 6. Create the environment file
sudo cp .env.example /etc/remote-printouts/env
sudo nano /etc/remote-printouts/env
```

Edit `/etc/remote-printouts/env` with your values:

```
FIREBASE_DATABASE_URL=https://<project-id>-default-rtdb.firebaseio.com
GOOGLE_APPLICATION_CREDENTIALS=/etc/remote-printouts/service-account.json
JPRINT_BASE_URL=http://localhost:3001
CLAIM_LEASE_MS=120000
```

Give the service user read access to the app and config:

```bash
sudo chown -R remote-printouts:remote-printouts /opt/remote-printouts
sudo chown root:remote-printouts /etc/remote-printouts/env /etc/remote-printouts/service-account.json
sudo chmod 640 /etc/remote-printouts/env /etc/remote-printouts/service-account.json
```

## Run as a systemd service

```bash
# 7. Install the unit file
sudo cp deploy/remote-printouts.service /etc/systemd/system/

# 8. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable remote-printouts
sudo systemctl start remote-printouts
```

## Verify it's running

```bash
sudo systemctl status remote-printouts
sudo journalctl -u remote-printouts -f
```

You should see log lines like:

```
[printjobs] listening on /print/printjobs
[printers] listening on /print/update
[remote-printouts] bridge running
```

If jprint is up, startup will also sync printers to Firebase at `/print/printers`.

## Updating after a git pull

```bash
cd /opt/remote-printouts
git pull
npm ci
npm run build
sudo systemctl restart remote-printouts
```

## Useful commands

| Action | Command |
|--------|---------|
| Start | `sudo systemctl start remote-printouts` |
| Stop | `sudo systemctl stop remote-printouts` |
| Restart | `sudo systemctl restart remote-printouts` |
| Logs (follow) | `sudo journalctl -u remote-printouts -f` |
| Logs (recent) | `sudo journalctl -u remote-printouts -n 100` |

## Firebase paths

| Path | Purpose |
|------|---------|
| `/print/printjobs/{id}` | Push print jobs here (bridge forwards to jprint) |
| `/print/printers` | Bridge writes the CUPS printer list here |
| `/print/update` | Set to a timestamp (`Date.now()`) to trigger a printer refresh |

### Example: push a print job (client)

```js
import { getDatabase, ref, push } from "firebase/database";

await push(ref(db, "print/printjobs"), {
  type: "escpos",
  printerName: "register",
  template: "^^^** {{title}} **\n---\n^{{message}}\n===",
  data: { title: "Order", message: "Table 5" },
});
```

### Example: refresh printer list (client)

```js
import { getDatabase, ref, set } from "firebase/database";

await set(ref(db, "print/update"), Date.now());
// then read ref(db, "print/printers")
```

Supported job types: `escpos`, `zpl`, `escpos-raw`, `batch` — see [`openapi.json`](openapi.json) for payload fields.

## Troubleshooting

- **Service won't start** — check env vars: `sudo cat /etc/remote-printouts/env` and confirm the service account path exists.
- **Printer sync fails** — confirm jprint is running: `curl http://localhost:3001/api/printers`
- **Jobs not printing** — check logs for claim/print errors; failed jobs stay in `/print/printjobs` with an `error` field.
- **Firebase paths missing** — no need to create them first; the bridge listens until data appears.
