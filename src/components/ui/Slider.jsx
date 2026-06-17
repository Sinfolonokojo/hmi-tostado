/** Styled range input (uses the .hmi-range CSS from index.css). */
export default function Slider({ value, min = 0, max = 100, step = 1, onChange, className = '' }) {
  return (
    <input
      type="range"
      className={`hmi-range ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
