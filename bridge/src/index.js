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
