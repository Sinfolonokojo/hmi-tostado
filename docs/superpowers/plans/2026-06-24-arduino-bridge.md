# Arduino ↔ UI Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the real prototype hardware (1 thermocouple input + 1 SSR stove output) to the Vercel-hosted HMI so the UI shows live temperature and the heat button drives the stove, via a laptop bridge tunneled with Cloudflare.

**Architecture:** Arduino emits newline-JSON telemetry over USB serial and accepts compact commands (drives the SSR, has a 5s comms watchdog). A small Node bridge on the laptop reads the serial port, broadcasts telemetry over WebSocket, and relays commands back. Cloudflare Tunnel exposes the WebSocket as a stable `wss://` hostname so the HTTPS Vercel page can connect. The UI's single data hook (`machineData.jsx`) swaps its temperature source + heat toggle to the WebSocket; everything else stays simulated.

**Tech Stack:** Arduino C++ (Adafruit MAX6675 lib), Node.js (serialport, ws), Cloudflare Tunnel (`cloudflared`), React/Vite (existing UI). Tests use Node's built-in `node --test` (no new test framework).

## Global Constraints

- **Serial:** 115200 baud, newline (`\n`) delimited, one JSON object per telemetry line.
- **Telemetry shape (Arduino→bridge):** `{"t":<°C number>,"heat":<0|1>}`.
- **Serial commands (bridge→Arduino):** `H1` heat on, `H0` heat off, `K` heartbeat. Each terminated with `\n`.
- **WebSocket messages:** `{type:"telemetry",data:{t,heat}}` and `{type:"status",connected,serial}` down; `{type:"command",name,args}` up.
- **Watchdog:** Arduino turns the SSR off if no serial line received for 5000 ms.
- **No auth** (prototype).
- **UI changes are confined to `src/lib/`** — existing pages/components are not modified. Non-hardware controls remain simulated.
- **Keep `?sim` mode** working (full simulator, no bridge) for offline dev.
- Node project uses ESM (`"type":"module"`). Match existing 2-space indentation, no semicolons in UI JS (the repo omits them), single quotes.

---

### Task 1: Arduino firmware sketch

**Files:**
- Create: `firmware/hmi_tostado/hmi_tostado.ino`

**Interfaces:**
- Produces (serial contract): emits `{"t":NNN.N,"heat":0|1}\n` every 500 ms; accepts `H1`/`H0`/`K` lines; SSR off after 5 s without any serial line.

> Embedded code can't be unit-tested here; verification is manual via the Arduino IDE Serial Monitor. Prerequisite: install the **"MAX6675 library by Adafruit"** via Library Manager.

- [ ] **Step 1: Write the sketch**

```cpp
#include <max6675.h>

// --- Pin map (adjust to your wiring) ---
const int thermoSO  = 4;   // MAX6675 SO  (data out)
const int thermoCS  = 5;   // MAX6675 CS  (chip select)
const int thermoSCK = 6;   // MAX6675 SCK (clock)
const int ssrPin    = 8;   // SSR control (HIGH = stove ON)

MAX6675 thermocouple(thermoSCK, thermoCS, thermoSO);

bool heat = false;
unsigned long lastTelemetry = 0;
unsigned long lastComms = 0;
const unsigned long TELEMETRY_MS = 500;
const unsigned long WATCHDOG_MS  = 5000;
String inbuf = "";

void applyHeat(bool on) {
  heat = on;
  digitalWrite(ssrPin, heat ? HIGH : LOW);
}

void handleCommand(String cmd) {
  cmd.trim();
  lastComms = millis();          // any valid line = bridge is alive
  if (cmd == "H1") applyHeat(true);
  else if (cmd == "H0") applyHeat(false);
  // "K" is a pure heartbeat: only refreshes lastComms (done above)
}

void setup() {
  pinMode(ssrPin, OUTPUT);
  applyHeat(false);
  Serial.begin(115200);
  lastComms = millis();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handleCommand(inbuf); inbuf = ""; }
    else if (c != '\r') inbuf += c;
  }

  unsigned long now = millis();

  // Safety watchdog: kill the stove if comms went silent.
  if (heat && (now - lastComms > WATCHDOG_MS)) applyHeat(false);

  if (now - lastTelemetry >= TELEMETRY_MS) {
    lastTelemetry = now;
    double t = thermocouple.readCelsius();
    Serial.print("{\"t\":");
    Serial.print(t, 1);
    Serial.print(",\"heat\":");
    Serial.print(heat ? 1 : 0);
    Serial.println("}");
  }
}
```

- [ ] **Step 2: Compile & upload**

In Arduino IDE: select the board + port, click Upload. Expected: "Done uploading" with no compile errors.

- [ ] **Step 3: Verify telemetry (manual)**

Open Serial Monitor at **115200 baud**, line ending **Newline**. Expected: a line like `{"t":24.8,"heat":0}` roughly twice per second.

- [ ] **Step 4: Verify command + watchdog (manual)**

Type `H1` + Enter. Expected: SSR clicks on, telemetry shows `"heat":1`. Type `H0` + Enter → `"heat":0`. Then type `H1` again and **stop typing** for >5 s. Expected: telemetry flips back to `"heat":0` on its own (watchdog tripped).

- [ ] **Step 5: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add firmware/hmi_tostado/hmi_tostado.ino
git commit -m "feat(firmware): thermocouple telemetry + SSR control with watchdog"
```

---

### Task 2: Bridge — protocol module (TDD)

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/src/protocol.js`
- Test: `bridge/test/protocol.test.js`

**Interfaces:**
- Produces: `parseTelemetry(line: string) => {t:number, heat:0|1} | null` and `buildCommand(name: string, args?: any[]) => string | null`.
  - `buildCommand('setHeat',[true])→'H1'`, `[false]→'H0'`, `('heartbeat')→'K'`, unknown→`null`.

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

test('parseTelemetry reads t and heat', () => {
  assert.deepEqual(parseTelemetry('{"t":182.4,"heat":1}'), { t: 182.4, heat: 1 })
})

test('parseTelemetry coerces heat to 0/1', () => {
  assert.deepEqual(parseTelemetry('{"t":20,"heat":0}'), { t: 20, heat: 0 })
})

test('parseTelemetry rejects junk and missing temperature', () => {
  assert.equal(parseTelemetry('not json'), null)
  assert.equal(parseTelemetry('{"heat":1}'), null)
})

test('buildCommand maps setHeat and heartbeat', () => {
  assert.equal(buildCommand('setHeat', [true]), 'H1')
  assert.equal(buildCommand('setHeat', [false]), 'H0')
  assert.equal(buildCommand('heartbeat'), 'K')
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
  if (typeof obj.t !== 'number') return null
  return { t: obj.t, heat: obj.heat ? 1 : 0 }
}

export function buildCommand(name, args = []) {
  switch (name) {
    case 'setHeat':
      return args[0] ? 'H1' : 'H0'
    case 'heartbeat':
      return 'K'
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
git commit -m "feat(bridge): telemetry/command protocol module with tests"
```

---

### Task 3: Bridge — serial link with mock mode (TDD)

**Files:**
- Create: `bridge/src/mockSerial.js`
- Create: `bridge/src/serial.js`
- Test: `bridge/test/mockSerial.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createSerialLink({port,baud}, {onLine, onStatus}) => { write(str), close() }`. When `port === 'mock'`, returns a synthetic source (no hardware) that emits telemetry lines on an interval and reflects `H1`/`H0` writes into its `heat` field. `write` appends `\n` for the real port; mock parses the raw string.

- [ ] **Step 1: Write the failing test**

`bridge/test/mockSerial.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMockSerial } from '../src/mockSerial.js'

test('mock emits telemetry lines and reflects heat commands', () => {
  const lines = []
  let status = null
  const link = createMockSerial({
    onLine: (l) => lines.push(l),
    onStatus: (s) => { status = s },
  })
  assert.equal(status, true) // reports connected immediately

  link.tick() // advance one synthetic step
  const first = JSON.parse(lines.at(-1))
  assert.equal(first.heat, 0)
  assert.equal(typeof first.t, 'number')

  link.write('H1')
  link.tick()
  assert.equal(JSON.parse(lines.at(-1)).heat, 1)

  link.write('H0')
  link.tick()
  assert.equal(JSON.parse(lines.at(-1)).heat, 0)

  link.close()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado/bridge && npm test`
Expected: FAIL — cannot find `../src/mockSerial.js`.

- [ ] **Step 3: Write `bridge/src/mockSerial.js`**

The `tick()` method is exposed so tests can step deterministically; the real interval calls the same function.

```js
export function createMockSerial({ onLine, onStatus }) {
  let heat = 0
  let temp = 22

  const tick = () => {
    const target = heat ? 220 : 22
    temp += (target - temp) * 0.05
    onLine(JSON.stringify({ t: Math.round(temp * 10) / 10, heat }))
  }

  onStatus(true)
  const id = setInterval(tick, 500)

  return {
    tick,
    write: (s) => {
      const cmd = String(s).trim()
      if (cmd === 'H1') heat = 1
      else if (cmd === 'H0') heat = 0
      // 'K' heartbeat: nothing to do in the mock
    },
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
git commit -m "feat(bridge): serial link with deterministic mock mode"
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
- Produces: `startServer({port, serial, getStatus}) => { broadcast(obj), close() }`. Broadcasts JSON to all open clients; on a `{type:'command',name,args}` message it calls `serial.write(buildCommand(...))`.

- [ ] **Step 1: Write the failing test**

`bridge/test/server.test.js` — uses a fake serial link and a real `ws` client:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { startServer } from '../src/server.js'

const PORT = 8137

function fakeSerial() {
  return { writes: [], write(s) { this.writes.push(s) }, close() {} }
}

test('broadcasts telemetry and relays commands to serial', async () => {
  const serial = fakeSerial()
  const server = startServer({ port: PORT, serial, getStatus: () => ({ connected: true, serial: true }) })

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
  const messages = []
  await new Promise((res) => ws.on('open', res))
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

  // client sends a command -> bridge writes to serial
  ws.send(JSON.stringify({ type: 'command', name: 'setHeat', args: [true] }))
  await new Promise((res) => setTimeout(res, 50))
  assert.deepEqual(serial.writes, ['H1'])

  // server broadcast reaches the client
  server.broadcast({ type: 'telemetry', data: { t: 100, heat: 1 } })
  await new Promise((res) => setTimeout(res, 50))
  assert.ok(messages.some((m) => m.type === 'telemetry' && m.data.t === 100))

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
Expected: logs `[bridge] WebSocket on :8080 — serial=mock @ 115200`. In another terminal: `npx wscat -c ws://127.0.0.1:8080` → expect a `status` message then `telemetry` messages ~2/s. Send `{"type":"command","name":"setHeat","args":[true]}` → within ~10s telemetry `t` should start climbing. Ctrl-C both.

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
- Produces: `deriveTrend(prevTemp, newTemp, dtMs) => number` (°/min, clamped ±9.9, 0 if no prev/dt); `applyTelemetry(state, data) => state` (sets `temperature`, `actuators.heat`, `connected:true`, leaves everything else untouched).

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
  // +1°C over 1000ms = 60°/min, clamped to 9.9
  assert.equal(deriveTrend(100, 101, 1000), 9.9)
  // +0.05°C over 1000ms = 3.0°/min
  assert.equal(deriveTrend(100, 100.05, 1000), 3)
})

test('applyTelemetry merges temperature + heat, preserves other state', () => {
  const state = { temperature: 20, trend: 0, actuators: { vacio: true, heat: false }, suction: { speed: 9 }, connected: false }
  const next = applyTelemetry(state, { t: 182.4, heat: 1 })
  assert.equal(next.temperature, 182.4)
  assert.equal(next.actuators.heat, true)
  assert.equal(next.actuators.vacio, true) // untouched
  assert.equal(next.suction.speed, 9) // untouched
  assert.equal(next.connected, true)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: FAIL — cannot find `../src/lib/bridgeProtocol.js`.

- [ ] **Step 4: Write `src/lib/bridgeProtocol.js`**

```js
// Pure helpers for turning bridge telemetry into UI state. Framework-free so
// they can be unit-tested with `node --test`.

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function deriveTrend(prevTemp, newTemp, dtMs) {
  if (prevTemp == null || !dtMs) return 0
  const perMin = ((newTemp - prevTemp) / dtMs) * 60000
  return +clamp(perMin, -9.9, 9.9).toFixed(1)
}

export function applyTelemetry(state, data) {
  return {
    ...state,
    temperature: data.t,
    actuators: { ...state.actuators, heat: !!data.heat },
    connected: true,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm test`
Expected: PASS, 3 tests.

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
- Produces: `createBridgeClient({url, onTelemetry, onStatus, WebSocketImpl?, heartbeatMs?}) => { sendCommand(name, args), close() }`. Auto-reconnects on close with exponential backoff; sends `{type:'command',name:'heartbeat'}` every `heartbeatMs` while open; routes incoming `telemetry`/`status` messages to callbacks. `WebSocketImpl` is injectable for testing (defaults to global `WebSocket`).

- [ ] **Step 1: Write the failing test**

`test/bridgeClient.test.js` — drives a fake WebSocket:

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
  ws._msg({ type: 'telemetry', data: { t: 50, heat: 0 } })
  ws._msg({ type: 'status', connected: true, serial: true })
  assert.deepEqual(tele.at(-1), { t: 50, heat: 0 })
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
    reconnectMs: 1, // fast for the test
  })
  registry.instances[0]._open()
  registry.instances[0].onclose() // simulate drop (not via close())
  return new Promise((res) => setTimeout(() => {
    assert.equal(registry.instances.length, 2) // a new socket was created
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
// periodic heartbeat (so the Arduino watchdog stays satisfied), and routes
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
Expected: PASS (all bridgeProtocol + bridgeClient tests).

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
- Behavior: when **not** in `?sim` mode **and** `VITE_BRIDGE_URL` is set, the temperature + heat come from the bridge and `toggleHeat` sends `setHeat`. Otherwise the existing full simulator runs unchanged. Other controls (suction, resistances, etc.) stay simulated in both modes.

- [ ] **Step 1: Add the live-mode flag near the top of the component**

In `src/lib/machineData.jsx`, inside `MachineDataProvider`, right after `stateRef.current = state` (around line 118), add:

```jsx
  // Live mode: real temperature + heat come from the laptop bridge over WebSocket.
  // Falls back to the full simulator when ?sim is present or no bridge URL is configured.
  const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL
  const SIM = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sim')
  const LIVE = !SIM && !!BRIDGE_URL
  const prevTempRef = useRef(null)
  const prevTsRef = useRef(null)
```

- [ ] **Step 2: Gate the mock simulator so it pauses in live mode**

The temperature drift block in the MOCK SIMULATOR `useEffect` (lines ~141-149) must not fight the real feed. Wrap the temperature portion so it only runs when not live. Change the block that currently reads:

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

to:

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

Then add `LIVE` to that `useEffect`'s dependency array (it is currently `[]` on line ~156): change `}, [])` to `}, [LIVE])`.

- [ ] **Step 3: Add the bridge-client effect**

Immediately after the temperature-history `useEffect` (after its closing `}, [])` around line 170), add a new effect. Add the imports at the top of the file too.

At the top, alongside the existing React import, add:

```jsx
import { createBridgeClient } from './bridgeClient'
import { applyTelemetry, deriveTrend } from './bridgeProtocol'
```

New effect:

```jsx
  // ---- LIVE BRIDGE: real temperature in, heat command out ----
  useEffect(() => {
    if (!LIVE) return
    const client = createBridgeClient({
      url: BRIDGE_URL,
      onTelemetry: (data) => {
        setState((prev) => {
          const now = Date.now()
          const trend = deriveTrend(prevTempRef.current, data.t, prevTsRef.current ? now - prevTsRef.current : 0)
          prevTempRef.current = data.t
          prevTsRef.current = now
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

And add the ref next to `prevTempRef` in Step 1:

```jsx
  const bridgeRef = useRef(null)
```

- [ ] **Step 4: Make `toggleHeat` send the command in live mode**

Replace the existing `toggleHeat` (lines ~197-200):

```jsx
  const toggleHeat = useCallback(
    () => setState((p) => ({ ...p, actuators: { ...p.actuators, heat: !p.actuators.heat } })),
    [],
  )
```

with a version that also tells the bridge (optimistic local update + command; the next telemetry reconciles to the SSR's real state):

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

- [ ] **Step 5: Verify the build compiles**

Run: `cd /Users/Work_tmp/Julian/hmi-tostado && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 6: End-to-end manual test against the mock bridge**

Terminal A: `cd bridge && npm start` (with `.env` `SERIAL_PORT=mock`).
Terminal B: `cd .. && VITE_BRIDGE_URL=ws://127.0.0.1:8080 npm run dev`.
Open the dev URL (no `?sim`). Expected: Monitoreo temperature is driven by the mock (rises after pressing the heat toggle, since the mock heats toward 220°C); the connection indicator shows connected. Open with `?sim` appended → full simulator runs, bridge ignored.

- [ ] **Step 7: Commit**

```bash
cd /Users/Work_tmp/Julian/hmi-tostado
git add src/lib/machineData.jsx
git commit -m "feat(ui): drive temperature + heat from the bridge in live mode"
```

---

### Task 8: Cloudflare Tunnel + Vercel wiring (setup + docs)

**Files:**
- Create: `bridge/README.md`

**Interfaces:** none (operational setup). Produces a stable `wss://` hostname the Vercel build points at via `VITE_BRIDGE_URL`.

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
Then create `~/.cloudflared/config.yml`:

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
With `bridge` running in mock mode, verify from any network: `npx wscat -c wss://roaster.<your-domain>` → expect `status` + `telemetry` frames. This confirms the cert + tunnel + WebSocket upgrade all work.

- [ ] **Step 4: Point Vercel at the tunnel**

In the Vercel project (origendelvalle) → Settings → Environment Variables, add:
`VITE_BRIDGE_URL = wss://roaster.<your-domain>` (Production). Redeploy.

- [ ] **Step 5: Write `bridge/README.md`** documenting the run sequence

````markdown
# HMI Tostado — Bridge

Reads the Arduino's serial telemetry and exposes it to the Vercel UI over a
Cloudflare-tunneled WebSocket; relays UI commands back to the Arduino.

## Run

1. `cp .env.example .env` and set `SERIAL_PORT` (or leave `mock` for no hardware).
2. `npm install`
3. `npm start`                       # bridge on ws://localhost:8080
4. `cloudflared tunnel run hmi-tostado`   # exposes wss://roaster.<domain>

The Vercel UI connects automatically via the `VITE_BRIDGE_URL` env var
(set to `wss://roaster.<domain>` in the Vercel dashboard).

## Modes
- `SERIAL_PORT=mock` — synthetic telemetry, no hardware (dev/testing).
- `SERIAL_PORT=/dev/tty.usbmodemXXXX` — real Arduino.

## Safety
The Arduino runs a 5s watchdog: if serial goes silent it turns the SSR off.
The UI sends a heartbeat every 2s while connected. A physical stove cutoff is
still required — software is not the only line of defense.
````

- [ ] **Step 6: Final end-to-end test on the tablet**

With bridge (mock) + tunnel running, open `https://origendelvalle.vercel.app` on the Redmi tablet. Expected: live temperature updates, heat toggle changes mock temperature direction, connection indicator green.

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

Flash Task 1's sketch, plug the Arduino into the laptop, find the port (`ls /dev/tty.usbmodem*` on macOS), set it in `bridge/.env` (`SERIAL_PORT=/dev/tty.usbmodemXXXX`), restart `npm start`.

- [ ] **Step 2: Verify real telemetry end-to-end**

With bridge + tunnel running and the tablet on the Vercel URL: confirm the displayed temperature matches the thermocouple's real reading (cross-check against a reference thermometer). Press the heat toggle → confirm the **physical SSR/stove** switches and telemetry `heat` reflects it.

- [ ] **Step 3: Verify the watchdog with real hardware**

Turn heat on, then kill the bridge (Ctrl-C in Terminal A). Expected: within ~5s the SSR turns the stove **off** on its own (Arduino watchdog). This is the critical safety check — do not skip.

- [ ] **Step 4: Validate against the simulation**

Run a short roast; confirm the live curve in the UI looks physically plausible vs. the previous simulated curve. Note any sensor offset for later calibration.

---

## Notes for the implementer

- **Run order:** Tasks 2→7 are pure software and fully testable with the mock (no hardware). Task 1 (firmware) can be done any time before Task 9. Tasks 8-9 are operational/manual.
- **No new test framework:** everything uses `node --test`. The UI's React rendering is verified manually (Step 6 of Task 7) — the testable logic was deliberately extracted into framework-free modules (Tasks 5-6).
- **Indentation/style:** the UI JS omits semicolons and uses single quotes; the bridge is a fresh Node project — match the UI style there too for consistency.
