# HMI Tostado — Bridge

Reads the Arduino's serial telemetry and exposes it to the Vercel UI over a
Cloudflare-tunneled WebSocket; relays UI commands back to the Arduino.

## What's real vs. simulated (prototype)

Real hardware is **1 thermocouple + 1 SSR**. In the UI, only these are wired to it:

- **Temperature reading + roast curve** — live from the thermocouple.
- **Heat toggle** — enables/disables the SSR (the Arduino holds its own setpoint with a bang-bang loop).
- **Emergency stop** — forces the SSR off on the hardware (latched in firmware).

Everything else (setpoint slider, suction, resistances, fan, motors) is **cosmetic / simulated** for demonstration and does not touch hardware.

## Run

1. `cp .env.example .env` and set `SERIAL_PORT` (or leave `mock` for no hardware).
2. `npm install`
3. `npm start`                            # bridge on ws://localhost:8080
4. `cloudflared tunnel run hmi-tostado`   # exposes wss://roaster.<domain>

The Vercel UI connects via the `VITE_BRIDGE_URL` env var (set to
`wss://roaster.<domain>` in the Vercel dashboard, then redeploy).

## Protocol

- **Telemetry (Arduino → UI):** `{"temperature":<°C|null>,"setpoint":<°C>,"actuators":{"heat":<bool>},"enabled":<bool>,"connected":true,"fault":<string|null>}`
- **Commands (UI → Arduino):** `{"heat":<bool>}`, `{"estop":true}`, `{"ping":1}` (heartbeat).
  - The setpoint slider is cosmetic and does **not** send `{"setpoint":…}` in this build; the firmware uses its own default target.

## Modes

- `SERIAL_PORT=mock` — synthetic closed-loop telemetry, no hardware (dev/testing/demo).
- `SERIAL_PORT=/dev/tty.usbmodemXXXX` — real Arduino (find it with `ls /dev/tty.usbmodem*` on macOS).

## Cloudflare Tunnel — one-time setup

```bash
brew install cloudflared
cloudflared tunnel login                       # authorize a domain in Cloudflare
cloudflared tunnel create hmi-tostado
cloudflared tunnel route dns hmi-tostado roaster.<your-domain>
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: hmi-tostado
credentials-file: /Users/<you>/.cloudflared/<UUID>.json
ingress:
  - hostname: roaster.<your-domain>
    service: ws://localhost:8080
  - service: http_status:404
```

Verify end-to-end (with the bridge running in mock mode):
`npx wscat -c wss://roaster.<your-domain>` → expect a `status` frame then `telemetry` frames.

## Safety

The firmware runs a 5s comms watchdog plus overtemp (260 °C), thermocouple-fault,
and e-stop gates that force the SSR off. The UI sends a heartbeat every 2s. A
**physical stove cutoff is still required** — software is not the only line of defense.
