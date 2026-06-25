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
