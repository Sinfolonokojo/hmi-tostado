export function parseTelemetry(line) {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  if (!('temperature' in obj)) return null
  return obj
}

export function buildCommand(name, args = []) {
  switch (name) {
    case 'setHeat':
      return JSON.stringify({ heat: !!args[0] })
    case 'setSetpoint':
      return JSON.stringify({ setpoint: Number(args[0]) })
    case 'estop':
      return JSON.stringify({ estop: true })
    case 'heartbeat':
      return JSON.stringify({ ping: 1 })
    default:
      return null
  }
}
