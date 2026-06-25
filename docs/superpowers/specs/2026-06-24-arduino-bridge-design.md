# Diseño — Conexión Arduino ↔ UI (HMI Tostado) · Prototipo

**Fecha:** 24 de junio de 2026
**Proyecto:** HMI Tostado (tostadora de café industrial)
**Objetivo (prototipo):** Conectar el hardware real mínimo a la UI con **control en lazo
cerrado**:
- **1 entrada:** termopar (temperatura) → mostrada en vivo + curva de tostado real.
- **1 salida:** relé SSR que conmuta la estufa → el **Arduino mantiene el setpoint** por
  bang-bang con histéresis; la UI solo comanda `heat` (habilitar), `setpoint` y `estop`.

Esto hace **reales** tres controles de la UI sobre el mismo hardware (1 termopar + 1 SSR):
el toggle de calor (Monitoreo), el setpoint (Ajustes) y el paro de emergencia.

El resto de controles (succión, 4 resistencias, flujo de aire, motores) **permanecen
simulados**; no hay hardware detrás de ellos todavía.

---

## 1. Contexto y restricciones

| Pieza | Estado |
| --- | --- |
| **UI** | React + Vite + Tailwind en `https://origendelvalle.vercel.app`. Toda la app lee/escribe por un único hook `useMachineData()` en `src/lib/machineData.jsx`. |
| **Tablet** | Redmi Pad Pro 2 (Android), navegador Chrome. |
| **Microcontrolador** | Arduino UNO — solo USB serial, sin red. |
| **Hardware real** | 1 termopar tipo K + MAX6675 (entrada) + 1 relé SSR-40DA para la estufa (salida). |
| **Control** | **Lazo cerrado en el Arduino** (bang-bang + histéresis). La UI fija objetivos, no conmuta el SSR directamente. |
| **Seguridad** | No es preocupación de aplicación en el prototipo (sin autenticación). |

Restricciones duras:
1. **Arduino sin red** → necesita un puente (laptop) que lea el serial y lo exponga.
2. **Chrome en Android no soporta Web Serial** → no hay USB directo al navegador.
3. **UI en Vercel es HTTPS** → debe conectarse por `wss://` con cert de confianza. Por eso
   se usa **Cloudflare Tunnel**, que provee el certificado real y un hostname estable.

> **Sensor:** termopar tipo K + MAX6675 (la temperatura de tostado supera 200 °C).

---

## 2. Arquitectura

```
┌────────────────────┐   wss:// (cert real,    ┌──────────────────────────┐   USB serial   ┌──────────────┐
│  Tablet (Chrome)   │   vía Cloudflare Tunnel)│  Laptop — Bridge (Node)  │  JSON ↑↓       │  Arduino UNO │
│  UI desde Vercel   │ ◀─────────────────────▶ │  • serialport            │ ◀────────────▶ │  MAX6675 in  │
│  origendelvalle... │   telemetría ↓          │  • WebSocket (ws)        │   115200 baud  │  SSR + lazo  │
└────────────────────┘   comandos   ↑          │  • cloudflared           │                │  cerrado     │
                                                └──────────────────────────┘                └──────────────┘
```

**Flujo de datos:**
- **Telemetría (Arduino → UI):** el Arduino emite una línea JSON cada ~500 ms con
  temperatura, setpoint, estado real del SSR, habilitación y `fault`. El puente la difunde
  por WebSocket; la UI la fusiona en su estado y alimenta la curva de tostado.
- **Comandos (UI → Arduino):** la UI envía mensajes WebSocket (`setHeat`, `setSetpoint`,
  `estop`, `heartbeat`). El puente los traduce a **líneas JSON** y las escribe al serial.
  El Arduino aplica el objetivo y **reporta el estado real** en la siguiente telemetría
  (la UI refleja la verdad, no solo lo comandado).

La UI **sigue cargándose desde Vercel**; solo la conexión de datos en vivo va al puente.

---

## 3. Componentes

### 3.1 Firmware Arduino (`firmware/tostadora/tostadora.ino` — **ya provisto**)
Controlador en lazo cerrado, ya escrito y commiteado. Resumen de su comportamiento:
- Lee el termopar (MAX6675) cada 250 ms; emite telemetría JSON cada 500 ms.
- Acepta comandos JSON: `{"heat":bool}`, `{"setpoint":num}`, `{"estop":true}`, `{"ping":…}`.
- **Lazo cerrado bang-bang:** mantiene `setpoint` con histéresis de 2 °C.
- **Gates de seguridad** (apagan el SSR): falla de termopar (`tcFault`), e-stop latcheado,
  **watchdog de comunicaciones (5 s)**, y techo duro **sobre-temperatura 260 °C**.
- Reporta `fault` ∈ {`"thermocouple"`,`"estop"`,`"comms"`,`"overtemp"`, `null`}.
- Librerías: Adafruit MAX6675, ArduinoJson v7. Pines: SCK D6, CS D5, SO D4, SSR D8.

### 3.2 Puente / Bridge (`bridge/` — proyecto Node nuevo, ~120 líneas)
- `serialport` + `@serialport/parser-readline` para el enlace USB.
- `ws` para el servidor WebSocket (sin autenticación en el prototipo).
- **Cloudflare Tunnel** (`cloudflared`) expone el WebSocket en un hostname `wss://` estable.
- Reconexión automática del serial; difunde estado de conexión a la UI.
- **Modo `mock`** integrado en la capa serial: emula el lazo cerrado del firmware (misma
  telemetría JSON, responde a los mismos comandos) para probar puente + UI sin hardware.
- Configuración por `.env`: `SERIAL_PORT` (o `mock`), `BAUD`, `WS_PORT`.

### 3.3 Cambio en la UI (`src/lib/` — sin tocar páginas/componentes)
- Cliente WebSocket que reemplaza **solo** la parte real del simulador:
  - Telemetría entrante → actualiza `temperature` (si no es null), `setpoint`,
    `actuators.heat` (= `enabled` comandado), `fault`, `connected`. El `trend` (°/min) se
    **deriva** de lecturas sucesivas.
  - `toggleHeat` → `setHeat`; `setSetpoint` → `setSetpoint`; `emergencyStop` → `estop`.
    Actualización optimista local + reconciliación con la telemetría real.
  - La curva de tostado (`tempHistory`) se alimenta de la temperatura **real**.
  - Maneja `connected:false` con **reconexión automática** y envía `heartbeat` (`ping`).
- **El resto del simulador permanece** (succión, resistencias, flujo, motores).
- **Modo simulador completo** conservado como fallback (`?sim` en la URL).
- Dirección `wss://` vía `VITE_BRIDGE_URL` (variable de entorno de Vite en Vercel).

---

## 4. Protocolos

### 4.1 Arduino → Laptop (serial, JSON por línea)
```json
{"temperature":182.4,"setpoint":215.0,"actuators":{"heat":true},"enabled":true,"connected":true,"fault":null}
```
- `temperature` °C (1 decimal) o `null` si hay falla de termopar.
- `setpoint` °C objetivo. `actuators.heat` estado **real** del SSR (parpadea con el bang-bang).
- `enabled` habilitación maestra comandada. `connected` siempre `true` desde el firmware.
- `fault` ∈ {`"thermocouple"`,`"estop"`,`"comms"`,`"overtemp"`, `null`}.

### 4.2 Laptop → Arduino (serial, JSON por línea)
| Línea | Significado |
| --- | --- |
| `{"heat":true}` / `{"heat":false}` | Habilitar / deshabilitar el calentamiento |
| `{"setpoint":215}` | Fijar temperatura objetivo (0–450, el firmware la acota) |
| `{"estop":true}` | Paro de emergencia (latchea, apaga el SSR) |
| `{"ping":1}` | Heartbeat (cualquier línea válida refresca el watchdog) |

### 4.3 Tablet ⇄ Laptop (WebSocket JSON)
- **Telemetría (abajo):** `{type:"telemetry", data:{…objeto 4.1…}}`
- **Estado (abajo):** `{type:"status", connected:true, serial:true}`
- **Comando (arriba):** `{type:"command", name:"setHeat"|"setSetpoint"|"estop"|"heartbeat", args:[…]}`
  - El puente traduce el nombre a la línea JSON de 4.2 vía `buildCommand`.

---

## 5. Manejo de errores y seguridad operativa

- **Caída de WebSocket** → UI pone `connected:false`, banner y reconexión con backoff.
- **Caída del serial** → el puente reintenta abrir el puerto y reporta `serial:false`.
- **Watchdog del Arduino (5 s)** → apaga el SSR si no llega ninguna línea (cubre laptop
  colgada / WiFi caída / túnel caído). La UI envía `heartbeat` periódico.
- **Gates de seguridad del firmware** → sobre-temperatura (260 °C), falla de termopar y
  e-stop latcheado fuerzan el SSR a OFF independientemente de la UI.
- **Recomendación fuera de software:** un paro/interruptor físico en la estufa. Un control
  por WiFi/Internet nunca debe ser el único medio de apagado.

*(Sin autenticación de aplicación: es un prototipo.)*

---

## 6. Pruebas

- **Modo `mock` del puente:** emula el lazo cerrado del firmware → prueba puente + UI sin
  hardware (telemetría JSON real, responde a `heat`/`setpoint`/`estop`).
- **`node --test`** para la lógica pura: protocolo del puente, mock serial, servidor WS,
  y helpers de la UI (merge de telemetría, cliente WebSocket).
- **Modo `?sim` de la UI:** conserva el simulador completo para desarrollo offline.
- **Validación con hardware:** comparar temperatura real contra un termómetro de
  referencia; verificar que el watchdog apaga el SSR al matar el puente.

---

## 7. Decisiones tomadas

| Decisión | Elección | Razón |
| --- | --- | --- |
| Hardware real (prototipo) | 1 termopar (MAX6675) + 1 SSR | Alcance real confirmado |
| Modelo de control | **Lazo cerrado en el Arduino** (bang-bang + histéresis) | El firmware provisto lo implementa; más seguro y simple para la UI |
| Protocolo serial | **JSON ↑↓** (no códigos tersos) | Coincide con el firmware real provisto |
| Controles reales | calor (enable), setpoint, e-stop | Expuestos por el firmware |
| Microcontrolador | Arduino UNO (USB) | Hardware existente |
| Puente | Laptop (Node) | Corre serial + WS + túnel |
| Origen de la UI | Vercel (sin cambio de URL) | Requisito del usuario |
| Enlace seguro | **Cloudflare Tunnel** (hostname estable) | Vercel es HTTPS; evita certs self-signed y URL cambiante |
| Autenticación | Ninguna | Prototipo |
| Watchdog | Sí, 5 s (en el firmware) | Seguridad: es una estufa |
| Controles no-hardware | Permanecen simulados | Sin hardware detrás aún |
| Modo simulador | Conservado como fallback (`?sim`) | Desarrollo offline |

---

## 8. Fuera de alcance (YAGNI por ahora)

- Hardware para succión, resistencias, flujo, motores (siguen simulados).
- Control PID (el bang-bang con histéresis basta para el prototipo).
- UI nueva para mostrar `fault` (se guarda en el estado; se puede visualizar luego).
- Autenticación / cuentas de usuario.
- Persistencia de telemetría histórica en el puente (la UI ya exporta CSV/XLSX/PNG).
