import Icon from './Icon.jsx'
import { useMachineData } from '../lib/machineData.jsx'

/** Shared top bar. `title` is provided per-page. */
export default function TopNav({ title }) {
  const { connected, sessionTime, emergency, roastRunning, startRoast, stopRoast } = useMachineData()

  return (
    <header className="flex justify-between items-center h-16 px-gutter w-full bg-surface border-b border-outline-variant flex-shrink-0 gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="hidden sm:block text-headline-sm font-headline-sm font-bold text-on-surface truncate">{title}</h1>

        <button
          onClick={roastRunning ? stopRoast : startRoast}
          className={`px-4 sm:px-6 py-2 rounded-full font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg flex-shrink-0 ${
            roastRunning
              ? 'bg-secondary-container text-on-secondary-container shadow-secondary-container/20'
              : 'bg-tertiary text-on-tertiary shadow-tertiary/20'
          }`}
        >
          <Icon name={roastRunning ? 'stop' : 'play_arrow'} fill className="text-xl" />
          <span className="text-label-md font-label-md">{roastRunning ? 'Detener' : 'Iniciar Proceso'}</span>
        </button>
      </div>

      <div className="flex items-center gap-stack-md flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-surface-container-high rounded-full">
          <Icon name="timer" className="text-primary text-sm" />
          <span className="text-label-md font-label-md text-on-surface">{sessionTime}</span>
        </div>

        {emergency ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-error-container/30 border border-error/40 rounded-full">
            <span className="w-2.5 h-2.5 bg-error rounded-full" />
            <span className="text-label-md font-label-md text-error uppercase tracking-widest">Paro</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 bg-tertiary-container/20 border border-tertiary/30 rounded-full">
            <span className={`w-2.5 h-2.5 bg-tertiary rounded-full ${connected ? 'pulse-led' : ''}`} />
            <span className="text-label-md font-label-md text-tertiary uppercase tracking-widest">
              {connected ? 'Conectado' : 'Sin señal'}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
