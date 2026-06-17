import { useMachineData, suctionMetrics } from '../lib/machineData.jsx'
import Icon from '../components/Icon.jsx'
import Slider from '../components/ui/Slider.jsx'
import Gauge from '../components/ui/Gauge.jsx'

export default function Succion() {
  const m = useMachineData()
  const s = m.suction
  const metrics = suctionMetrics(s.speed)

  return (
    <div className="max-w-6xl mx-auto p-margin space-y-margin">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="text-display-md font-display-md text-on-surface mb-1 uppercase tracking-tight">
            Sistema de Succión
          </h2>
          <p className="text-body-md text-on-surface-variant max-w-xl">
            Gestión de flujo de aire y control de presión para el enfriamiento y transporte de grano.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-label-md font-label-md text-outline">Estado del Motor</span>
          <div className={`font-bold text-lg ${s.running ? 'text-tertiary pulse-text' : 'text-on-surface'}`}>
            {s.running ? 'Activo' : 'En Espera'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Power toggle */}
        <div className="lg:col-span-4 bg-surface-container rounded-xl border border-outline-variant p-container-padding flex flex-col justify-between items-center min-h-[360px]">
          <div className="w-full text-left">
            <span className="text-label-md font-label-md text-outline uppercase">Control de Potencia</span>
          </div>
          <button
            onClick={m.toggleSuction}
            className={`w-44 h-44 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-300 active:scale-95 ${
              s.running
                ? 'bg-primary-container border-primary text-on-primary-container toggle-active'
                : 'bg-surface-container-high border-outline-variant text-outline hover:border-primary'
            }`}
          >
            <Icon name="power_settings_new" className="text-5xl" />
            <span className="mt-2 text-label-md font-label-md font-bold">{s.running ? 'Apagar' : 'Encender'}</span>
          </button>
          <div className="w-full flex justify-between items-center pt-4 border-t border-outline-variant/30">
            <span className="text-label-md font-label-md text-on-surface-variant">Protección Térmica</span>
            <span className="px-2 py-0.5 bg-tertiary/20 text-tertiary rounded text-[10px] font-bold">ACTIVA</span>
          </div>
        </div>

        {/* Gauge */}
        <div className="lg:col-span-8 bg-surface-container rounded-xl border border-outline-variant p-container-padding flex flex-col items-center justify-center relative min-h-[360px]">
          <div className="absolute top-container-padding left-container-padding">
            <span className="text-label-md font-label-md text-outline uppercase">
              Indicador de Velocidad del Caudal
            </span>
          </div>
          <div className="mt-8 flex flex-col items-center">
            <Gauge value={s.speed} max={100} readout={metrics.velocity.toFixed(1)} unit="m/s" />
            <div className="w-full max-w-[280px] flex justify-between px-2 mt-2 text-label-md font-label-md text-outline">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span className="text-error">MAX</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full mt-10 pt-6 border-t border-outline-variant/30">
            <Metric label="Rendimiento" value={`${metrics.efficiency}%`} />
            <Metric label="Frecuencia" value={`${metrics.frequency} Hz`} border />
            <Metric label="Presión" value={`${metrics.pressure} hPa`} />
          </div>
        </div>
      </div>

      {/* Secondary controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-container-padding">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-label-md font-label-md text-on-surface uppercase font-bold tracking-wider">
              Ajuste de Velocidad Manual
            </h3>
            <span className="text-headline-sm font-data-mono text-primary">{s.targetSpeed}%</span>
          </div>
          <Slider value={s.targetSpeed} onChange={m.setSuctionSpeed} className="mb-4" />
          <div className="flex justify-between text-label-md font-label-md text-outline uppercase">
            <span>Mínimo</span>
            <span>Óptimo (75%)</span>
            <span>Crítico</span>
          </div>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-container-padding flex gap-6 items-center">
          <div className="w-24 h-24 bg-surface-container-high rounded-lg flex items-center justify-center border border-outline-variant flex-shrink-0">
            <div
              className="w-16 h-16 border-4 border-outline-variant border-t-primary rounded-full"
              style={{
                animation: s.running ? `spin ${Math.max(0.3, 2 - s.speed / 60)}s linear infinite` : 'none',
                opacity: 0.3 + s.speed / 100,
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-label-md font-label-md text-on-surface uppercase font-bold mb-2">
              Vibración del Sistema
            </h3>
            <div className="w-full h-8 bg-surface-container-highest rounded flex items-end gap-0.5 p-1 overflow-hidden">
              {[20, 25, 15, 30, 40, 35, 20, 45, 30, 15, 25].map((h, i) => (
                <div key={i} className="flex-1 bg-tertiary/40" style={{ height: `${h}%` }} />
              ))}
              <div className="flex-1 bg-tertiary transition-all duration-200" style={{ height: `${s.vibration}%` }} />
            </div>
            <p className="text-[10px] text-outline mt-2 uppercase">
              Sensor de aceleración: {s.vibration > 35 ? 'ELEVADO' : 'ESTABLE'}
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Metric({ label, value, border }) {
  return (
    <div className={`text-center ${border ? 'border-x border-outline-variant/30' : ''}`}>
      <div className="text-label-md font-label-md text-on-surface-variant mb-1">{label}</div>
      <div className="text-headline-sm font-data-mono text-on-surface">{value}</div>
    </div>
  )
}
