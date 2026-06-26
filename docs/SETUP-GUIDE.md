# HMI Tostado — Setup Guide (demo laptop)

How to get the whole system running on a fresh laptop for a demo. End state:
**tablet shows live temperature + drives the heater**, through this laptop.

```
Tablet (origendelvalle.vercel.app) ⇄ wss:// Cloudflare tunnel ⇄ this laptop (bridge) ⇄ USB ⇄ Arduino ⇄ thermocouple + SSR
```

You need: this laptop, the Arduino (already flashed — see step 3 if not), a USB
cable, the tablet, and internet on both.

> **Primary target: Windows 11** (the demo machine). A macOS appendix is at the bottom.

---

# Windows 11

Use **PowerShell** (search "PowerShell" in the Start menu). Most installs use
`winget`, which is built into Windows 11.

## 1. Install the tools (one-time)
```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
winget install -e --id Cloudflare.cloudflared
winget install -e --id ArduinoSDK.IDE        # only if you'll re-flash the Arduino
```
**Close and reopen PowerShell** after installing (so the new commands are on PATH), then verify:
```powershell
node --version       # v18+ expected
git --version
cloudflared --version
```
If a command still isn't found, reopen PowerShell once more (PATH refresh).

> If `winget` can't find a package, install from the official site instead:
> Node.js → nodejs.org, Git → git-scm.com, cloudflared → Cloudflare downloads,
> Arduino IDE → arduino.cc/en/software.

## 2. Get the code
```powershell
cd $HOME
git clone https://github.com/Sinfolonokojo/hmi-tostado.git
cd hmi-tostado
```

## 3. Flash the Arduino (skip if already flashed)
In Arduino IDE: **Library Manager** → install **"MAX6675 library" (Adafruit)** and
**"ArduinoJson" (Benoit Blanchon, v7)**. Open `firmware\tostadora\tostadora.ino`,
choose board **Arduino UNO** + the COM port, **Upload**.

- Windows usually auto-installs the USB-serial driver. If the board doesn't appear,
  install the **FTDI VCP driver** (ftdichip.com) or the CH340 driver, depending on your board.

**Wiring recap:** MAX6675 `SCK→D6, CS→D5, SO→D4, VCC→5V, GND→GND`. SSR control
`D8→ "+" (term 3)`, `GND→ "−" (term 4)`. SSR load side switches the burner's **Live**
wire (term 1 = AC Live in, term 2 = to burner). **SSR on a heatsink. Supervised use only.**

## 4. Start the bridge
```powershell
cd $HOME\hmi-tostado\bridge
npm install                 # first time only
copy .env.example .env      # first time only
```
**Find the COM port:** Arduino IDE → **Tools → Port** (e.g. `COM3`), or Device Manager →
**Ports (COM & LPT)**. Then edit `bridge\.env` (open in Notepad) and set:
```
SERIAL_PORT=COM3
```
(use your actual COM number). Then start it:
```powershell
npm start                   # prints: [bridge] WebSocket on :8080 — serial=COM3 …
```
Optional check (new PowerShell window): `cd $HOME\hmi-tostado\bridge ; node smoke-client.mjs`
→ should print `status` + `telemetry` with a real `temperature`.

## 5. Start the Cloudflare tunnel (second PowerShell window)
```powershell
cloudflared tunnel --url http://localhost:8080
```
It prints a line like `https://<random-words>.trycloudflare.com`. Copy that host.

## 6. Open it on the tablet
In the tablet browser (replace the host, note `https`→`wss`):
```
https://origendelvalle.vercel.app/?bridge=wss://<random-words>.trycloudflare.com
```
Live temperature should appear. Use **Activar Calor** (heat), **Ajustes** (setpoint),
the roast curve on **Monitoreo**, and **Paro de emergencia** to stop.

## Daily run (Windows)
Two PowerShell windows, Arduino plugged in:
```powershell
# window 1
cd $HOME\hmi-tostado\bridge ; npm start
# window 2
cloudflared tunnel --url http://localhost:8080
```
Then open the tablet URL with the new `?bridge=wss://…` host (it changes each run).

---

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| `node`/`cloudflared` not found | reopen PowerShell (PATH refresh) after install |
| Board not in Arduino IDE port list | install FTDI VCP or CH340 USB-serial driver; try another USB cable/port |
| Bridge can't open serial / `COM` error | wrong `SERIAL_PORT` in `.env`; check the COM number in Device Manager; close Arduino IDE Serial Monitor (it locks the port) |
| Tablet shows simulator, not live temp | missing/typo'd `?bridge=` host; confirm bridge + tunnel are both running |
| Temp shows but heat won't switch | thermocouple must sense the heat; check SSR wiring + heatsink + burner knob on |
| `fault:"thermocouple"` | thermocouple not wired / open — check MAX6675 connections |
| `fault:"comms"` | UI/tunnel dropped > 5 s; refresh the tablet (watchdog cut the SSR — safe) |
| Tunnel keeps dropping | quick tunnels are flaky; for a stable URL use a named Cloudflare tunnel (needs a real domain — see PROJECT-STATUS.md) |

## For a polished, stable demo (optional)
The quick-tunnel URL changes every run and drops occasionally. For a fixed URL that
"just works" at `origendelvalle.vercel.app` (no `?bridge=`), set up a **named Cloudflare
tunnel** with a **real domain you own** and set `VITE_BRIDGE_URL=wss://roaster.<domain>`
in the Vercel dashboard. Details in `docs/superpowers/PROJECT-STATUS.md`.
(Note: **ngrok is blocked** on the original dev Mac by security software; Cloudflare is the supported tunnel.)

## Safety (every time)
SSR on a heatsink; **supervised only**; keep a fast kill in reach (unplug / burner
switch / UI e-stop). It's mains + a heating element — don't leave it running unattended.

---

# Appendix — macOS (dev machine)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"   # if no Homebrew
brew install node git cloudflared
brew install --cask arduino-ide        # only to re-flash
git clone https://github.com/Sinfolonokojo/hmi-tostado.git && cd hmi-tostado
cd bridge && npm install && cp .env.example .env
ls /dev/cu.usbserial* /dev/cu.usbmodem*   # find the port, put it in .env as SERIAL_PORT
npm start
# second terminal:
cloudflared tunnel --url http://localhost:8080
```
Everything else (tablet URL, daily run, troubleshooting) is identical to Windows;
only the install commands and the serial port name (`/dev/cu.*` vs `COM3`) differ.
