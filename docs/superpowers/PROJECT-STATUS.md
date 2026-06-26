# HMI Tostado — Project Status & Continuation Notes

**Last updated:** 2026-06-26
**Branch:** `main` (feature `feat/arduino-bridge` merged in)
**Deployed:** https://origendelvalle.vercel.app (Vercel auto-deploys from `main`)

---

## Where we are

The coffee-roaster HMI (React/Vite/Tailwind on Vercel) is connected to a real
Arduino UNO through a laptop **bridge** + **Cloudflare tunnel**. **Full closed-loop
heat control is now live end-to-end** (temperature in + SSR heat out), validated on
the bench AND on the real 1100 W burner.

### What actually drives hardware now ✅
- **Temperature reading + roast curve** — real, type-K thermocouple (MAX6675).
- **Heat control (SSR)** — the "Activar Calor" toggle enables it; the Arduino's
  bang-bang loop holds the **setpoint** (cuts SSR at setpoint, re-fires at setpoint−2 °C).
- **Setpoint slider** — now **real** (commands the firmware target; UI-owned display).
- **Emergency stop** — forces SSR off, latches.
- **Comms watchdog** — SSR off ~5 s after the UI/heartbeat disappears.

All four behaviors were verified: bench candle-test (control + hysteresis), e-stop,
watchdog (close the UI → SSR off in 5 s), and a supervised real-burner run.

### Still simulated (demo only, no hardware)
Suction, resistances, fan, motors. (Their controls move but don't drive anything.)

### Chart
Roast-curve cadence 20 s/point; x-axis in **seconds** (`TIEMPO (s)`); the Y-axis +
objective line follow the live **setpoint**.

---

## Architecture (one line)

`Tablet (Vercel UI) ⇄ wss:// Cloudflare tunnel ⇄ laptop Node bridge ⇄ USB serial ⇄ Arduino UNO`

- Firmware: `firmware/tostadora/tostadora.ino` — closed-loop bang-bang controller,
  JSON telemetry every 500 ms, 5 s comms watchdog + overtemp/thermocouple/e-stop gates.
  (`PLOTTER_MODE = false` for JSON; set `true` to graph temp in the IDE Serial Plotter.)
- Bench-test only sketch: `firmware/tc_test/tc_test.ino` — thermocouple read-only.
- Bridge: `bridge/` — Node (`serialport` + `ws`). Mock mode for no-hardware testing.
- UI live wiring: `src/lib/machineData.jsx` + `src/lib/bridgeClient.js` + `src/lib/bridgeProtocol.js`.

### Protocol
- Telemetry (Arduino→UI): `{"temperature":<°C|null>,"setpoint":<°C>,"actuators":{"heat":<bool>},"enabled":<bool>,"connected":true,"fault":<string|null>}`
- Commands (UI→Arduino): `{"heat":bool}`, `{"setpoint":num}` (now sent by the slider), `{"estop":true}`, `{"ping":1}` heartbeat.

---

## How to run it again (daily)

On the laptop, with the Arduino plugged in:

```bash
# 1. Bridge (reads the real Arduino). Port is set in bridge/.env.
cd hmi-tostado/bridge && npm start

# 2. Cloudflare quick tunnel -> prints a wss URL
cloudflared tunnel --url http://localhost:8080
```

- **Tablet:** open `https://origendelvalle.vercel.app/?bridge=wss://<the-tunnel-host>`
- **Laptop (local, no tunnel):** `VITE_BRIDGE_URL=ws://127.0.0.1:8080 npm run dev` → http://localhost:5173
- **Debug the bridge without the UI:** `cd bridge && URL=wss://<host> node smoke-client.mjs`
- Serial port in use today: `/dev/cu.usbserial-A5069RR4` (FTDI). Find it with `ls /dev/cu.usbserial* /dev/cu.usbmodem*`.

---

## Tunnel / connectivity (important)
- **ngrok is BLOCKED on this Mac** by security software (likely corporate MDM/endpoint
  protection): the binary is **deleted within ~3 s** of being written, and ngrok's
  domains (`bin.ngrok.com`) are DNS-blocked. Don't retry ngrok on this machine — it's a
  device policy, not a fixable error.
- **Cloudflare works fine here.** Currently using a **Cloudflare quick tunnel**
  (`cloudflared tunnel --url http://localhost:8080`) → ephemeral `*.trycloudflare.com`
  URL. Tablet opens `origendelvalle.vercel.app/?bridge=wss://<tunnel-host>`.
- **Permanent fix (deferred):** a **named Cloudflare tunnel needs a real domain you own**
  (~$10/yr) added to Cloudflare with real nameserver delegation. The `origendelvalle.vercel.app`
  zone someone added is a Vercel-owned subdomain, stuck `pending`, and **cannot work** —
  delete it. With a real domain, set `VITE_BRIDGE_URL=wss://roaster.<domain>` in Vercel and
  the plain URL just works (no `?bridge=`). Alternative: run the tunnel on a non-managed
  machine / Raspberry Pi where ngrok or other tools aren't blocked.

## Known caveats / decisions
- **Quick-tunnel URL is ephemeral** — changes every `cloudflared` restart. The `?bridge=`
  query param lets the deployed site point at it without a rebuild. Plain
  `origendelvalle.vercel.app` (no `?bridge=`) safely stays in simulator mode.
- The laptop must keep running: **bridge + cloudflared + Arduino plugged in**.
- Final code review was clean (Fix-then-merge items all fixed). Deferred minors are
  logged in `.superpowers/sdd/progress.md`.

---

## Done so far
- ✅ Temperature live on tablet (prior session).
- ✅ Full heat control: SSR wiring, bang-bang control, real setpoint, e-stop, watchdog —
  all verified on bench + real burner (2026-06-26).

## Possible next steps
- **Stable URL:** get a real domain → named Cloudflare tunnel (see Tunnel section).
- **Burner internal thermostat:** the hot plate's own thermostat may cycle and fight the
  loop at higher targets; consider bypassing it to switch the element directly.
- **Permanent safety hardening** (for unattended use): inline fuse + independent thermal
  cutoff (KSD9700) — currently relying on the house breaker + burner thermostat + supervision.
- **Optional UI:** live "Calentando / Manteniendo / Detenido" indicator (show the actual
  SSR cycling vs. the master enable); align the "Objetivo Final" card with the setpoint.
4. Verify the **e-stop** button cuts the SSR.
5. Decide whether to make the **setpoint slider real** (currently cosmetic) so the target
   temp is controllable from the UI.
6. (Optional, permanent) Replace the quick tunnel with a **named Cloudflare tunnel** +
   stable hostname + `VITE_BRIDGE_URL` env var in Vercel, so the plain URL "just works"
   with no `?bridge=` param.

## Relay / heat hardware (decided 2026-06-25)

- **Heater:** sealed electric burner, **1100 W @ 110 VAC** (the listing's "1100 V" is a typo) → **~10 A** running current. Has its **own knob/thermostat + power switch**.
  - First bring-up: set the burner knob to **max** and let the SSR + Arduino do the on/off. Its **internal thermostat may still cycle** and fight the bang-bang loop (expected — a temperature plateau even when our SSR says ON). Bypassing the burner's internal thermostat to switch the element directly is a deeper mod for later.
- **SSR — Fotek SSR-40 DA** (DC control, AC switching, zero-cross):
  - Control input: terminal **3 (+)** ← Arduino **D8**, terminal **4 (−)** ← Arduino **GND** (`3-32VDC`, 5V logic HIGH triggers it).
  - Load output: terminals **1 / 2** (`24-380VAC`) switch the **Live** wire.
  - 10 A ≪ 40 A label, but **heatsink + thermal paste required** (it dissipates ~12–15 W). Fotek is counterfeit-prone and **fails SHORTED (stuck ON)**. **Heatsink is on hand. ✅**

### Prototype scope — supervised, lean parts (decided 2026-06-25)
Running a minimal but not-reckless setup for the bench bring-up:
- **SSR heatsink:** have it, will use it (the one non-negotiable). ✅
- **Overcurrent:** rely on the **house wall-outlet breaker** (15/20 A) for the 10 A load — dedicated inline fuse **deferred**.
- **Over-temp:** rely on the **burner's own internal thermostat** (it self-limits to the knob setting) — KSD9700 thermal cutoff **deferred**.
- **Wire:** **reuse the heater's own rated power cord** — mains path stays on insulated ≥10 A conductors; never breadboard jumpers. No bulk 14 AWG purchase.
- **Hard rule:** **supervised only** — never leave it running unattended until the thermal cutoff + inline fuse are added for a permanent build. Keep a fast kill in reach (outlet switch / burner switch / unplug).
- **Load wiring order:** AC Live → SSR terminal 1; SSR terminal 2 → heater; heater → Neutral. (Add fuse + thermal cutoff in series with Live when going permanent.)
- **Bench-test sequence (do in order):** (1) logic side only, heater **unplugged**, toggle heat in UI → watch the SSR's own LED; (2) plug heater, verify heat toggle switches it and telemetry `actuators.heat` follows; (3) watchdog: enable heat, kill the bridge → SSR off within 5 s; (4) e-stop button → SSR off.

## Reference docs
- Design spec: `docs/superpowers/specs/2026-06-24-arduino-bridge-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-24-arduino-bridge.md`
- Bridge ops: `bridge/README.md`
