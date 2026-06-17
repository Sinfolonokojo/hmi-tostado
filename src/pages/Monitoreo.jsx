import { useMachineData } from '../lib/machineData.jsx'
import Icon from '../components/Icon.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Slider from '../components/ui/Slider.jsx'

export default function Monitoreo() {
  const m = useMachineData()
  const heatOn = m.actuators.heat

  return (
    <div className="p-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      {/* Main temperature card */}
      <section
        className={`lg:col-span-8 glass-card p-container-padding flex flex-col justify-between rounded-xl ${
          heatOn ? 'heat-glow' : ''
        }`}
      >
        <div className="flex justify-between items-start">
          <div>
            <span className="text-label-md font-label-md text-outline-variant uppercase">Temperatura Actual</span>
            <h2 className="text-[88px] sm:text-[120px] font-bold leading-none text-on-surface mt-2 font-data-mono">
              {Math.round(m.temperature)}
              <span className="text-primary-fixed-dim">°C</span>
            </h2>
          </div>
          <div className="text-right">
            <span className="text-label-md font-label-md text-outline-variant uppercase">Tendencia</span>
            <div className={`flex items-center gap-1 mt-1 ${m.trend >= 0 ? 'text-secondary' : 'text-primary'}`}>
              <Icon name={m.trend >= 0 ? 'trending_up' : 'trending_down'} />
              <span className="text-headline-sm font-headline-sm">
                {m.trend >= 0 ? '+' : ''}
                {m.trend}°/min
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="h-32 sm:h-40 relative w-full">
            <svg className="w-full h-full opacity-60" viewBox="0 0 400 100" preserveAspectRatio="none">
              <path d="M 0 80 Q 100 20 200 60 T 400 30" fill="none" stroke="#b0c6ff" strokeWidth="4" />
              <path
                d="M 0 80 Q 100 20 200 60 T 400 30"
                fill="none"
                stroke="#d33a01"
                strokeDasharray="240 1000"
                strokeWidth="4"
              />
              <circle cx="240" cy="52" fill="#d33a01" r="6" />
            </svg>
          </div>
          <div className="flex justify-between w-full border-t border-outline-variant/30 pt-4 mt-4">
            <Phase label="Punto de Carga" value={`${m.loadPoint}°C`} />
            <Phase label="Primer Crack" value={`${m.firstCrack}°C`} />
            <Phase label="Objetivo Final" value={`${m.target}°C`} />
          </div>
        </div>
      </section>

      {/* Batch status */}
      <section className="lg:col-span-4 glass-card p-container-padding flex flex-col gap-stack-md rounded-xl">
        <span className="text-label-md font-label-md text-outline-variant uppercase">Estado de Batch</span>
        <div className="flex-grow flex items-center justify-between bg-surface-container rounded-lg px-gutter py-4">
          <div>
            <span className="text-headline-sm font-headline-sm block">{m.batch.name}</span>
            <span className="text-label-md font-label-md text-primary">
              {m.batch.roast} • Batch #{m.batch.id}
            </span>
          </div>
          <Icon name="info" className="text-4xl text-outline-variant" />
        </div>
        <div className="flex gap-stack-sm">
          <MiniStat label="Tiempo" value={m.batch.time} />
          <MiniStat label="Humedad" value={`${m.batch.humidity}%`} />
        </div>
      </section>

      {/* Actuadores */}
      <section className="lg:col-span-4 lg:row-span-2 lg:order-4 glass-card p-container-padding flex flex-col gap-gutter rounded-xl">
        <span className="text-label-md font-label-md text-outline-variant uppercase">Actuadores</span>

        <div className="flex flex-col gap-stack-sm">
          <div className="flex justify-between items-center">
            <label className="text-body-lg font-semibold">Sistema de Vacío</label>
            <span className={`text-label-md font-label-md ${m.actuators.vacio ? 'text-primary' : 'text-outline'}`}>
              {m.actuators.vacio ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <Toggle
            label="Activar Vacío"
            active={m.actuators.vacio}
            onToggle={m.toggleVacio}
            activeColor="bg-primary"
          />
        </div>

        <div className="flex flex-col gap-stack-sm">
          <div className="flex justify-between items-center">
            <label className="text-body-lg font-semibold">Resistencia Eléctrica</label>
            <span className={`text-label-md font-label-md ${heatOn ? 'text-secondary' : 'text-outline'}`}>
              {heatOn ? 'Calentando' : 'Detenido'}
            </span>
          </div>
          <Toggle
            label="Calor"
            activeLabel="Calor Activo"
            inactiveLabel="Activar Calor"
            active={heatOn}
            onToggle={m.toggleHeat}
            activeColor="bg-secondary-container"
          />
        </div>

        <div className="mt-auto flex items-center justify-center p-stack-md bg-secondary-container/10 border border-secondary-container/30 rounded-lg">
          <Icon name="bolt" className="text-secondary mr-2" fill />
          <span className="text-label-md font-label-md text-secondary">CONSUMO: {m.heatConsumption} kW/h</span>
        </div>
      </section>

      {/* Flujo de aire */}
      <section className="lg:col-span-8 glass-card p-container-padding flex flex-col gap-stack-md rounded-xl">
        <div className="flex justify-between items-center">
          <span className="text-label-md font-label-md text-outline-variant uppercase">Flujo de Aire</span>
          <div className="flex items-center gap-gutter">
            <div className="flex flex-col items-end">
              <span className="text-xs text-outline">Caudal de Viento</span>
              <span className="text-headline-sm font-data-mono text-primary">{m.airflow.percent}%</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-outline">RPM Motor</span>
              <span className="text-headline-sm font-data-mono">{m.airflow.rpm}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-margin flex-grow">
          <StepButton onClick={() => m.setFan(m.airflow.percent - 5)}>-</StepButton>
          <div className="flex-grow px-2">
            <Slider value={m.airflow.percent} onChange={m.setFan} />
            <div className="flex justify-between mt-4 px-1 text-xs text-outline">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
          <StepButton onClick={() => m.setFan(m.airflow.percent + 5)}>+</StepButton>
        </div>
      </section>
    </div>
  )
}

function Phase({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-outline uppercase">{label}</span>
      <span className="font-data-mono text-lg sm:text-xl">{value}</span>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="flex-1 bg-surface-container rounded-lg p-stack-md text-center">
      <span className="text-xs text-outline block mb-1 uppercase">{label}</span>
      <span className="text-headline-sm font-data-mono">{value}</span>
    </div>
  )
}

function StepButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center bg-surface-container-highest border border-outline-variant rounded-xl active:scale-90 transition-all text-3xl sm:text-4xl font-bold flex-shrink-0"
    >
      {children}
    </button>
  )
}
