import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { createMockSerial } from './mockSerial.js'

export function createSerialLink({ port, baud }, { onLine, onStatus }) {
  if (port === 'mock') return createMockSerial({ onLine, onStatus })

  let sp = null
  let reconnectTimer = null
  let closed = false

  const open = () => {
    sp = new SerialPort({ path: port, baudRate: baud })
    const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }))
    parser.on('data', (d) => onLine(String(d).trim()))
    sp.on('open', () => onStatus(true))
    sp.on('error', (err) => console.warn(`[bridge] serial error: ${err.message}`)) // 'close' handles reconnect
    sp.on('close', () => {
      onStatus(false)
      if (!closed) reconnectTimer = setTimeout(open, 2000) // auto-reconnect
    })
  }

  open()

  return {
    write: (s) => {
      if (sp && sp.isOpen) sp.write(s + '\n')
    },
    close: () => {
      closed = true
      clearTimeout(reconnectTimer)
      sp && sp.close()
    },
  }
}
