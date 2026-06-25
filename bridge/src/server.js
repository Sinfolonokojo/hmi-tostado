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
