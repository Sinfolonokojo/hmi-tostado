import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Monitoreo from './pages/Monitoreo.jsx'
import Succion from './pages/Succion.jsx'
import Energia from './pages/Energia.jsx'
import Ajustes from './pages/Ajustes.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Monitoreo />} />
        <Route path="/succion" element={<Succion />} />
        <Route path="/energia" element={<Energia />} />
        <Route path="/ajustes" element={<Ajustes />} />
      </Route>
    </Routes>
  )
}
