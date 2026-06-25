// One-off: connect to the bridge, print a few telemetry frames, then exit.
// Run: node smoke-client.mjs  (uses the ws dep already in node_modules)
import { WebSocket } from 'ws'

const url = process.env.URL || 'ws://127.0.0.1:8080'
const ws = new WebSocket(url)
let n = 0

ws.on('open', () => console.log(`connected to ${url}`))
ws.on('message', (raw) => {
  console.log(raw.toString())
  if (++n >= 4) { ws.close(); process.exit(0) }
})
ws.on('error', (e) => { console.error('error:', e.message); process.exit(1) })
setTimeout(() => { console.error('timeout: no frames'); process.exit(1) }, 5000)
