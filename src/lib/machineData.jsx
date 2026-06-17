import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

/**
 * Single source of truth for the whole machine.
 *
 * Today this is backed by a MOCK SIMULATOR (porting the JS from the Stitch mockups).
 * Later, the hardware feed (Arduino UNO over Web Serial, or a serial->WebSocket bridge)
 * will replace `runSimulation` below by writing the SAME state shape. Because every page
 * and component reads/writes only through `useMachineData()`, swapping the source touches
 * just this file.
 *
 * Expected Arduino line protocol (future): one JSON object per line, e.g.
 *   {"temperature":180.4,"airflow":{"rpm":1450},"suction":{"speed":45},...}
 * A SerialProvider would parse each line and merge it into state with `setState`.
 */

const MachineDataContext = createContext(null)

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const INITIAL_STATE = {
  // Monitoreo
  temperature: 180, // °C (current chamber temp)
  trend: 2.4, // °/min
  loadPoint: 165,
  firstCrack: 192,
  target: 215,
  batch: {
    name: 'Guatemala Antigua',
    roast: 'Tueste Medio',
    id: '1042',
    time: '08:42',
    humidity: 11.2,
  },
  actuators: {
    vacio: false,
    heat: true,
  },
  airflow: {
    percent: 65,
    rpm: 1450,
  },
  heatConsumption: 4.2, // kW/h (Monitoreo card)

  // Succión
  suction: {
    running: false,
    targetSpeed: 0, // 0-100 commanded
    speed: 0, // 0-100 actual (interpolated)
    vibration: 5, // %
  },

  // Ajustes
  motors: [
    { label: 'Motor 01 · Tambor', speed: 45 },
    { label: 'Motor 02 · Ventilador', speed: 62 },
    { label: 'Motor 03 · Enfriador', speed: 15 },
    { label: 'Motor 04 · Agitador', speed: 80 },
  ],
  setpoint: 215, // °C resistance setpoint
  plcStatus: 'OPTIMAL',
  rpmAverage: 1450,
  uptime: '08:24:12',

  // Energía
  resistances: [
    { on: true, kw: 3.2 },
    { on: true, kw: 3.1 },
    { on: false, kw: 0 },
    { on: false, kw: 0 },
  ],
  chamberTemp: 215.8,
  thermalEfficiency: 94.2,

  // Global
  connected: true,
  emergency: false,
  sessionTime: '00:42:15',
}

// Derived suction metrics from the actual speed (ported from the mockup math).
export function suctionMetrics(speed) {
  return {
    velocity: +(speed * 0.45).toFixed(1), // m/s
    efficiency: Math.round(speed * 0.95), // %
    frequency: +(speed * 0.6).toFixed(1), // Hz
    pressure: +(speed * 0.12).toFixed(1), // hPa
  }
}

// Total live consumption across active resistances + base draw (Energía summary).
export function totalConsumption(resistances) {
  return +resistances.reduce((sum, r) => sum + (r.on ? r.kw : 0), 0).toFixed(1)
}

export function MachineDataProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  // ---- MOCK SIMULATOR (replace with hardware feed later) ----
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const next = { ...prev }

        // Suction: interpolate actual speed toward commanded target.
        const s = prev.suction
        const speed = s.speed + (s.targetSpeed - s.speed) * 0.12
        const vibration = s.running ? 10 + Math.random() * (speed / 2) : 5
        next.suction = {
          ...s,
          speed: Math.abs(speed - s.targetSpeed) < 0.1 ? s.targetSpeed : +speed.toFixed(2),
          vibration: +vibration.toFixed(1),
        }

        // Resistances: small kW fluctuation while ON.
        next.resistances = prev.resistances.map((r) =>
          r.on ? { ...r, kw: +clamp(r.kw + (Math.random() - 0.5) * 0.1, 2.8, 3.6).toFixed(1) } : r,
        )

        // Temperature: drift toward target while heat is on, cool slightly when off.
        if (prev.actuators.heat) {
          const drift = (prev.target - prev.temperature) * 0.01 + (Math.random() - 0.5) * 0.15
          next.temperature = +(prev.temperature + drift).toFixed(1)
          next.trend = +clamp(drift * 60, -5, 6).toFixed(1)
        } else {
          next.temperature = +(prev.temperature - 0.15).toFixed(1)
          next.trend = -0.9
        }

        next.chamberTemp = +(next.temperature + 35.8).toFixed(1)
        return next
      })
    }, 120)
    return () => clearInterval(id)
  }, [])

  // ---- COMMANDS (pages call these; later they'd also write to the device) ----
  const toggleVacio = useCallback(
    () => setState((p) => ({ ...p, actuators: { ...p.actuators, vacio: !p.actuators.vacio } })),
    [],
  )

  const toggleHeat = useCallback(
    () => setState((p) => ({ ...p, actuators: { ...p.actuators, heat: !p.actuators.heat } })),
    [],
  )

  const setFan = useCallback(
    (percent) =>
      setState((p) => ({
        ...p,
        airflow: { ...p.airflow, percent: clamp(Math.round(percent), 0, 100) },
      })),
    [],
  )

  const toggleSuction = useCallback(
    () =>
      setState((p) => {
        const running = !p.suction.running
        return {
          ...p,
          suction: {
            ...p.suction,
            running,
            // Spin up to a default if starting from rest, else stop.
            targetSpeed: running ? (p.suction.targetSpeed === 0 ? 45 : p.suction.targetSpeed) : 0,
          },
        }
      }),
    [],
  )

  const setSuctionSpeed = useCallback(
    (value) =>
      setState((p) => ({
        ...p,
        suction: {
          ...p.suction,
          targetSpeed: clamp(Math.round(value), 0, 100),
          running: value > 0 ? true : p.suction.running,
        },
      })),
    [],
  )

  const setMotorSpeed = useCallback(
    (index, value) =>
      setState((p) => ({
        ...p,
        motors: p.motors.map((m, i) => (i === index ? { ...m, speed: clamp(Math.round(value), 0, 100) } : m)),
      })),
    [],
  )

  const toggleResistance = useCallback(
    (index) =>
      setState((p) => ({
        ...p,
        resistances: p.resistances.map((r, i) =>
          i === index ? { on: !r.on, kw: !r.on ? +(3.1 + Math.random() * 0.2).toFixed(1) : 0 } : r,
        ),
      })),
    [],
  )

  const setSetpoint = useCallback(
    (value) => setState((p) => ({ ...p, setpoint: clamp(Math.round(value), 0, 450) })),
    [],
  )

  const allOff = useCallback(
    () => setState((p) => ({ ...p, resistances: p.resistances.map(() => ({ on: false, kw: 0 })) })),
    [],
  )

  const emergencyStop = useCallback(
    () =>
      setState((p) => ({
        ...p,
        emergency: true,
        actuators: { vacio: false, heat: false },
        suction: { ...p.suction, running: false, targetSpeed: 0 },
        resistances: p.resistances.map(() => ({ on: false, kw: 0 })),
      })),
    [],
  )

  const clearEmergency = useCallback(() => setState((p) => ({ ...p, emergency: false })), [])

  const value = {
    ...state,
    toggleVacio,
    toggleHeat,
    setFan,
    toggleSuction,
    setSuctionSpeed,
    setMotorSpeed,
    toggleResistance,
    setSetpoint,
    allOff,
    emergencyStop,
    clearEmergency,
  }

  return <MachineDataContext.Provider value={value}>{children}</MachineDataContext.Provider>
}

export function useMachineData() {
  const ctx = useContext(MachineDataContext)
  if (!ctx) throw new Error('useMachineData must be used within a MachineDataProvider')
  return ctx
}
