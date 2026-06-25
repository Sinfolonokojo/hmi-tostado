// Synthetic stand-in for the Arduino: emulates the firmware's closed-loop
// bang-bang controller so the bridge + UI can run with no hardware. tick() is
// exposed for deterministic tests; the real interval calls the same function.
export function createMockSerial({ onLine, onStatus }) {
  let enabled = false
  let setpoint = 215
  let estop = false
  let temp = 22
  let ssr = false

  const tick = () => {
    if (!enabled || estop) ssr = false
    else if (!ssr && temp <= setpoint - 2) ssr = true
    else if (ssr && temp >= setpoint) ssr = false

    const target = ssr ? setpoint + 30 : 22
    temp += (target - temp) * 0.05

    onLine(JSON.stringify({
      temperature: Math.round(temp * 10) / 10,
      setpoint,
      actuators: { heat: ssr },
      enabled,
      connected: true,
      fault: estop ? 'estop' : null,
    }))
  }

  const apply = (line) => {
    let m
    try {
      m = JSON.parse(line)
    } catch {
      return
    }
    if (m.heat != null) {
      enabled = !!m.heat
      if (enabled) estop = false
    }
    if (m.setpoint != null) setpoint = Number(m.setpoint)
    if (m.estop) {
      estop = true
      enabled = false
    }
    // {"ping"} needs no handling in the mock
  }

  onStatus(true)
  const id = setInterval(tick, 500)

  return {
    tick,
    write: (s) => apply(String(s).trim()),
    close: () => clearInterval(id),
  }
}
