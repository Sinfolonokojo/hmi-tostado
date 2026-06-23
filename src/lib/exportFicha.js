/** Export helpers for the Ficha Técnica + roast history (CSV native, XLSX lazy-loaded). */

const fichaRows = (batch) => [
  ['Campo', 'Valor'],
  ['Producto', batch.product],
  ['Variedad', batch.variety],
  ['Lote', batch.lot],
  ['Origen', batch.origin],
  ['Propietario', batch.owner],
  ['KG de Tostado', batch.roastedKg],
]

const historyRows = (history = []) => [
  ['Tiempo (min)', 'Temperatura (°C)'],
  ...history.map((h) => [h.minute, h.temperature]),
]

function fileName(batch, ext) {
  const safe = `${batch.lot}_${batch.variety}`.replace(/[^a-z0-9_-]+/gi, '-')
  return `ficha-tecnica_${safe}.${ext}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportFichaCSV(batch, history = []) {
  // CSV is a single sheet, so we stack the two tables with a blank separator row.
  const matrix = [
    ...fichaRows(batch),
    [],
    ['Historial de Temperatura'],
    ...historyRows(history),
  ]
  const csv = matrix.map((r) => r.map(csvCell).join(',')).join('\r\n')
  // Prepend BOM so Excel opens UTF-8 (accents) correctly.
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), fileName(batch, 'csv'))
}

export async function exportFichaXLSX(batch, history = []) {
  const XLSX = await import('xlsx') // lazy: only fetched when the user exports

  const wsFicha = XLSX.utils.aoa_to_sheet(fichaRows(batch))
  wsFicha['!cols'] = [{ wch: 18 }, { wch: 34 }]

  const wsHist = XLSX.utils.aoa_to_sheet(historyRows(history))
  wsHist['!cols'] = [{ wch: 14 }, { wch: 18 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsFicha, 'Ficha Técnica')
  XLSX.utils.book_append_sheet(wb, wsHist, 'Historial Temp')
  XLSX.writeFile(wb, fileName(batch, 'xlsx'))
}
