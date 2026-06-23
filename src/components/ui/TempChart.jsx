import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

/**
 * Temperature vs. time roast curve (Chart.js). `data`: [{ minute, temperature }].
 * Optional `target` / `firstCrack` draw dashed reference lines.
 */
export default function TempChart({ data = [], target, firstCrack, chartRef }) {
  const labels = data.map((d) => `${d.minute}′`)
  const temps = data.map((d) => d.temperature)

  const refs = [target, firstCrack].filter((v) => typeof v === 'number')
  const yMin = Math.floor((Math.min(...temps, ...refs, 0) - 10) / 10) * 10
  const yMax = Math.ceil((Math.max(...temps, ...refs, 0) + 10) / 10) * 10

  const datasets = [
    {
      label: 'Temperatura',
      data: temps,
      borderColor: '#b0c6ff',
      borderWidth: 3,
      pointRadius: 2.5,
      pointHoverRadius: 6,
      pointBackgroundColor: '#b0c6ff',
      tension: 0.4,
      fill: true,
      backgroundColor: (context) => {
        const { ctx, chartArea } = context.chart
        if (!chartArea) return null
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
        g.addColorStop(0, 'rgba(176, 198, 255, 0.22)')
        g.addColorStop(1, 'rgba(176, 198, 255, 0)')
        return g
      },
    },
  ]

  if (typeof firstCrack === 'number') {
    datasets.push({
      label: `Primer Crack (${firstCrack}°)`,
      data: labels.map(() => firstCrack),
      borderColor: '#7ddc7a',
      borderWidth: 1.25,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
      tension: 0,
    })
  }
  if (typeof target === 'number') {
    datasets.push({
      label: `Objetivo (${target}°)`,
      data: labels.map(() => target),
      borderColor: '#ffb5a0',
      borderWidth: 1.25,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
      tension: 0,
    })
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: '#c3c6d4',
          boxWidth: 12,
          boxHeight: 2,
          font: { family: 'JetBrains Mono', size: 11 },
          usePointStyle: false,
        },
      },
      tooltip: {
        backgroundColor: '#201f1f',
        borderColor: '#434652',
        borderWidth: 1,
        titleColor: '#e5e2e1',
        bodyColor: '#c3c6d4',
        titleFont: { family: 'JetBrains Mono' },
        bodyFont: { family: 'JetBrains Mono' },
        callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}°C` },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#8d909d', font: { family: 'JetBrains Mono' } },
        title: { display: true, text: 'TIEMPO (min)', color: '#8d909d', font: { family: 'JetBrains Mono', size: 10 } },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#8d909d', font: { family: 'JetBrains Mono' }, callback: (v) => `${v}°` },
        title: { display: true, text: 'TEMP (°C)', color: '#8d909d', font: { family: 'JetBrains Mono', size: 10 } },
      },
    },
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-outline text-label-md">
        Sin datos de proceso — pulsa «Iniciar Proceso»
      </div>
    )
  }

  return <Line ref={chartRef} data={{ labels, datasets }} options={options} />
}
