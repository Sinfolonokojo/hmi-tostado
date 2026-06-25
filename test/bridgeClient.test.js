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
