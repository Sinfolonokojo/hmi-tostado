import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { createMockSerial } from './mockSerial.js'

export function createSerialLink({ port, baud }, { onLine, onStatus }) {
  if (port === 'mock') return createMockSerial({ onLine, onStatus })

  let sp = null

  const open = () => {
    sp = new SerialPort({ path: port, baudRate: baud })
    const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }))
    parser.on('data', (d) => onLine(String(d).trim()))
    sp.on('open', () => onStatus(true))
    sp.on('error', () => {}) // 'close' handles reconnect
    sp.on('close', () => {
      onStatus(false)
      setTimeout(open, 2000) // auto-reconnect
    })
  }

  open()

  return {
    write: (s) => {
      if (sp && sp.isOpen) sp.write(s + '\n')
    },
    close: () => sp && sp.close(),
  }
}
