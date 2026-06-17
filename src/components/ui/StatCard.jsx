import Icon from '../Icon.jsx'

/** Compact metric tile: icon + label + mono value. */
export default function StatCard({ icon, label, value, unit, accent = 'text-primary' }) {
  return (
    <div className="bg-surface-container p-stack-md border border-outline-variant rounded-lg flex items-center gap-4">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0">
          <Icon name={icon} className={accent} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-label-md font-label-md text-on-surface-variant truncate">{label}</p>
        <p className="text-body-lg font-data-mono">
          {value}
          {unit && <span className="text-on-surface-variant text-base ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  )
}
