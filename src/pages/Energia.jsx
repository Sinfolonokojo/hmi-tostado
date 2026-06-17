import { useMachineData, totalConsumption } from '../lib/machineData.jsx'
import Icon from '../components/Icon.jsx'

export default function Energia() {
  const m = useMachineData()
  const total = totalConsumption(m.resistances)

  return (
    <div className="grid-bg min-h-full p-gutter flex flex-col gap-margin">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-md">
        <Summary label="Consumo Total" value={total} unit="kW" accent="text-primary" />
        <Summary label="Temperatura Cámara" value={m.chamberTemp} unit="°C" accent="text-secondary" />
        <Summary label="Eficiencia Térmica" value={m.thermalEfficiency} unit="%" accent="text-tertiary" />
      </div>

      {/* Resistances */}
      <section className="flex-1">
        <div className="flex items-center justify-between mb-stack-md">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">Resistencias Eléctricas</h2>
          <button
            onClick={m.allOff}
            className="bg-secondary-container text-on-secondary-container px-6 py-3 font-bold rounded-lg uppercase tracking-wider text-label-md hover:brightness-110 active:scale-95 transition-all"
          >
            Apagar Todo
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {m.resistances.map((r, i) => (
            <button
              key={i}
              onClick={() => m.toggleResistance(i)}
              className={`text-left p-6 border rounded-lg transition-all duration-300 flex flex-col justify-between h-56 active:scale-[0.98] ${
                r.on
                  ? 'bg-surface-container-high border-secondary/50 active-glow'
                  : 'bg-surface-container border-outline-variant'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-label-md font-label-md text-on-surface-variant mb-1">UNIDAD DE CALOR</span>
                  <span className="text-headline-sm font-headline-sm font-bold text-on-surface">
                    Resistencia {i + 1}
                  </span>
                </div>
                <Icon
                  name={r.on ? 'heat_pump' : 'power_off'}
                  className={`text-3xl ${r.on ? 'text-secondary animate-pulse' : 'text-on-surface-variant'}`}
                />
              </div>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span
                    className={`text-label-md font-label-md font-bold tracking-widest ${
                      r.on ? 'text-secondary' : 'text-on-surface-variant'
                    }`}
                  >
                    {r.on ? 'ON' : 'OFF'}
                  </span>
                  <span className="text-data-mono font-data-mono text-on-surface">
                    {r.kw.toFixed(1)}
                    <span className="text-body-md font-body-md text-on-surface-variant ml-1">kW</span>
                  </span>
                </div>
                <div className="w-14 h-8 bg-surface-container-lowest border border-outline-variant rounded-full p-1 relative">
                  <div
                    className={`w-6 h-6 rounded-full transition-all duration-200 ${
                      r.on ? 'translate-x-6 bg-secondary' : 'bg-outline'
                    }`}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Diagnostic footer */}
      <div className="bg-surface-container border border-outline-variant rounded-lg p-margin mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-surface-container-highest rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="offline_bolt" className="text-tertiary" />
            </div>
            <div>
              <h4 className="text-body-lg font-bold text-on-surface">Modo de Operación: Manual</h4>
              <p className="text-body-md text-on-surface-variant">
                Prioridad de fase equilibrada activada para optimizar consumo.
              </p>
            </div>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button className="flex-1 md:flex-none h-touch-target px-gutter bg-surface-container-high border border-outline-variant text-on-surface font-bold rounded-lg hover:bg-surface-container-highest transition-all active:scale-95">
              Diagnóstico
            </button>
            <button className="flex-1 md:flex-none h-touch-target px-gutter bg-primary text-on-primary font-bold rounded-lg hover:brightness-110 transition-all active:scale-95">
              Auto-optimizar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value, unit, accent }) {
  return (
    <div className="bg-surface-container p-stack-md border border-outline-variant rounded-lg flex flex-col gap-2">
      <span className="text-label-md font-label-md text-on-surface-variant uppercase">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-data-mono font-data-mono ${accent}`}>{value}</span>
        <span className="text-label-md font-label-md text-on-surface-variant">{unit}</span>
      </div>
    </div>
  )
}
