import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createBridgeClient } from './bridgeClient'
import { applyTelemetry, deriveTrend } from './bridgeProtocol'

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
    product: 'Café', // Café o Cacao
    variety: 'Geisha',
    lot: 'LT-2026-1042',
    origin: 'Finca El Injerto, Huehuetenango',
    owner: 'Cooperativa Origen del Valle',
    roastedKg: 24.5, // kg de tostado
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
  ],
  setpoint: 215, // °C resistance setpoint
  plcStatus: 'OPTIMAL',
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

  // Temperatura vs tiempo — un snapshot por minuto durante el proceso (≈7-10 min).
  // Sembrado con una curva de tostado realista para que el gráfico y la exportación
  // tengan datos de inmediato; luego se agrega un punto en vivo cada 60 s.
  tempHistory: [
    { minute: 0, temperature: 120 },
    { minute: 1, temperature: 138 },
    { minute: 2, temperature: 155 },
    { minute: 3, temperature: 168 },
    { minute: 4, temperature: 178 },
    { minute: 5, temperature: 186 },
    { minute: 6, temperature: 193 },
    { minute: 7, temperature: 200 },
  ],

  // Global
  connected: true,
  fault: null,
  emergency: false,
  roastRunning: false, // ¿proceso de tostado en curso? (botón Iniciar Proceso)
  sessionTime: '00:42:15',
}

// Cadencia real de muestreo del proceso (60 s). Se aísla aquí para poder
// acelerarla en pruebas o reemplazarla por el reloj del Arduino más adelante.
const SNAPSHOT_INTERVAL_MS = 20_000
const MAX_HISTORY = 20

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
  // Seed batch (ficha técnica) from localStorage so manually-entered data
  // survives a page refresh.
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') return INITIAL_STATE
    try {
      const saved = window.localStorage.getItem('hmi.batch')
      if (saved) return { ...INITIAL_STATE, batch: { ...INITIAL_STATE.batch, ...JSON.parse(saved) } }
    } catch {
      /* ignore bad/blocked storage */
    }
    return INITIAL_STATE
  })
  const stateRef = useRef(state)
  stateRef.current = state

  // Live mode: temperature/setpoint/heat/fault come from the laptop bridge.
  // Falls back to the full simulator when ?sim is present or no bridge URL is set.
  // Bridge URL resolution: ?bridge=<wss-url> wins (lets the deployed site point at
  // an ad-hoc tunnel without a rebuild), else the build-time VITE_BRIDGE_URL.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const BRIDGE_URL = params.get('bridge') || import.meta.env.VITE_BRIDGE_URL
  const SIM = params.has('sim')
  const LIVE = !SIM && !!BRIDGE_URL
  const prevTempRef = useRef(null)
  const prevTsRef = useRef(null)
  const bridgeRef = useRef(null)

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

        // Temperature: in LIVE mode the bridge owns it; only simulate otherwise.
        if (!LIVE) {
          if (prev.actuators.heat) {
            const drift = (prev.target - prev.temperature) * 0.01 + (Math.random() - 0.5) * 0.15
            next.temperature = +(prev.temperature + drift).toFixed(1)
            next.trend = +clamp(drift * 60, -5, 6).toFixed(1)
          } else {
            next.temperature = +(prev.temperature - 0.15).toFixed(1)
            next.trend = -0.9
          }
        }

        next.chamberTemp = +(next.temperature + 35.8).toFixed(1)
        return next
      })
    }, 120)
    return () => clearInterval(id)
  }, [LIVE])

  // ---- TEMPERATURE HISTORY: one snapshot every 20 s ----
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        if (!prev.roastRunning) return prev // sólo se registra durante el proceso
        const last = prev.tempHistory[prev.tempHistory.length - 1]
        const minute = (last ? last.minute : -1) + 1
        const entry = { minute, temperature: Math.round(prev.temperature * 10) / 10 }
        return { ...prev, tempHistory: [...prev.tempHistory, entry].slice(-MAX_HISTORY) }
      })
    }, SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // ---- LIVE BRIDGE: telemetry in, commands out ----
  useEffect(() => {
    if (!LIVE) return
    const client = createBridgeClient({
      url: BRIDGE_URL,
      onTelemetry: (data) => {
        setState((prev) => {
          let trend = prev.trend
          if (data.temperature != null) {
            const now = Date.now()
            trend = deriveTrend(prevTempRef.current, data.temperature, prevTsRef.current ? now - prevTsRef.current : 0)
            prevTempRef.current = data.temperature
            prevTsRef.current = now
          }
          return { ...applyTelemetry(prev, data), trend }
        })
      },
      onStatus: (s) => setState((prev) => ({ ...prev, connected: !!(s.connected && s.serial) })),
    })
    bridgeRef.current = client
    return () => {
      client.close()
      bridgeRef.current = null
    }
  }, [LIVE, BRIDGE_URL])

  // ---- COMMANDS (pages call these; later they'd also write to the device) ----

  const resetHistory = useCallback(
    () => setState((p) => ({ ...p, tempHistory: [{ minute: 0, temperature: Math.round(p.temperature * 10) / 10 }] })),
    [],
  )

  // Iniciar Proceso: arranca un nuevo tostado y empieza a registrar desde cero.
  const startRoast = useCallback(
    () =>
      setState((p) => ({
        ...p,
        roastRunning: true,
        actuators: { ...p.actuators, heat: true },
        tempHistory: [{ minute: 0, temperature: Math.round(p.temperature * 10) / 10 }],
      })),
    [],
  )

  const stopRoast = useCallback(() => setState((p) => ({ ...p, roastRunning: false })), [])
  const toggleVacio = useCallback(
    () => setState((p) => ({ ...p, actuators: { ...p.actuators, vacio: !p.actuators.vacio } })),
    [],
  )

  const toggleHeat = useCallback(() => {
    const heat = !stateRef.current.actuators.heat
    if (bridgeRef.current) bridgeRef.current.sendCommand('setHeat', [heat])
    setState((p) => ({ ...p, actuators: { ...p.actuators, heat } }))
  }, [])

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

  // Live: the slider commands the firmware's target temperature (sendCommand).
  // The UI keeps owning the displayed value (we don't merge telemetry setpoint,
  // so the slider doesn't stutter against incoming frames); UI and firmware clamp
  // to the same 0..450 range, so they stay in sync. (Scope updated 2026-06-26.)
  const setSetpoint = useCallback((value) => {
    const setpoint = clamp(Math.round(value), 0, 450)
    if (bridgeRef.current) bridgeRef.current.sendCommand('setSetpoint', [setpoint])
    setState((p) => ({ ...p, setpoint }))
  }, [])

  const allOff = useCallback(
    () => setState((p) => ({ ...p, resistances: p.resistances.map(() => ({ on: false, kw: 0 })) })),
    [],
  )

  const emergencyStop = useCallback(() => {
    if (bridgeRef.current) bridgeRef.current.sendCommand('estop')
    setState((p) => ({
      ...p,
      emergency: true,
      actuators: { vacio: false, heat: false },
      suction: { ...p.suction, running: false, targetSpeed: 0 },
      resistances: p.resistances.map(() => ({ on: false, kw: 0 })),
    }))
  }, [])

  const clearEmergency = useCallback(() => setState((p) => ({ ...p, emergency: false })), [])

  // Ficha técnica: merge manually-entered batch fields and persist them.
  const updateBatch = useCallback(
    (partial) =>
      setState((p) => {
        const batch = { ...p.batch, ...partial }
        try {
          window.localStorage.setItem('hmi.batch', JSON.stringify(batch))
        } catch {
          /* ignore blocked storage */
        }
        return { ...p, batch }
      }),
    [],
  )

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
    resetHistory,
    startRoast,
    stopRoast,
    updateBatch,
  }

  return <MachineDataContext.Provider value={value}>{children}</MachineDataContext.Provider>
}

export function useMachineData() {
  const ctx = useContext(MachineDataContext)
  if (!ctx) throw new Error('useMachineData must be used within a MachineDataProvider')
  return ctx
}
