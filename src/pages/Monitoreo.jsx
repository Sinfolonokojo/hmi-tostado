import { useMachineData } from '../lib/machineData.jsx'
import Icon from '../components/Icon.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Slider from '../components/ui/Slider.jsx'
import ExportMenu from '../components/ui/ExportMenu.jsx'
import TempChart from '../components/ui/TempChart.jsx'
import { exportFichaCSV, exportFichaXLSX } from '../lib/exportFicha.js'

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

        <div className="flex-grow min-h-[220px] sm:min-h-[280px] w-full my-stack-md">
          <TempChart data={m.tempHistory} target={m.target} firstCrack={m.firstCrack} />
        </div>

        <div className="flex justify-between w-full border-t border-outline-variant/30 pt-4">
          <Phase label="Punto de Carga" value={`${m.loadPoint}°C`} />
          <Phase label="Primer Crack" value={`${m.firstCrack}°C`} />
          <Phase label="Objetivo Final" value={`${m.target}°C`} />
        </div>
      </section>

      {/* Ficha técnica */}
      <section className="lg:col-span-4 glass-card p-container-padding flex flex-col gap-stack-md rounded-xl">
        <div className="flex items-center justify-between">
          <span className="text-label-md font-label-md text-outline-variant uppercase">Ficha Técnica</span>
          <ExportMenu
            onCsv={() => exportFichaCSV(m.batch, m.tempHistory)}
            onXlsx={() => exportFichaXLSX(m.batch, m.tempHistory)}
          />
        </div>

        {/* Variedad + producto */}
        <div className="flex items-center gap-4 bg-surface-container rounded-lg px-gutter py-4">
          <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0">
            <Icon name={m.batch.product === 'Cacao' ? 'eco' : 'coffee'} className="text-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-headline-sm font-headline-sm block truncate">{m.batch.variety}</span>
            <span className="text-label-md font-label-md text-primary">{m.batch.product}</span>
          </div>
        </div>

        {/* Datos del lote */}
        <div className="flex flex-col divide-y divide-outline-variant/30">
          <SpecRow icon="tag" label="Lote" value={m.batch.lot} />
          <SpecRow icon="location_on" label="Origen" value={m.batch.origin} />
          <SpecRow icon="person" label="Propietario" value={m.batch.owner} />
        </div>

        {/* KG de tostado */}
        <div className="mt-auto flex items-center justify-between bg-surface-container rounded-lg px-gutter py-3">
          <span className="text-label-md font-label-md text-outline-variant uppercase">KG de Tostado</span>
          <span className="text-headline-sm font-data-mono text-on-surface">
            {m.batch.roastedKg}
            <span className="text-base text-outline-variant ml-1">kg</span>
          </span>
        </div>
      </section>

      {/* Actuadores */}
      <section className="lg:col-span-4 lg:row-span-2 lg:order-4 glass-card p-container-padding flex flex-col gap-gutter rounded-xl">
        <span className="text-label-md font-label-md text-outline-variant uppercase">Actuadores</span>

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

function SpecRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon name={icon} className="text-outline-variant text-xl flex-shrink-0" />
      <span className="text-label-md font-label-md text-outline-variant uppercase flex-shrink-0">{label}</span>
      <span className="text-body-md text-on-surface text-right ml-auto truncate">{value}</span>
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
