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
