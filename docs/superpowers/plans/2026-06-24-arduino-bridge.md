# Arduino ↔ UI Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the real prototype hardware (1 thermocouple + 1 SSR, closed-loop firmware already written) to the Vercel-hosted HMI so the UI shows live temperature and commands heat-enable, setpoint, and e-stop, via a laptop bridge tunneled with Cloudflare.

**Architecture:** The Arduino runs a **closed-loop bang-bang controller** and emits newline-JSON telemetry over USB serial; it accepts newline-JSON commands. A small Node bridge on the laptop reads the serial port, broadcasts telemetry over WebSocket, and relays commands back (translating WS command names → JSON serial lines). Cloudflare Tunnel exposes the WebSocket as a stable `wss://` hostname so the HTTPS Vercel page can connect. The UI's single data hook (`machineData.jsx`) swaps temperature/setpoint/heat/e-stop to the WebSocket; everything else stays simulated.

**Tech Stack:** Arduino C++ (firmware already provided), Node.js (serialport, ws), Cloudflare Tunnel (`cloudflared`), React/Vite (existing UI). Tests use Node's built-in `node --test` (no new test framework).

## Global Constraints

- **Serial:** 115200 baud, newline (`\n`) delimited, **one JSON object per line in both directions**.
- **Telemetry (Arduino→bridge):** `{"temperature":<°C|null>,"setpoint":<°C>,"actuators":{"heat":<bool>},"enabled":<bool>,"connected":true,"fault":<string|null>}`. `fault` ∈ `"thermocouple"|"estop"|"comms"|"overtemp"|null`. `actuators.heat` is the **actual** SSR state (flickers with bang-bang); `enabled` is the commanded master enable.
- **Serial commands (bridge→Arduino):** `{"heat":<bool>}`, `{"setpoint":<num>}`, `{"estop":true}`, `{"ping":1}`. Each terminated with `\n`.
- **WebSocket messages:** `{type:"telemetry",data:{…}}` and `{type:"status",connected,serial}` down; `{type:"command",name,args}` up. Command names: `setHeat`, `setSetpoint`, `estop`, `heartbeat`.
- **Watchdog:** firmware turns the SSR off if no serial line arrives for 5000 ms; also forces SSR off on overtemp (260 °C), thermocouple fault, or latched e-stop.
- **No auth** (prototype).
- **UI changes are confined to `src/lib/`** — pages/components are not modified. Non-hardware controls (suction, resistances, fan, motors) remain simulated.
- **Keep `?sim` mode** working (full simulator, no bridge).
- Match repo style: UI JS omits semicolons, single quotes, 2-space indent; mirror that in the new Node bridge.

---

### Task 1: Flash & verify the provided firmware (manual)

**Files:**
- Already present: `firmware/tostadora/tostadora.ino` (closed-loop controller — do not rewrite).

**Interfaces (the serial contract every later task depends on):**
- Emits the telemetry JSON above every ~500 ms.
- Accepts the command JSON above; any valid line refreshes the 5 s watchdog.

> Prerequisite libraries (Arduino IDE → Manage Libraries): **"MAX6675 library" by Adafruit** and **"ArduinoJson" by Benoit Blanchon (v7.x)**.

- [ ] **Step 1: Compile & upload**

Open `firmware/tostadora/tostadora.ino`, select board **Arduino UNO** + the correct port, click Upload. Expected: "Done uploading", no compile errors.

- [ ] **Step 2: Verify telemetry (manual)**

Serial Monitor at **115200 baud**, line ending **Newline**. Expected ~2 lines/sec like:
`{"temperature":24.8,"setpoint":215,"actuators":{"heat":false},"enabled":false,"connected":true,"fault":null}`
(If the thermocouple is disconnected, `"temperature":null` and `"fault":"thermocouple"`.)

- [ ] **Step 3: Verify command + closed loop (manual)**

Send `{"setpoint":40}` then `{"heat":true}`. Expected: `enabled` becomes `true`; if room temp < 38 °C the SSR clicks on (`actuators.heat:true`) and `temperature` rises toward 40, then cycles off at 40. Send `{"heat":false}` → SSR off.

- [ ] **Step 4: Verify watchdog + e-stop (manual)**

With heat enabled, **stop sending lines** for >5 s → `fault` becomes `"comms"` and SSR off. Re-send `{"heat":true}`, then send `{"estop":true}` → `fault:"estop"`, SSR off and stays off until heat is re-enabled.

No commit (firmware already committed).

---

### Task 2: Bridge — protocol module (TDD)

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/src/protocol.js`
- Test: `bridge/test/protocol.test.js`

**Interfaces:**
- Produces: `parseTelemetry(line: string) => object | null` (parsed telemetry object, or null if not valid JSON / not an object / missing `temperature` key — `temperature: null` is still valid). `buildCommand(name: string, args?: any[]) => string | null` returning a JSON serial line:
  - `setHeat,[bool]→'{"heat":true|false}'`, `setSetpoint,[num]→'{"setpoint":N}'`, `estop→'{"estop":true}'`, `heartbeat→'{"ping":1}'`, unknown→`null`.

- [ ] **Step 1: Create `bridge/package.json`**

```json
{
  "name": "hmi-tostado-bridge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@serialport/parser-readline": "^12.0.0",
    "dotenv": "^16.4.5",
    "serialport": "^12.0.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Install deps**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the failing test**

`bridge/test/protocol.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTelemetry, buildCommand } from '../src/protocol.js'

test('parseTelemetry returns the parsed telemetry object', () => {
  const line = '{"temperature":182.4,"setpoint":215,"actuators":{"heat":true},"enabled":true,"connected":true,"fault":null}'
  const obj = parseTelemetry(line)
  assert.equal(obj.temperature, 182.4)
  assert.equal(obj.actuators.heat, true)
  assert.equal(obj.fault, null)
})

test('parseTelemetry accepts null temperature (fault state)', () => {
  const obj = parseTelemetry('{"temperature":null,"fault":"thermocouple"}')
  assert.equal(obj.temperature, null)
  assert.equal(obj.fault, 'thermocouple')
})

test('parseTelemetry rejects junk and lines without temperature', () => {
  assert.equal(parseTelemetry('not json'), null)
  assert.equal(parseTelemetry('{"setpoint":215}'), null)
})

test('buildCommand emits JSON serial lines', () => {
  assert.equal(buildCommand('setHeat', [true]), '{"heat":true}')
  assert.equal(buildCommand('setHeat', [false]), '{"heat":false}')
  assert.equal(buildCommand('setSetpoint', [215]), '{"setpoint":215}')
  assert.equal(buildCommand('estop'), '{"estop":true}')
  assert.equal(buildCommand('heartbeat'), '{"ping":1}')
  assert.equal(buildCommand('bogus'), null)
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: FAIL — cannot find module `../src/protocol.js`.

- [ ] **Step 5: Write `bridge/src/protocol.js`**

```js
export function parseTelemetry(line) {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  if (!('temperature' in obj)) return null
  return obj
}

export function buildCommand(name, args = []) {
  switch (name) {
    case 'setHeat':
      return JSON.stringify({ heat: !!args[0] })
    case 'setSetpoint':
      return JSON.stringify({ setpoint: Number(args[0]) })
    case 'estop':
      return JSON.stringify({ estop: true })
    case 'heartbeat':
      return JSON.stringify({ ping: 1 })
    default:
      return null
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
printf 'node_modules/\n.env\n' > bridge/.gitignore
git add bridge/package.json bridge/package-lock.json bridge/.gitignore bridge/src/protocol.js bridge/test/protocol.test.js
git commit -m "feat(bridge): JSON telemetry/command protocol module with tests"
```

---

### Task 3: Bridge — serial link with mock mode (TDD)

**Files:**
- Create: `bridge/src/mockSerial.js`
- Create: `bridge/src/serial.js`
- Test: `bridge/test/mockSerial.test.js`

**Interfaces:**
- Produces: `createSerialLink({port,baud}, {onLine, onStatus}) => { write(str), close() }`. When `port === 'mock'`, returns a synthetic source that **emulates the firmware's closed loop**: emits the telemetry JSON shape on an interval and responds to `{"heat"}`/`{"setpoint"}`/`{"estop"}` writes. The mock also exposes `tick()` so tests can step deterministically.

- [ ] **Step 1: Write the failing test**

`bridge/test/mockSerial.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMockSerial } from '../src/mockSerial.js'

test('mock emulates the closed loop and reflects commands', () => {
  const lines = []
  let status = null
  const link = createMockSerial({
    onLine: (l) => lines.push(l),
    onStatus: (s) => { status = s },
  })
  assert.equal(status, true)

  link.tick()
  let last = JSON.parse(lines.at(-1))
  assert.equal(last.enabled, false)
  assert.equal(last.actuators.heat, false)
  assert.equal(typeof last.temperature, 'number')

  link.write('{"heat":true}')
  link.tick()
  last = JSON.parse(lines.at(-1))
  assert.equal(last.enabled, true)
  assert.equal(last.actuators.heat, true) // cold start: temp <= setpoint-2 -> SSR on

  link.write('{"estop":true}')
  link.tick()
  last = JSON.parse(lines.at(-1))
  assert.equal(last.actuators.heat, false)
  assert.equal(last.fault, 'estop')

  link.close()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: FAIL — cannot find `../src/mockSerial.js`.

- [ ] **Step 3: Write `bridge/src/mockSerial.js`**

```js
// Synthetic stand-in for the Arduino: emulates the firmware's closed-loop
// bang-bang controller so the bridge + UI can run with no hardware. tick() is
// exposed for deterministic tests; the real interval calls the same function.
export function createMockSerial({ onLine, onStatus }) {
  let enabled = false
  let setpoint = 215
  let estop = false
  let temp = 22
  let ssr = false

  const tick = () => {
    if (!enabled || estop) ssr = false
    else if (!ssr && temp <= setpoint - 2) ssr = true
    else if (ssr && temp >= setpoint) ssr = false

    const target = ssr ? setpoint + 30 : 22
    temp += (target - temp) * 0.05

    onLine(JSON.stringify({
      temperature: Math.round(temp * 10) / 10,
      setpoint,
      actuators: { heat: ssr },
      enabled,
      connected: true,
      fault: estop ? 'estop' : null,
    }))
  }

  const apply = (line) => {
    let m
    try {
      m = JSON.parse(line)
    } catch {
      return
    }
    if (m.heat != null) {
      enabled = !!m.heat
      if (enabled) estop = false
    }
    if (m.setpoint != null) setpoint = Number(m.setpoint)
    if (m.estop) {
      estop = true
      enabled = false
    }
    // {"ping"} needs no handling in the mock
  }

  onStatus(true)
  const id = setInterval(tick, 500)

  return {
    tick,
    write: (s) => apply(String(s).trim()),
    close: () => clearInterval(id),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: PASS.

- [ ] **Step 5: Write `bridge/src/serial.js`** (real port + mock dispatch)

```js
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { createMockSerial } from './mockSerial.js'

export function createSerialLink({ port, baud }, { onLine, onStatus }) {
  if (port === 'mock') return createMockSerial({ onLine, onStatus })

  let sp = null

  const open = () => {
    sp = new SerialPort({ path: port, baudRate: baud })
    const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }))
    parser.on('data', (d) => onLine(String(d).trim()))
    sp.on('open', () => onStatus(true))
    sp.on('error', () => {}) // 'close' handles reconnect
    sp.on('close', () => {
      onStatus(false)
      setTimeout(open, 2000) // auto-reconnect
    })
  }

  open()

  return {
    write: (s) => {
      if (sp && sp.isOpen) sp.write(s + '\n')
    },
    close: () => sp && sp.close(),
  }
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add bridge/src/mockSerial.js bridge/src/serial.js bridge/test/mockSerial.test.js
git commit -m "feat(bridge): serial link with closed-loop mock mode"
```

---

### Task 4: Bridge — WebSocket server + entry point (TDD)

**Files:**
- Create: `bridge/src/server.js`
- Create: `bridge/src/index.js`
- Create: `bridge/.env.example`
- Test: `bridge/test/server.test.js`

**Interfaces:**
- Consumes: `buildCommand` (Task 2); `createSerialLink` (Task 3).
- Produces: `startServer({port, serial, getStatus}) => { broadcast(obj), close() }`. Broadcasts JSON to all open clients; on a `{type:'command',name,args}` message it calls `serial.write(buildCommand(name,args))` when that yields a non-null line.

- [ ] **Step 1: Write the failing test**

`bridge/test/server.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { startServer } from '../src/server.js'

const PORT = 8137

function fakeSerial() {
  return { writes: [], write(s) { this.writes.push(s) }, close() {} }
}

test('broadcasts telemetry and relays commands as JSON serial lines', async () => {
  const serial = fakeSerial()
  const server = startServer({ port: PORT, serial, getStatus: () => ({ connected: true, serial: true }) })

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
  const messages = []
  await new Promise((res) => ws.on('open', res))
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

  ws.send(JSON.stringify({ type: 'command', name: 'setHeat', args: [true] }))
  await new Promise((res) => setTimeout(res, 50))
  assert.deepEqual(serial.writes, ['{"heat":true}'])

  server.broadcast({ type: 'telemetry', data: { temperature: 100 } })
  await new Promise((res) => setTimeout(res, 50))
  assert.ok(messages.some((m) => m.type === 'telemetry' && m.data.temperature === 100))

  ws.close()
  server.close()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: FAIL — cannot find `../src/server.js`.

- [ ] **Step 3: Write `bridge/src/server.js`**

```js
import { WebSocketServer } from 'ws'
import { buildCommand } from './protocol.js'

export function startServer({ port, serial, getStatus }) {
  const wss = new WebSocketServer({ port })

  const broadcast = (obj) => {
    const msg = JSON.stringify(obj)
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg)
    }
  }

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'status', ...getStatus() }))
    ws.on('message', (raw) => {
      let m
      try {
        m = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (m.type === 'command') {
        const cmd = buildCommand(m.name, m.args)
        if (cmd) serial.write(cmd)
      }
    })
  })

  return { broadcast, close: () => wss.close() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: PASS.

- [ ] **Step 5: Write `bridge/src/index.js`** (wires serial ↔ server)

```js
import 'dotenv/config'
import { createSerialLink } from './serial.js'
import { startServer } from './server.js'
import { parseTelemetry } from './protocol.js'

const WS_PORT = Number(process.env.WS_PORT || 8080)
const SERIAL_PORT = process.env.SERIAL_PORT || 'mock'
const BAUD = Number(process.env.BAUD || 115200)

let serialConnected = false
let server = null

const serial = createSerialLink(
  { port: SERIAL_PORT, baud: BAUD },
  {
    onLine: (line) => {
      const data = parseTelemetry(line)
      if (data && server) server.broadcast({ type: 'telemetry', data })
    },
    onStatus: (connected) => {
      serialConnected = connected
      if (server) server.broadcast({ type: 'status', connected: true, serial: connected })
    },
  },
)

server = startServer({
  port: WS_PORT,
  serial,
  getStatus: () => ({ connected: true, serial: serialConnected }),
})

console.log(`[bridge] WebSocket on :${WS_PORT} — serial=${SERIAL_PORT} @ ${BAUD}`)
```

- [ ] **Step 6: Write `bridge/.env.example`**

```
# Set to the Arduino's serial device, or "mock" to run without hardware.
# macOS example: /dev/tty.usbmodem14101
# Linux example: /dev/ttyACM0
SERIAL_PORT=mock
BAUD=115200
WS_PORT=8080
```

- [ ] **Step 7: Manual smoke test (mock mode)**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado/bridge
cp .env.example .env
npm start
```
Expected log: `[bridge] WebSocket on :8080 — serial=mock @ 115200`. In another terminal: `npx wscat -c ws://127.0.0.1:8080` → expect a `status` message then `telemetry` messages ~2/s. Send `{"type":"command","name":"setSetpoint","args":[40]}` then `{"type":"command","name":"setHeat","args":[true]}` → telemetry `enabled:true` and `temperature` climbs toward 40. Ctrl-C both.

- [ ] **Step 8: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add bridge/src/server.js bridge/src/index.js bridge/.env.example bridge/test/server.test.js
git commit -m "feat(bridge): WebSocket server + serial wiring entry point"
```

---

### Task 5: UI — telemetry merge helpers (TDD)

**Files:**
- Create: `src/lib/bridgeProtocol.js`
- Test: `test/bridgeProtocol.test.js`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `deriveTrend(prevTemp, newTemp, dtMs) => number` (°/min, clamped ±9.9, 0 if no prev/dt). `applyTelemetry(state, data) => state`: sets `temperature` (only when `data.temperature != null`), `setpoint`, `actuators.heat` ← **`data.enabled`** (commanded master enable, not the flickering SSR), `fault`, `connected:true`; leaves all other state untouched.

- [ ] **Step 1: Add a test script to `package.json`**

Add to the `"scripts"` block in `/Users/Work_tmp/Julian/hmi-tostado/package.json`:

```json
    "test": "node --test test/",
```

- [ ] **Step 2: Write the failing test**

`test/bridgeProtocol.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTrend, applyTelemetry } from '../src/lib/bridgeProtocol.js'

test('deriveTrend returns 0 without a previous reading', () => {
  assert.equal(deriveTrend(null, 100, 500), 0)
})

test('deriveTrend converts °/ms to °/min and clamps', () => {
  assert.equal(deriveTrend(100, 101, 1000), 9.9)   // +60°/min clamped
  assert.equal(deriveTrend(100, 100.05, 1000), 3)  // +3.0°/min
})

test('applyTelemetry merges fields and maps heat from enabled', () => {
  const state = { temperature: 20, setpoint: 100, trend: 0, actuators: { vacio: true, heat: false }, suction: { speed: 9 }, connected: false }
  const data = { temperature: 182.4, setpoint: 220, actuators: { heat: true }, enabled: true, connected: true, fault: null }
  const next = applyTelemetry(state, data)
  assert.equal(next.temperature, 182.4)
  assert.equal(next.setpoint, 220)
  assert.equal(next.actuators.heat, true)   // from enabled
  assert.equal(next.actuators.vacio, true)  // untouched
  assert.equal(next.suction.speed, 9)       // untouched
  assert.equal(next.fault, null)
  assert.equal(next.connected, true)
})

test('applyTelemetry maps heat from enabled, not the flickering SSR', () => {
  const state = { actuators: { heat: true }, temperature: 50 }
  const next = applyTelemetry(state, { temperature: 50, enabled: false, actuators: { heat: true }, fault: null })
  assert.equal(next.actuators.heat, false)
})

test('applyTelemetry keeps last temperature on a null reading and surfaces the fault', () => {
  const state = { temperature: 150, actuators: {}, connected: true }
  const next = applyTelemetry(state, { temperature: null, enabled: false, actuators: { heat: false }, fault: 'thermocouple' })
  assert.equal(next.temperature, 150) // unchanged
  assert.equal(next.fault, 'thermocouple')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: FAIL — cannot find `../src/lib/bridgeProtocol.js`.

- [ ] **Step 4: Write `src/lib/bridgeProtocol.js`**

```js
// Pure helpers turning bridge telemetry into UI state. Framework-free so they
// can be unit-tested with `node --test`.

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function deriveTrend(prevTemp, newTemp, dtMs) {
  if (prevTemp == null || !dtMs) return 0
  const perMin = ((newTemp - prevTemp) / dtMs) * 60000
  return +clamp(perMin, -9.9, 9.9).toFixed(1)
}

export function applyTelemetry(state, data) {
  const next = {
    ...state,
    setpoint: data.setpoint ?? state.setpoint,
    // The UI's heat toggle reflects the COMMANDED master enable, not the SSR
    // that flickers as the bang-bang controller holds temperature.
    actuators: { ...state.actuators, heat: !!data.enabled },
    fault: data.fault ?? null,
    connected: true,
  }
  if (data.temperature != null) next.temperature = data.temperature
  return next
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add package.json test/bridgeProtocol.test.js src/lib/bridgeProtocol.js
git commit -m "feat(ui): telemetry merge + trend helpers with tests"
```

---

### Task 6: UI — WebSocket bridge client (TDD)

**Files:**
- Create: `src/lib/bridgeClient.js`
- Test: `test/bridgeClient.test.js`

**Interfaces:**
- Produces: `createBridgeClient({url, onTelemetry, onStatus, WebSocketImpl?, heartbeatMs?, reconnectMs?}) => { sendCommand(name, args), close() }`. Auto-reconnects on close with exponential backoff; sends `{type:'command',name:'heartbeat'}` every `heartbeatMs` while open; routes incoming `telemetry`/`status` to callbacks. `WebSocketImpl` is injectable for tests (defaults to global `WebSocket`).

- [ ] **Step 1: Write the failing test**

`test/bridgeClient.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBridgeClient } from '../src/lib/bridgeClient.js'

function FakeWSFactory(registry) {
  return class FakeWS {
    constructor() {
      this.readyState = 0
      this.sent = []
      registry.instances.push(this)
    }
    send(s) { this.sent.push(s) }
    close() { this.readyState = 3; this.onclose && this.onclose() }
    _open() { this.readyState = 1; this.onopen && this.onopen() }
    _msg(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }) }
  }
}

test('routes telemetry and status to callbacks', () => {
  const registry = { instances: [] }
  const tele = []
  let status = null
  const client = createBridgeClient({
    url: 'ws://x',
    WebSocketImpl: FakeWSFactory(registry),
    onTelemetry: (d) => tele.push(d),
    onStatus: (s) => { status = s },
    heartbeatMs: 999999,
  })
  const ws = registry.instances[0]
  ws._open()
  ws._msg({ type: 'telemetry', data: { temperature: 50, enabled: false } })
  ws._msg({ type: 'status', connected: true, serial: true })
  assert.equal(tele.at(-1).temperature, 50)
  assert.equal(status.serial, true)
  client.close()
})

test('sendCommand sends a command frame when open', () => {
  const registry = { instances: [] }
  const client = createBridgeClient({
    url: 'ws://x',
    WebSocketImpl: FakeWSFactory(registry),
    onTelemetry: () => {},
    onStatus: () => {},
    heartbeatMs: 999999,
  })
  const ws = registry.instances[0]
  ws._open()
  client.sendCommand('setHeat', [true])
  assert.deepEqual(JSON.parse(ws.sent.at(-1)), { type: 'command', name: 'setHeat', args: [true] })
  client.close()
})

test('reconnects after an unexpected close', () => {
  const registry = { instances: [] }
  const client = createBridgeClient({
    url: 'ws://x',
    WebSocketImpl: FakeWSFactory(registry),
    onTelemetry: () => {},
    onStatus: () => {},
    heartbeatMs: 999999,
    reconnectMs: 1,
  })
  registry.instances[0]._open()
  registry.instances[0].onclose() // simulate drop
  return new Promise((res) => setTimeout(() => {
    assert.equal(registry.instances.length, 2)
    client.close()
    res()
  }, 20))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: FAIL — cannot find `../src/lib/bridgeClient.js`.

- [ ] **Step 3: Write `src/lib/bridgeClient.js`**

```js
// Resilient WebSocket client to the laptop bridge. Auto-reconnects, sends a
// periodic heartbeat (keeps the Arduino watchdog satisfied), and routes
// telemetry/status to callbacks. WebSocketImpl is injectable for tests.

export function createBridgeClient({
  url,
  onTelemetry,
  onStatus,
  WebSocketImpl = globalThis.WebSocket,
  heartbeatMs = 2000,
  reconnectMs = 1000,
}) {
  let ws = null
  let hb = null
  let closed = false
  let delay = reconnectMs

  const send = (obj) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
  }

  const connect = () => {
    ws = new WebSocketImpl(url)

    ws.onopen = () => {
      delay = reconnectMs
      hb = setInterval(() => send({ type: 'command', name: 'heartbeat' }), heartbeatMs)
    }

    ws.onmessage = (ev) => {
      let m
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      if (m.type === 'telemetry') onTelemetry(m.data)
      else if (m.type === 'status') onStatus(m)
    }

    ws.onclose = () => {
      clearInterval(hb)
      onStatus({ connected: false, serial: false })
      if (!closed) {
        setTimeout(connect, delay)
        delay = Math.min(delay * 2, 15000)
      }
    }

    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  connect()

  return {
    sendCommand: (name, args) => send({ type: 'command', name, args }),
    close: () => {
      closed = true
      clearInterval(hb)
      if (ws) ws.close()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: PASS (bridgeProtocol + bridgeClient).

- [ ] **Step 5: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add src/lib/bridgeClient.js test/bridgeClient.test.js
git commit -m "feat(ui): resilient WebSocket bridge client with tests"
```

---

### Task 7: UI — wire the bridge into `machineData.jsx`

**Files:**
- Modify: `src/lib/machineData.jsx`

**Interfaces:**
- Consumes: `createBridgeClient` (Task 6), `applyTelemetry`/`deriveTrend` (Task 5).
- Behavior: when **not** `?sim` **and** `VITE_BRIDGE_URL` is set (LIVE mode), temperature/setpoint/heat-enable/fault come from the bridge; `toggleHeat`→`setHeat`, `setSetpoint`→`setSetpoint`, `emergencyStop`→`estop`. Otherwise the full simulator runs unchanged. Other controls stay simulated in both modes.

- [ ] **Step 1: Add imports + `fault` to INITIAL_STATE**

At the top of `src/lib/machineData.jsx`, after the existing React import line, add:

```jsx
import { createBridgeClient } from './bridgeClient'
import { applyTelemetry, deriveTrend } from './bridgeProtocol'
```

In `INITIAL_STATE`, next to `connected: true,` (line ~89), add:

```jsx
  fault: null,
```

- [ ] **Step 2: Add the live-mode flags + refs**

Inside `MachineDataProvider`, right after `stateRef.current = state` (~line 118), add:

```jsx
  // Live mode: temperature/setpoint/heat/fault come from the laptop bridge.
  // Falls back to the full simulator when ?sim is present or no bridge URL is set.
  const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL
  const SIM = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sim')
  const LIVE = !SIM && !!BRIDGE_URL
  const prevTempRef = useRef(null)
  const prevTsRef = useRef(null)
  const bridgeRef = useRef(null)
```

- [ ] **Step 3: Gate the simulator's temperature drift in LIVE mode**

In the MOCK SIMULATOR `useEffect`, replace the temperature block (~lines 141-151):

```jsx
        // Temperature: drift toward target while heat is on, cool slightly when off.
        if (prev.actuators.heat) {
          const drift = (prev.target - prev.temperature) * 0.01 + (Math.random() - 0.5) * 0.15
          next.temperature = +(prev.temperature + drift).toFixed(1)
          next.trend = +clamp(drift * 60, -5, 6).toFixed(1)
        } else {
          next.temperature = +(prev.temperature - 0.15).toFixed(1)
          next.trend = -0.9
        }

        next.chamberTemp = +(next.temperature + 35.8).toFixed(1)
```

with:

```jsx
        // Temperature: in LIVE mode the bridge owns it; only simulate otherwise.
        if (!LIVE) {
          if (prev.actuators.heat) {
            const drift = (prev.target - prev.temperature) * 0.01 + (Math.random() - 0.5) * 0.15
            next.temperature = +(prev.temperature + drift).toFixed(1)
            next.trend = +clamp(drift * 60, -5, 6).toFixed(1)
          } else {
            next.temperature = +(prev.temperature - 0.15).toFixed(1)
            next.trend = -0.9
          }
        }

        next.chamberTemp = +(next.temperature + 35.8).toFixed(1)
```

Then change that effect's dependency array from `}, [])` to `}, [LIVE])` (~line 156).

- [ ] **Step 4: Add the bridge-client effect**

After the temperature-history `useEffect`'s closing `}, [])` (~line 170), add:

```jsx
  // ---- LIVE BRIDGE: telemetry in, commands out ----
  useEffect(() => {
    if (!LIVE) return
    const client = createBridgeClient({
      url: BRIDGE_URL,
      onTelemetry: (data) => {
        setState((prev) => {
          let trend = prev.trend
          if (data.temperature != null) {
            const now = Date.now()
            trend = deriveTrend(prevTempRef.current, data.temperature, prevTsRef.current ? now - prevTsRef.current : 0)
            prevTempRef.current = data.temperature
            prevTsRef.current = now
          }
          return { ...applyTelemetry(prev, data), trend }
        })
      },
      onStatus: (s) => setState((prev) => ({ ...prev, connected: !!s.connected })),
    })
    bridgeRef.current = client
    return () => {
      client.close()
      bridgeRef.current = null
    }
  }, [LIVE, BRIDGE_URL])
```

- [ ] **Step 5: Send commands in `toggleHeat`, `setSetpoint`, `emergencyStop`**

Replace `toggleHeat` (~lines 197-200):

```jsx
  const toggleHeat = useCallback(
    () => setState((p) => ({ ...p, actuators: { ...p.actuators, heat: !p.actuators.heat } })),
    [],
  )
```

with:

```jsx
  const toggleHeat = useCallback(
    () =>
      setState((p) => {
        const heat = !p.actuators.heat
        if (bridgeRef.current) bridgeRef.current.sendCommand('setHeat', [heat])
        return { ...p, actuators: { ...p.actuators, heat } }
      }),
    [],
  )
```

Replace `setSetpoint` (~lines 261-264):

```jsx
  const setSetpoint = useCallback(
    (value) => setState((p) => ({ ...p, setpoint: clamp(Math.round(value), 0, 450) })),
    [],
  )
```

with:

```jsx
  const setSetpoint = useCallback(
    (value) =>
      setState((p) => {
        const setpoint = clamp(Math.round(value), 0, 450)
        if (bridgeRef.current) bridgeRef.current.sendCommand('setSetpoint', [setpoint])
        return { ...p, setpoint }
      }),
    [],
  )
```

Replace `emergencyStop` (~lines 271-281) — add the command, keep the existing local resets:

```jsx
  const emergencyStop = useCallback(
    () =>
      setState((p) => ({
        ...p,
        emergency: true,
        actuators: { vacio: false, heat: false },
        suction: { ...p.suction, running: false, targetSpeed: 0 },
        resistances: p.resistances.map(() => ({ on: false, kw: 0 })),
      })),
    [],
  )
```

with:

```jsx
  const emergencyStop = useCallback(
    () =>
      setState((p) => {
        if (bridgeRef.current) bridgeRef.current.sendCommand('estop')
        return {
          ...p,
          emergency: true,
          actuators: { vacio: false, heat: false },
          suction: { ...p.suction, running: false, targetSpeed: 0 },
          resistances: p.resistances.map(() => ({ on: false, kw: 0 })),
        }
      }),
    [],
  )
```

> Note: the firmware latches e-stop; re-enabling heat (`toggleHeat` → `{"heat":true}`) clears the latch. The existing `clearEmergency` only clears the local banner — that's the intended prototype behavior.

- [ ] **Step 6: Verify the build compiles**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 7: End-to-end manual test against the mock bridge**

Terminal A: `cd bridge && npm start` (`.env` `SERIAL_PORT=mock`).
Terminal B: `cd .. && VITE_BRIDGE_URL=ws://127.0.0.1:8080 npm run dev`.
Open the dev URL (no `?sim`). Expected: temperature is driven by the mock; toggling heat (Monitoreo) + raising the setpoint (Ajustes) makes the temperature climb; the e-stop button drives `fault:"estop"` in telemetry (temperature stops climbing). Append `?sim` → full simulator runs, bridge ignored.

- [ ] **Step 8: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add src/lib/machineData.jsx
git commit -m "feat(ui): drive temperature/setpoint/heat/e-stop from the bridge in live mode"
```

---

### Task 8: Cloudflare Tunnel + Vercel wiring (setup + docs)

**Files:**
- Create: `bridge/README.md`

**Interfaces:** none (operational). Produces a stable `wss://` hostname the Vercel build points at via `VITE_BRIDGE_URL`.

- [ ] **Step 1: Install cloudflared and create the tunnel**

```bash
brew install cloudflared
cloudflared tunnel login          # authorize a domain you control in Cloudflare
cloudflared tunnel create hmi-tostado
```
Expected: a tunnel UUID + credentials file under `~/.cloudflared/`.

- [ ] **Step 2: Route a hostname to the local WebSocket**

```bash
cloudflared tunnel route dns hmi-tostado roaster.<your-domain>
```
Create `~/.cloudflared/config.yml`:

```yaml
tunnel: hmi-tostado
credentials-file: /Users/<you>/.cloudflared/<UUID>.json
ingress:
  - hostname: roaster.<your-domain>
    service: ws://localhost:8080
  - service: http_status:404
```

- [ ] **Step 3: Run the tunnel and verify**

```bash
cloudflared tunnel run hmi-tostado
```
With `bridge` running in mock mode, from any network: `npx wscat -c wss://roaster.<your-domain>` → expect `status` + `telemetry` frames. Confirms cert + tunnel + WebSocket upgrade.

- [ ] **Step 4: Point Vercel at the tunnel**

Vercel project (origendelvalle) → Settings → Environment Variables → add
`VITE_BRIDGE_URL = wss://roaster.<your-domain>` (Production), then redeploy.

- [ ] **Step 5: Write `bridge/README.md`**

````markdown
# HMI Tostado — Bridge

Reads the Arduino's serial telemetry and exposes it to the Vercel UI over a
Cloudflare-tunneled WebSocket; relays UI commands back to the Arduino.

## Run

1. `cp .env.example .env` and set `SERIAL_PORT` (or leave `mock` for no hardware).
2. `npm install`
3. `npm start`                            # bridge on ws://localhost:8080
4. `cloudflared tunnel run hmi-tostado`   # exposes wss://roaster.<domain>

The Vercel UI connects via the `VITE_BRIDGE_URL` env var (set to
`wss://roaster.<domain>` in the Vercel dashboard).

## Protocol
- Telemetry (Arduino→UI): `{"temperature":…,"setpoint":…,"actuators":{"heat":…},"enabled":…,"connected":true,"fault":…}`
- Commands (UI→Arduino): `{"heat":bool}`, `{"setpoint":num}`, `{"estop":true}`, `{"ping":1}`

## Modes
- `SERIAL_PORT=mock` — synthetic closed-loop telemetry, no hardware.
- `SERIAL_PORT=/dev/tty.usbmodemXXXX` — real Arduino.

## Safety
The firmware runs a 5s comms watchdog plus overtemp (260°C), thermocouple-fault,
and e-stop gates that force the SSR off. The UI sends a heartbeat every 2s. A
physical stove cutoff is still required — software is not the only line of defense.
````

- [ ] **Step 6: Final end-to-end test on the tablet**

With bridge (mock) + tunnel running, open `https://origendelvalle.vercel.app` on the Redmi tablet. Expected: live temperature, heat toggle + setpoint drive the mock, e-stop works, connection indicator green.

- [ ] **Step 7: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add bridge/README.md
git commit -m "docs(bridge): Cloudflare Tunnel setup + run instructions"
```

---

### Task 9: Hardware bring-up (real Arduino, manual)

**Files:** none.

- [ ] **Step 1: Connect & configure**

Flash done in Task 1. Plug the Arduino into the laptop, find the port (`ls /dev/tty.usbmodem*` on macOS), set `SERIAL_PORT` in `bridge/.env`, restart `npm start`.

- [ ] **Step 2: Verify real telemetry end-to-end**

With bridge + tunnel running and the tablet on the Vercel URL: confirm the displayed temperature matches the thermocouple (cross-check a reference thermometer). Set a setpoint above ambient and enable heat → confirm the **physical SSR/stove** switches and telemetry `actuators.heat` cycles as temperature approaches setpoint.

- [ ] **Step 3: Verify the watchdog with real hardware (critical safety check)**

Enable heat, then kill the bridge (Ctrl-C). Expected: within ~5 s the firmware sets `fault:"comms"` and the SSR turns the stove **off**. Do not skip.

- [ ] **Step 4: Verify e-stop + overtemp gates**

Press e-stop in the UI → SSR off, `fault:"estop"`; re-enable heat to clear. (Overtemp gate at 260 °C is a firmware ceiling — verify only if safely reachable on the bench.)

- [ ] **Step 5: Validate against the simulation**

Run a short roast; confirm the live curve looks physically plausible. Note any sensor offset for later calibration.

---

## Notes for the implementer

- **Run order:** Tasks 2→7 are pure software, fully testable with the mock (no hardware). Task 1 (flash) any time before Task 9. Tasks 8-9 are operational/manual.
- **No new test framework:** everything uses `node --test`. React rendering is verified manually (Task 7 Step 7); testable logic was extracted into framework-free modules (Tasks 5-6).
- **Protocol is JSON both ways** — matches the provided firmware exactly. The bridge's `buildCommand` is the single translation point from WS command names to serial JSON lines.
