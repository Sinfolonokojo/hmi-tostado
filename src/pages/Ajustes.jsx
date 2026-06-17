import { useMachineData } from '../lib/machineData.jsx'
import Icon from '../components/Icon.jsx'
import Slider from '../components/ui/Slider.jsx'
import StatCard from '../components/ui/StatCard.jsx'

export default function Ajustes() {
  const m = useMachineData()
  const setpointHigh = m.setpoint > 230

  return (
    <div className="grid-bg min-h-full">
      <div className="max-w-[1400px] mx-auto p-margin">
        <div className="mb-10">
          <h2 className="text-display-md font-display-md text-on-surface mb-2">Configuración y Calibración</h2>
          <p className="text-body-lg font-body-lg text-on-surface-variant">
            Ajuste de parámetros críticos para el control de motores y sistemas térmicos.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">
          {/* Motor speeds */}
          <section className="lg:col-span-8">
            <div className="bg-surface-container p-container-padding border border-outline-variant rounded-lg">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-headline-sm font-headline-sm flex items-center gap-3">
                  <Icon name="settings_suggest" className="text-primary" />
                  Velocidades de Motor
                </h3>
                <span className="hidden sm:inline text-label-md font-label-md text-on-surface-variant uppercase tracking-widest">
                  Protocolo V2.4.0
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-margin">
                {m.motors.map((motor, i) => (
                  <div key={i} className="bg-surface-container-low p-stack-md border border-outline-variant rounded-lg">
                    <div className="flex justify-between items-center mb-6">
                      <label className="text-label-md font-label-md text-on-surface-variant uppercase">
                        {motor.label}
                      </label>
                      <span className="text-data-mono font-data-mono text-primary">{motor.speed}%</span>
                    </div>
                    <Slider value={motor.speed} onChange={(v) => m.setMotorSpeed(i, v)} />
                    <div className="flex justify-between mt-4 gap-4">
                      <StepBtn onClick={() => m.setMotorSpeed(i, motor.speed - 1)}>Paso −</StepBtn>
                      <StepBtn onClick={() => m.setMotorSpeed(i, motor.speed + 1)}>Paso +</StepBtn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Thermal setpoint */}
          <section className="lg:col-span-4">
            <div className="bg-surface-container p-container-padding border border-outline-variant rounded-lg h-full">
              <div className="mb-8">
                <h3 className="text-headline-sm font-headline-sm flex items-center gap-3 mb-2">
                  <Icon name="thermostat" className="text-secondary" />
                  Setpoints Térmicos
                </h3>
                <p className="text-label-md font-label-md text-on-surface-variant">
                  Control de temperatura de resistencias
                </p>
              </div>

              <div className="space-y-margin">
                <div className="bg-surface-container-low p-stack-md border border-outline-variant rounded-lg">
                  <div className="flex flex-col gap-4">
                    <label className="text-label-md font-label-md text-on-surface-variant uppercase">
                      Temperatura de Resistencias
                    </label>
                    <div className="flex items-end gap-2">
                      <input
                        type="number"
                        min={0}
                        max={450}
                        value={m.setpoint}
                        onChange={(e) => m.setSetpoint(Number(e.target.value))}
                        className="bg-surface text-data-mono font-data-mono text-secondary w-full border border-outline-variant rounded p-2 focus:border-secondary outline-none"
                      />
                      <span className="text-headline-sm text-on-surface-variant mb-2">°C</span>
                    </div>
                    <Slider value={m.setpoint} min={0} max={450} onChange={m.setSetpoint} className="mt-4" />
                  </div>
                </div>

                {setpointHigh && (
                  <div className="p-stack-md rounded-lg bg-secondary-container/10 border border-secondary/20">
                    <div className="flex gap-4 items-start">
                      <Icon name="error" className="text-secondary" fill />
                      <div>
                        <h4 className="text-label-md font-label-md text-secondary font-bold mb-1">
                          Alerta de Seguridad
                        </h4>
                        <p className="text-label-md font-label-md text-on-surface-variant">
                          El setpoint actual supera el rango de eficiencia óptima. El consumo energético aumentará
                          significativamente.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <button className="w-full py-4 bg-primary text-on-primary font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all text-body-md">
                  Aplicar Cambios
                </button>
                <button
                  onClick={() => m.setSetpoint(215)}
                  className="w-full py-4 border border-outline-variant text-on-surface font-bold rounded-lg hover:bg-surface-container-highest transition-all text-body-md"
                >
                  Recobrar Valores Predeterminados
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Status row */}
        <div className="mt-margin grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
          <StatCard icon="bolt" label="Consumo Total" value={`${m.heatConsumption} kW/h`} accent="text-primary" />
          <StatCard icon="speed" label="RPM Promedio" value={m.rpmAverage.toLocaleString()} accent="text-tertiary" />
          <StatCard icon="update" label="Tiempo Activo" value={m.uptime} accent="text-secondary" />
          <StatCard icon="memory" label="Estado de PLC" value={m.plcStatus} accent="text-on-surface-variant" />
        </div>
      </div>
    </div>
  )
}

function StepBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 bg-surface-container-highest hover:bg-primary-container hover:text-on-primary-container transition-all text-on-surface text-label-md font-label-md rounded border border-outline-variant"
    >
      {children}
    </button>
  )
}
