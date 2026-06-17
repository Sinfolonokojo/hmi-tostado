/** Large touch-friendly switch row used by the actuator controls. */
export default function Toggle({ label, active, onToggle, activeColor = 'bg-primary', activeLabel, inactiveLabel }) {
  return (
    <button
      onClick={onToggle}
      className={`h-20 w-full rounded-xl bg-surface-container-high border flex items-center px-gutter transition-all active:scale-95 ${
        active ? 'border-primary toggle-active' : 'border-outline-variant'
      }`}
    >
      <div className={`w-12 h-6 rounded-full p-1 transition-colors ${active ? activeColor : 'bg-outline-variant'}`}>
        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${active ? 'translate-x-6' : ''}`} />
      </div>
      <span
        className={`ml-4 font-bold uppercase tracking-widest text-left ${
          active ? 'text-on-surface' : 'text-on-surface-variant'
        }`}
      >
        {active ? activeLabel ?? label : inactiveLabel ?? label}
      </span>
    </button>
  )
}
