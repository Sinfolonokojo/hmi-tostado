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
