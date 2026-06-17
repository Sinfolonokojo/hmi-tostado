import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'
import { NAV_ITEMS } from './navItems.js'
import { useMachineData } from '../lib/machineData.jsx'

/** Fixed left rail — shown on md+ screens. */
export default function SideNav() {
  const { emergency, emergencyStop, clearEmergency } = useMachineData()

  return (
    <nav className="hidden md:flex flex-col items-center py-stack-md h-full bg-surface-container-low border-r border-outline-variant w-20 flex-shrink-0">
      <div className="mb-10 text-center">
        <div className="w-10 h-10 mx-auto bg-primary rounded-lg flex items-center justify-center mb-1">
          <Icon name="coffee_maker" className="text-on-primary" />
        </div>
        <div className="text-label-md font-label-md font-bold text-primary">HMI</div>
        <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">V2.4.0</div>
      </div>

      <div className="flex flex-col gap-stack-md flex-grow">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              `w-14 h-14 flex flex-col items-center justify-center rounded-lg transition-all active:scale-95 ${
                isActive
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-highest'
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
      </div>

      <button
        onClick={emergency ? clearEmergency : emergencyStop}
        title={emergency ? 'Reanudar' : 'Paro de emergencia'}
        className={`mt-auto w-14 h-14 flex flex-col items-center justify-center rounded-lg transition-all active:scale-95 ${
          emergency
            ? 'bg-error-container text-on-error-container'
            : 'text-error hover:bg-error-container/20'
        }`}
      >
        <Icon name={emergency ? 'restart_alt' : 'emergency_home'} fill />
        <span className="text-[10px] mt-0.5">{emergency ? 'Reanudar' : 'Paro'}</span>
      </button>
    </nav>
  )
}
