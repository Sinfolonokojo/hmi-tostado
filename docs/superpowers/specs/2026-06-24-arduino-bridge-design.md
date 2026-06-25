# Diseño — Conexión Arduino ↔ UI (HMI Tostado) · Prototipo

**Fecha:** 24 de junio de 2026
**Proyecto:** HMI Tostado (tostadora de café industrial)
**Objetivo (prototipo):** Conectar el hardware real mínimo a la UI:
- **1 entrada:** sensor de temperatura → mostrado en vivo + curva de tostado real.
- **1 salida:** relé SSR que enciende/apaga la estufa → controlado desde el botón de calor.

El resto de controles de la UI (succión, 4 resistencias, flujo de aire, motores,
setpoint) **permanecen simulados** en esta fase; no hay hardware detrás de ellos todavía.

---

## 1. Contexto y restricciones

| Pieza | Estado |
| --- | --- |
| **UI** | React + Vite + Tailwind en `https://origendelvalle.vercel.app`. Toda la app lee/escribe por un único hook `useMachineData()` en `src/lib/machineData.jsx`. |
| **Tablet** | Redmi Pad Pro 2 (Android), navegador Chrome. |
| **Microcontrolador** | Arduino Uno/Nano/Mega — solo USB serial, sin red. |
| **Hardware real** | 1 sensor de temperatura (entrada) + 1 relé SSR para la estufa (salida). |
| **Seguridad** | No es preocupación en el prototipo (sin autenticación). |

Restricciones duras:
1. **Arduino sin red** → necesita un puente (laptop) que lea el serial y lo exponga.
2. **Chrome en Android no soporta Web Serial** → no hay USB directo al navegador.
3. **UI en Vercel es HTTPS** → debe conectarse por `wss://` con cert de confianza. Por eso
   se usa un **túnel** (Cloudflare/ngrok) que provee el certificado real.

> **Nota de sensor:** la temperatura de tostado supera los 200 °C, así que el sensor debe
> ser un **termopar tipo K con amplificador MAX6675/MAX31855** (un LM35/analógico no llega).
> El protocolo no cambia según el sensor; solo el código de lectura del sketch.

---

## 2. Arquitectura

```
┌────────────────────┐   wss:// (cert real,    ┌──────────────────────────┐   USB serial   ┌──────────────┐
│  Tablet (Chrome)   │   vía túnel)            │  Laptop — Bridge (Node)  │                │   Arduino    │
│  UI desde Vercel   │ ◀─────────────────────▶ │  • serialport            │ ◀────────────▶ │  termopar in │
│  origendelvalle... │   temperatura ↓         │  • WebSocket (ws)        │   115200 baud  │  SSR estufa  │
└────────────────────┘   calor on/off ↑        │  • Cloudflare/ngrok tun. │                └──────────────┘
                                                └──────────────────────────┘
```

**Flujo de datos:**
- **Temperatura (Arduino → UI):** Arduino emite una línea JSON cada ~500 ms con la
  temperatura → el puente la difunde por WebSocket → la UI la fusiona en su estado y
  alimenta la curva de tostado.
- **Calor (UI → Arduino):** el botón de calor envía `{type:"command", name:"toggleHeat"}`
  → el puente escribe `H1`/`H0` al serial → el Arduino activa/desactiva el SSR y **reporta
  el estado real** del relé en la siguiente telemetría.

La UI **sigue cargándose desde Vercel**; solo la conexión de datos en vivo va al puente.

---

## 3. Componentes

### 3.1 Sketch de Arduino (`firmware/hmi_tostado.ino` — nuevo)
- Lee el termopar (MAX6675/MAX31855) cada ~500 ms.
- Imprime **una línea JSON** por `Serial` (115200 baud): `{"t":182.4,"heat":1}`.
- Lee comandos entrantes (`H1`/`H0`) y acciona el pin del SSR.
- **Watchdog de seguridad (SE MANTIENE — es una estufa):** si no recibe un comando o
  heartbeat válido en `5 s`, apaga el SSR. Cubre laptop colgada / WiFi caída / túnel caído.
- Reporta el estado real del SSR (`heat`) en cada telemetría.

### 3.2 Puente / Bridge (`bridge/` — proyecto Node nuevo, ~100 líneas)
- `serialport` + `@serialport/parser-readline` para el enlace USB.
- `ws` para el servidor WebSocket (sin autenticación en el prototipo).
- Túnel **Cloudflare Tunnel** (`cloudflared`) que expone el WebSocket en un hostname
  `wss://` estable con certificado real (se configura una sola vez).
- Reconexión automática del serial; difunde estado de conexión a la UI.
- Configuración por `.env`: `SERIAL_PORT`, `BAUD`, `WS_PORT`.

### 3.3 Cambio en la UI (`src/lib/machineData.jsx` — único archivo)
- Cliente WebSocket que reemplaza **solo** la parte real del simulador:
  - Telemetría entrante → actualiza `temperature` (y `heat` real del actuador). El `trend`
    (°/min) se **deriva** de lecturas sucesivas (no lo envía el Arduino).
  - `toggleHeat` → envía comando WebSocket + actualización optimista; se reconcilia con la
    telemetría real.
  - La curva de tostado (`tempHistory`) se alimenta de la temperatura **real**.
  - Maneja `connected:false` con **reconexión automática**.
- **El resto del simulador permanece** para succión, resistencias, flujo, motores y
  setpoint (sin hardware en esta fase).
- **Modo simulador completo** conservado como fallback (`?sim` en la URL) para desarrollo
  sin hardware.
- Dirección `wss://` del puente vía variable de entorno de Vite (`VITE_BRIDGE_URL`) en el
  panel de Vercel.

---

## 4. Protocolos

### 4.1 Arduino → Laptop (serial, JSON por línea)
```json
{"t":182.4,"heat":1}
```
- `t` temperatura °C (real, del termopar). `heat` estado real del SSR (1/0).

### 4.2 Laptop → Arduino (líneas de comando compactas)
| Comando | Significado |
| --- | --- |
| `H1` / `H0` | Encender / apagar el SSR (calor) |
| `K` | Heartbeat (mantiene vivo el watchdog) |

### 4.3 Tablet ⇄ Laptop (WebSocket JSON)
- **Telemetría (abajo):** `{type:"telemetry", data:{t:182.4, heat:1}}`
- **Comando (arriba):** `{type:"command", name:"toggleHeat"}`
- **Estado (abajo):** `{type:"status", connected:true, serial:true}`

---

## 5. Manejo de errores y seguridad operativa

- **Caída de WebSocket** → UI pone `connected:false`, muestra banner y reconecta con backoff.
- **Caída del serial** → el puente reintenta abrir el puerto y reporta `serial:false`.
- **Watchdog del Arduino (clave)** → apaga el SSR si no hay heartbeat en `5 s`. La UI envía
  un heartbeat periódico mientras está conectada. Esto evita dejar la estufa encendida si
  algo en la cadena falla.
- **Recomendación fuera de software:** un interruptor/paro físico en la estufa. Un control
  por WiFi/Internet nunca debe ser el único medio de apagado.

*(Sin autenticación de aplicación: es un prototipo. Si más adelante deja de serlo, lo más
sano es servir la UI desde el laptop en la LAN para que el control no salga a Internet.)*

---

## 6. Pruebas

- **Arduino falso (`bridge/mock-arduino.js`):** emite `{"t":...,"heat":...}` por un puerto
  serial virtual para probar puente + UI sin hardware.
- **Modo `?sim` de la UI:** conserva el simulador completo para desarrollo offline.
- **Validación:** comparar lecturas reales del termopar contra un termómetro de referencia.

---

## 7. Decisiones tomadas

| Decisión | Elección | Razón |
| --- | --- | --- |
| Hardware real (prototipo) | 1 temp in + 1 SSR out | Alcance real confirmado |
| Sensor de temperatura | Termopar tipo K + MAX6675/MAX31855 | Tostado supera 200 °C |
| Microcontrolador | Arduino Uno/Nano/Mega (USB) | Hardware existente |
| Puente | Laptop (Node) | Corre serial + WS + túnel |
| Origen de la UI | Vercel (sin cambio de URL) | Requisito del usuario |
| Enlace seguro | **Cloudflare Tunnel** (hostname estable) | Vercel es HTTPS; evita certs self-signed y URL cambiante |
| Autenticación | Ninguna | Prototipo |
| Watchdog | Sí (apaga SSR en pérdida de comms) | Seguridad: es una estufa |
| Controles no-hardware | Permanecen simulados | Sin hardware detrás aún |
| Modo simulador | Conservado como fallback | Desarrollo offline |

---

## 8. Fuera de alcance (YAGNI por ahora)

- Hardware para succión, resistencias, flujo, motores, setpoint (siguen simulados).
- Autenticación / cuentas de usuario.
- Persistencia de telemetría histórica en el puente (la UI ya exporta CSV/XLSX/PNG).
- Múltiples tostadoras / multi-dispositivo.
