import Icon from './Icon.jsx'
import { useMachineData } from '../lib/machineData.jsx'

/** Shared top bar. `title` is provided per-page. */
export default function TopNav({ title }) {
  const { connected, sessionTime, emergency } = useMachineData()

  return (
    <header className="flex justify-between items-center h-16 px-gutter w-full bg-surface border-b border-outline-variant flex-shrink-0">
      <h1 className="text-headline-sm font-headline-sm font-bold text-on-surface truncate">{title}</h1>

      <div className="flex items-center gap-stack-md">
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
