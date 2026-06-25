import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTrend, applyTelemetry } from '../src/lib/bridgeProtocol.js'

test('deriveTrend returns 0 without a previous reading', () => {
  assert.equal(deriveTrend(null, 100, 500), 0)
})

test('deriveTrend converts °/ms to °/min and clamps', () => {
  assert.equal(deriveTrend(100, 101, 1000), 9.9)   // +60°/min clamped
  assert.equal(deriveTrend(100, 100.05, 1000), 3)  // +3.0°/min
})

test('applyTelemetry merges fields and maps heat from enabled', () => {
  const state = { temperature: 20, setpoint: 100, trend: 0, actuators: { vacio: true, heat: false }, suction: { speed: 9 }, connected: false }
  const data = { temperature: 182.4, setpoint: 220, actuators: { heat: true }, enabled: true, connected: true, fault: null }
  const next = applyTelemetry(state, data)
  assert.equal(next.temperature, 182.4)
  assert.equal(next.setpoint, 100)          // UI-owned/cosmetic: telemetry setpoint is ignored
  assert.equal(next.actuators.heat, true)   // from enabled
  assert.equal(next.actuators.vacio, true)  // untouched
  assert.equal(next.suction.speed, 9)       // untouched
  assert.equal(next.fault, null)
  assert.equal(next.connected, true)
})

test('applyTelemetry maps heat from enabled, not the flickering SSR', () => {
  const state = { actuators: { heat: true }, temperature: 50 }
  const next = applyTelemetry(state, { temperature: 50, enabled: false, actuators: { heat: true }, fault: null })
  assert.equal(next.actuators.heat, false)
})

test('applyTelemetry keeps last temperature on a null reading and surfaces the fault', () => {
  const state = { temperature: 150, actuators: {}, connected: true }
  const next = applyTelemetry(state, { temperature: null, enabled: false, actuators: { heat: false }, fault: 'thermocouple' })
  assert.equal(next.temperature, 150) // unchanged
  assert.equal(next.fault, 'thermocouple')
})
