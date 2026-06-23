import { useState } from 'react'
import Icon from '../Icon.jsx'

/** Small dropdown to export data in CSV or XLSX. */
export default function ExportMenu({ onCsv, onXlsx }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Exportar ficha técnica"
        className="flex items-center justify-center w-9 h-9 rounded-lg text-outline-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
      >
        <Icon name="download" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-48 bg-surface-container-high border border-outline-variant rounded-lg overflow-hidden shadow-xl">
            <MenuItem
              icon="description"
              label="Exportar CSV"
              onClick={() => {
                setOpen(false)
                onCsv()
              }}
            />
            <MenuItem
              icon="table_view"
              label="Exportar Excel"
              onClick={() => {
                setOpen(false)
                onXlsx()
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left text-body-md text-on-surface hover:bg-surface-container-highest transition-colors"
    >
      <Icon name={icon} className="text-xl text-primary" />
      {label}
    </button>
  )
}
