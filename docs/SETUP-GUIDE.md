# HMI Tostado — Setup Guide (new laptop / demo machine)

How to get the whole system running on a fresh Mac for a demo. End state:
**tablet shows live temperature + drives the heater**, through this laptop.

```
Tablet (origendelvalle.vercel.app) ⇄ wss:// Cloudflare tunnel ⇄ this laptop (bridge) ⇄ USB ⇄ Arduino ⇄ thermocouple + SSR
```

You need: this laptop, the Arduino (already flashed — see step 3 if not), a USB
cable, the tablet, and internet on both.

---

## 1. Install the tools (one-time)

Open **Terminal** and install [Homebrew](https://brew.sh) if it's not present:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Then:
```bash
brew install node git cloudflared
brew install --cask arduino-ide          # only if you'll re-flash the Arduino
```
Verify:
```bash
node --version    # v18+ expected
cloudflared --version
```

> ⚠️ **Do not use ngrok** — it's blocked by security software on the current machine
> (and may be on others). Cloudflare is the supported tunnel.

## 2. Get the code
```bash
cd ~
git clone https://github.com/Sinfolonokojo/hmi-tostado.git
cd hmi-tostado
```

## 3. Flash the Arduino (skip if already flashed)

In Arduino IDE: **Library Manager** → install **"MAX6675 library" (Adafruit)** and
**"ArduinoJson" (Benoit Blanchon, v7)**. Open `firmware/tostadora/tostadora.ino`,
select board **Arduino UNO** + the right port, **Upload**.

**Wiring recap:** MAX6675 `SCK→D6, CS→D5, SO→D4, VCC→5V, GND→GND`. SSR control
`D8→ "+" (term 3)`, `GND→ "−" (term 4)`. SSR load side switches the burner's **Live**
wire (term 1 = AC Live in, term 2 = to burner). **SSR on a heatsink. Supervised use only.**

## 4. Start the bridge
```bash
cd ~/hmi-tostado/bridge
npm install                              # first time only
cp .env.example .env                     # first time only
```
Find the Arduino's serial port (plug it in first):
```bash
ls /dev/cu.usbserial* /dev/cu.usbmodem*
```
Edit `.env` and set `SERIAL_PORT` to that path (e.g. `/dev/cu.usbserial-XXXX`).
Then:
```bash
npm start            # prints: [bridge] WebSocket on :8080 — serial=/dev/cu… 
```
Quick check (optional, in another terminal): `cd ~/hmi-tostado/bridge && node smoke-client.mjs`
→ should print `status` + `telemetry` frames with a real `temperature`.

## 5. Start the Cloudflare tunnel (second terminal)
```bash
cloudflared tunnel --url http://localhost:8080
```
It prints a line like:
```
https://<random-words>.trycloudflare.com
```
Copy that host.

## 6. Open it on the tablet
In the tablet browser, go to (replace the host, and note `https`→`wss`):
```
https://origendelvalle.vercel.app/?bridge=wss://<random-words>.trycloudflare.com
```
You should see live temperature. Use **Activar Calor** to enable heat, **Ajustes**
for the setpoint, the roast curve on **Monitoreo**, and **Paro de emergencia** to stop.

---

## Daily run (after one-time setup)
Two terminals, Arduino plugged in:
```bash
# terminal 1
cd ~/hmi-tostado/bridge && npm start
# terminal 2
cloudflared tunnel --url http://localhost:8080
```
Then open the tablet URL with the new `?bridge=wss://…` host (it changes each run).

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| `command not found` after install | open a new terminal, or run `hash -r` |
| Bridge: `Error: No such file` on serial | wrong `SERIAL_PORT` in `.env`; re-run the `ls` and update it |
| Tablet shows simulator, not live temp | missing/typo'd `?bridge=` host; confirm tunnel + bridge are running |
| Temp shows but heat won't switch | thermocouple must sense the heat; check SSR wiring + heatsink + burner knob on |
| `fault:"thermocouple"` | thermocouple not wired / open — check MAX6675 connections |
| `fault:"comms"` | UI/tunnel dropped > 5 s; refresh the tablet (watchdog cut the SSR — safe) |
| Tunnel keeps dropping | quick tunnels are flaky; for a stable URL set up a named Cloudflare tunnel (needs a real domain — see PROJECT-STATUS.md) |

## For a polished, stable demo (optional)
The quick-tunnel URL changes every run and drops occasionally. For a fixed URL that
"just works" at `origendelvalle.vercel.app` (no `?bridge=`), set up a **named Cloudflare
tunnel** with a **real domain you own** and set `VITE_BRIDGE_URL=wss://roaster.<domain>`
in the Vercel dashboard. Details in `docs/superpowers/PROJECT-STATUS.md`.

## Safety (every time)
SSR on a heatsink; **supervised only**; keep a fast kill in reach (unplug / burner
switch / UI e-stop). It's mains + a heating element — don't leave it running unattended.
