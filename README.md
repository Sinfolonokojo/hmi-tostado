# HMI Tostado — Panel de Tostado Automatizado

Panel HMI (Human-Machine Interface) para una tostadora de café industrial. Construido con
**Vite + React + Tailwind CSS**, totalmente responsivo (móvil / tablet / escritorio) y
desplegado en **Vercel**.

Hoy funciona con **datos simulados**. Está estructurado para conectarse más adelante a un
**Arduino UNO** que transmita datos reales de sensores.

## Páginas

| Ruta        | Pantalla    | Contenido                                                          |
| ----------- | ----------- | ------------------------------------------------------------------ |
| `/`         | Monitoreo   | Temperatura + tendencia, curva de tostado, batch, actuadores, flujo de aire |
| `/succion`  | Succión     | Encendido, medidor de caudal animado, velocidad manual, vibración  |
| `/energia`  | Energía     | Consumo, 4 resistencias (kW en vivo), diagnóstico                  |
| `/ajustes`  | Ajustes     | 4 motores, setpoint térmico, fila de estado                        |

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
npm run preview  # sirve el build de producción
```

## Arquitectura de datos (clave)

Toda la lógica de la máquina vive en un único contexto: [`src/lib/machineData.jsx`](src/lib/machineData.jsx).
Las páginas y componentes leen/escriben **solo** a través de `useMachineData()`. Hoy el estado lo
alimenta un **simulador** (`MachineDataProvider`).

### Conectar el Arduino más adelante

Vercel está en la nube y **no puede** comunicarse directamente con un Arduino conectado por USB.
El enlace real se hará por uno de estos caminos, sin reescribir la interfaz:

1. **Web Serial API** — el navegador habla con el Arduino por USB (Chrome/Edge).
2. **Puente local** — un pequeño servicio lee el puerto serie y lo reenvía por WebSocket.

En ambos casos solo se reemplaza el proveedor en `machineData.jsx` por uno que escriba el **mismo
shape de estado**. Protocolo de línea sugerido para el Arduino (un JSON por línea):

```json
{"temperature":180.4,"airflow":{"rpm":1450},"suction":{"speed":45},"resistances":[{"on":true,"kw":3.2}]}
```

## Despliegue

Conectado a GitHub e importado en Vercel (preset Vite: build `vite build`, salida `dist`).
`vercel.json` incluye un *rewrite* SPA para que las rutas funcionen al recargar.
