/** Export helpers for the Ficha Técnica card (CSV native, XLSX lazy-loaded). */

const rows = (batch) => [
  ['Campo', 'Valor'],
  ['Producto', batch.product],
  ['Variedad', batch.variety],
  ['Lote', batch.lot],
  ['Origen', batch.origin],
  ['Propietario', batch.owner],
  ['KG de Tostado', batch.roastedKg],
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

export function exportFichaCSV(batch) {
  const csv = rows(batch)
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')
  // Prepend BOM so Excel opens UTF-8 (accents) correctly.
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), fileName(batch, 'csv'))
}

export async function exportFichaXLSX(batch) {
  const XLSX = await import('xlsx') // lazy: only fetched when the user exports
  const ws = XLSX.utils.aoa_to_sheet(rows(batch))
  ws['!cols'] = [{ wch: 18 }, { wch: 34 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ficha Técnica')
  XLSX.writeFile(wb, fileName(batch, 'xlsx'))
}
