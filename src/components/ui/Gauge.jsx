/**
 * Semicircular flow gauge (Succión). `value` 0..max maps to the arc fill.
 * The arc path length is ~440 (matches the mockup's stroke-dasharray).
 */
const ARC_LENGTH = 440

export default function Gauge({ value, max = 100, readout, unit }) {
  const ratio = Math.max(0, Math.min(1, value / max))
  const offset = ARC_LENGTH - ratio * ARC_LENGTH

  return (
    <div className="relative w-[320px] max-w-full h-[160px] overflow-hidden">
      <svg className="w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
        <path className="gauge-background" d="M20,90 A80,80 0 0,1 180,90" />
        <path className="gauge-value" d="M20,90 A80,80 0 0,1 180,90" style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
        <div className="text-display-lg font-data-mono text-on-surface leading-none">{readout}</div>
        <div className="text-headline-sm font-label-md text-primary opacity-80">{unit}</div>
      </div>
    </div>
  )
}
