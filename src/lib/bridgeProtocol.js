// Pure helpers turning bridge telemetry into UI state. Framework-free so they
// can be unit-tested with `node --test`.

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function deriveTrend(prevTemp, newTemp, dtMs) {
  if (prevTemp == null || !dtMs) return 0
  const perMin = ((newTemp - prevTemp) / dtMs) * 60000
  return +clamp(perMin, -9.9, 9.9).toFixed(1)
}

export function applyTelemetry(state, data) {
  const next = {
    ...state,
    // setpoint is intentionally NOT merged from telemetry: the slider is
    // cosmetic and UI-owned (prototype scope, 2026-06-24), so the firmware's
    // own setpoint must not clobber what the operator set on screen.
    // The UI's heat toggle reflects the COMMANDED master enable, not the SSR
    // that flickers as the bang-bang controller holds temperature.
    actuators: { ...state.actuators, heat: !!data.enabled },
    fault: data.fault ?? null,
    connected: true,
  }
  if (data.temperature != null) next.temperature = data.temperature
  return next
}
