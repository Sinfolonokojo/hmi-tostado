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
