import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'
import { NAV_ITEMS } from './navItems.js'
import { useMachineData } from '../lib/machineData.jsx'

/** Bottom tab bar — shown on small screens (md:hidden). */
export default function BottomNav() {
  const { emergency, emergencyStop, clearEmergency } = useMachineData()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex justify-around items-center z-50">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full transition-colors ${
              isActive ? 'text-primary' : 'text-on-surface-variant'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} fill={isActive} />
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button
        onClick={emergency ? clearEmergency : emergencyStop}
        className={`flex flex-col items-center justify-center w-full h-full ${
          emergency ? 'text-on-error-container' : 'text-error'
        }`}
      >
        <Icon name={emergency ? 'restart_alt' : 'emergency_home'} fill />
        <span className="text-[10px] mt-0.5">{emergency ? 'Reanudar' : 'Paro'}</span>
      </button>
    </nav>
  )
}
