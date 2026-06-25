/** Export helpers: CSV (native), XLSX with embedded roast-curve image (ExcelJS, lazy). */

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
  ['Tiempo (s)', 'Temperatura (°C)'],
  ...history.map((h) => [h.minute * 20, h.temperature]),
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
  const matrix = [...fichaRows(batch), [], ['Historial de Temperatura'], ...historyRows(history)]
  const csv = matrix.map((r) => r.map(csvCell).join(',')).join('\r\n')
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), fileName(batch, 'csv'))
}

/**
 * XLSX with three sheets: Ficha Técnica, Historial Temp, and Gráfico (the embedded
 * temperature-vs-time chart image). `chartImage` is a PNG data URL (or null).
 */
export async function exportFichaXLSX(batch, history = [], chartImage = null) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HMI Tostado'

  const bold = { font: { bold: true } }

  const s1 = wb.addWorksheet('Ficha Técnica')
  s1.columns = [{ width: 18 }, { width: 36 }]
  fichaRows(batch).forEach((r, i) => {
    const row = s1.addRow(r)
    if (i === 0) row.font = { bold: true }
  })

  const s2 = wb.addWorksheet('Historial Temp')
  s2.columns = [{ width: 14 }, { width: 18 }]
  historyRows(history).forEach((r, i) => {
    const row = s2.addRow(r)
    if (i === 0) row.font = bold.font
  })

  if (chartImage) {
    const s3 = wb.addWorksheet('Gráfico')
    const imageId = wb.addImage({ base64: chartImage, extension: 'png' })
    s3.addImage(imageId, { tl: { col: 0, row: 1 }, ext: { width: 820, height: 420 } })
    s3.getCell('A1').value = 'Curva de Tostado · Temperatura vs Tiempo'
    s3.getCell('A1').font = { bold: true, size: 14 }
  }

  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName(batch, 'xlsx'),
  )
}

/** Download just the chart as a PNG. `chartImage` is a PNG data URL. */
export function exportChartPNG(batch, chartImage) {
  if (!chartImage) return
  // data URL -> Blob
  const [header, b64] = chartImage.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  triggerDownload(new Blob([arr], { type: mime }), fileName(batch, 'png').replace('ficha-tecnica', 'curva-tostado'))
}
