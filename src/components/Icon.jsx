/** Material Symbols Outlined icon. `fill` renders the filled variant. */
export default function Icon({ name, className = '', fill = false, style }) {
  return (
    <span className={`material-symbols-outlined${fill ? ' fill' : ''} ${className}`} style={style}>
      {name}
    </span>
  )
}
