import { Outlet, useLocation } from 'react-router-dom'
import SideNav from './SideNav.jsx'
import BottomNav from './BottomNav.jsx'
import TopNav from './TopNav.jsx'

const TITLES = {
  '/': 'Sistema de Tostado Automatizado',
  '/succion': 'Sistema de Succión',
  '/energia': 'Control Energético',
  '/ajustes': 'Configuración y Calibración',
}

export default function Layout() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Sistema de Tostado Automatizado'

  return (
    <div className="flex h-full w-full bg-background text-on-surface font-body-md">
      <SideNav />
      <main className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
        <TopNav title={title} />
        {/* pb-20 keeps content clear of the mobile bottom nav */}
        <div className="flex-grow overflow-y-auto custom-scrollbar pb-20 md:pb-0">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
