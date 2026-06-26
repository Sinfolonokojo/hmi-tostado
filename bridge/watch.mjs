import { WebSocket } from 'ws'
const ws = new WebSocket('ws://127.0.0.1:8080')
let last = null
ws.on('open', () => console.log('watching… (temp | setpoint | SSR | enabled | fault)'))
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString())
  if (m.type !== 'telemetry') return
  const d = m.data
  const line = `${d.temperature}°C | set=${d.setpoint} | SSR=${d.actuators.heat ? 'ON ' : 'off'} | en=${d.enabled} | ${d.fault ?? 'ok'}`
  if (line !== last) { console.log(line); last = line }
})
