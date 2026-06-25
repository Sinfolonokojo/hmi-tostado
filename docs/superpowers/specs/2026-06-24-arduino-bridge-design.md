# Diseño — Conexión Arduino ↔ UI (HMI Tostado)

**Fecha:** 24 de junio de 2026
**Proyecto:** HMI Tostado (tostadora de café industrial)
**Objetivo:** Reemplazar los datos simulados de la UI por datos reales de sensores del
Arduino, y permitir que la UI envíe comandos de control (calor, flujo, succión,
resistencias, paro de emergencia) de vuelta al Arduino.

---

## 1. Contexto y restricciones

| Pieza | Estado |
| --- | --- |
| **UI** | React + Vite + Tailwind, desplegada en `https://origendelvalle.vercel.app`. Toda la app lee/escribe a través de un único hook `useMachineData()` en `src/lib/machineData.jsx`. |
| **Tablet** | Redmi Pad Pro 2 (Android). La UI corre en el navegador (Chrome). |
| **Microcontrolador** | Arduino Uno/Nano/Mega — **solo USB serial, sin red**. |
| **Control** | Bidireccional: la UI muestra sensores **y** envía comandos. |

Restricciones duras que definen la arquitectura:

1. **Arduino no tiene red** → necesita un puente (laptop) que lea el serial USB y lo
   exponga a la red.
2. **Chrome en Android no soporta Web Serial** → no se puede conectar el Arduino por
   USB directo al navegador del tablet.
3. **La UI en Vercel es HTTPS** → el navegador prohíbe que una página segura abra una
   conexión `ws://`/`http://` insegura hacia un dispositivo local (mixed content). La
   conexión al puente **debe** ser `wss://` con un certificado de confianza.
4. **El puente queda expuesto a Internet por el túnel** → la conexión de control debe
   estar **autenticada** (token compartido).

---

## 2. Arquitectura

```
┌────────────────────┐   wss:// (cert real,    ┌──────────────────────────┐   USB serial   ┌─────────────┐
│  Tablet (Chrome)   │   vía túnel)            │  Laptop — Bridge (Node)  │   (JSON/cmd)   │   Arduino   │
│  UI desde Vercel   │ ◀─────────────────────▶ │  • serialport            │ ◀────────────▶ │  sensores   │
│  origendelvalle... │   telemetría ↓          │  • WebSocket (ws) + auth │   115200 baud  │  + relés    │
└────────────────────┘   comandos   ↑          │  • Cloudflare/ngrok tun. │                └─────────────┘
                                                └──────────────────────────┘
```

**Flujo de datos:**
- **Telemetría (Arduino → UI):** Arduino emite una línea JSON cada ~500 ms → el puente
  la parsea y la difunde por WebSocket a los tablets conectados → la UI la fusiona en su
  estado.
- **Comandos (UI → Arduino):** la UI envía un mensaje WebSocket `{type:"command", ...}`
  → el puente lo traduce a una línea de comando compacta y la escribe al serial →
  el Arduino acciona el pin correspondiente y **reporta el estado real** en la siguiente
  línea de telemetría (la UI refleja la verdad, no solo lo comandado).

La UI **sigue cargándose desde Vercel**. Solo la conexión de datos en vivo va al puente
a través del túnel.

---

## 3. Componentes

### 3.1 Sketch de Arduino (`firmware/hmi_tostado.ino` — nuevo)
- Lee sensores (p. ej. termopar vía MAX6675/MAX31855 para temperatura; entradas para
  succión/vibración según el hardware físico).
- Cada ~500 ms imprime **una línea JSON** por `Serial` (115200 baud).
- Lee líneas de comando entrantes y acciona relés (calor, resistencias) y salidas PWM
  (flujo de aire, succión).
- **Watchdog de seguridad:** si no recibe un comando/heartbeat válido en `N` segundos
  (por defecto 5 s), apaga el calor y las resistencias por seguridad.
- Reporta el **estado real** de cada actuador en la telemetría.

### 3.2 Puente / Bridge (`bridge/` — proyecto Node nuevo)
- `serialport` + `@serialport/parser-readline` para el enlace USB.
- `ws` para el servidor WebSocket.
- **Autenticación:** exige un token compartido (`BRIDGE_TOKEN`) en el primer mensaje;
  cierra la conexión si no coincide.
- Túnel (Cloudflare Tunnel recomendado por hostname estable y cert real; ngrok como
  alternativa) que expone el WebSocket en una dirección `wss://` pública estable.
- Reconexión automática del serial si el Arduino se desconecta; difunde el estado de
  conexión a la UI.
- Script de configuración (`.env`): `SERIAL_PORT`, `BAUD`, `WS_PORT`, `BRIDGE_TOKEN`.

### 3.3 Cambio en la UI (`src/lib/machineData.jsx` — único archivo de la UI)
- Reemplaza el simulador mock por un **cliente WebSocket**:
  - Al recibir telemetría → fusiona en el estado (mismo shape actual).
  - Las funciones de comando (`toggleHeat`, `setFan`, `setSuctionSpeed`, `toggleResistance`,
    `setSetpoint`, `emergencyStop`, etc.) envían un mensaje WebSocket **y** hacen una
    actualización optimista local; el estado real se reconcilia con la telemetría.
  - Maneja `connected:false` en caída de WS, con **reconexión automática**.
- **Modo simulador conservado** como fallback (`?sim` en la URL o variable de entorno)
  para seguir desarrollando la UI sin hardware.
- La dirección `wss://` del puente se configura con una variable de entorno de Vite
  (`VITE_BRIDGE_URL`) definida en el panel de Vercel, y el token con `VITE_BRIDGE_TOKEN`.

---

## 4. Protocolos

### 4.1 Arduino → Laptop (serial, JSON por línea, claves cortas)
```json
{"t":182.4,"trend":2.1,"suct":45,"vib":12,"r":[1,1,0,0],"heat":1,"fan":65,"sp":215}
```
- `t` temperatura °C, `trend` °/min, `suct` velocidad succión 0–100, `vib` vibración %,
  `r` estado de las 4 resistencias, `heat` calor on/off, `fan` flujo %, `sp` setpoint.

### 4.2 Laptop → Arduino (líneas de comando compactas, fáciles de parsear en Uno)
| Comando | Significado |
| --- | --- |
| `H1` / `H0` | Calor on / off |
| `F65` | Flujo de aire 65 % |
| `S45` | Velocidad de succión 45 |
| `R2:1` | Resistencia índice 2 → encender (`:0` apagar) |
| `P215` | Setpoint 215 °C |
| `E` | **Paro de emergencia** (apaga todo) |
| `K` | Heartbeat (mantiene vivo el watchdog) |

### 4.3 Tablet ⇄ Laptop (WebSocket JSON)
- **Auth (primer mensaje del cliente):** `{type:"auth", token:"<BRIDGE_TOKEN>"}`
- **Telemetría (abajo):** `{type:"telemetry", data:{…}}`
- **Comando (arriba):** `{type:"command", name:"setFan", args:[65]}`
- **Estado (abajo):** `{type:"status", connected:true, serial:true}`

---

## 5. Manejo de errores y seguridad

- **Caída de WebSocket** → la UI pone `connected:false`, muestra un banner y reconecta
  automáticamente con backoff.
- **Caída del serial** → el puente reintenta abrir el puerto y reporta `serial:false`.
- **Watchdog del Arduino** → apaga calor/resistencias si no hay heartbeat válido en
  `N` segundos (cubre laptop colgada, WiFi caída o túnel caído). La UI envía un
  heartbeat periódico mientras está conectada.
- **Autenticación obligatoria** → sin token válido, el puente cierra la conexión. Evita
  que un tercero con la URL del túnel controle la máquina.
  - **Límite honesto:** como la UI vive en Vercel, el token (`VITE_BRIDGE_TOKEN`) queda
    embebido en el bundle del cliente y es legible por cualquiera que abra DevTools. Por
    tanto protege contra escaneo aleatorio de Internet que tope con la URL del túnel,
    **no** contra un atacante determinado que inspeccione la app. Para endurecerlo más
    adelante: mantener la URL del túnel sin publicar y/o rotar el token, o (mejor) servir
    la UI desde el laptop en la LAN para que el control nunca salga a Internet.
- **Paro de emergencia** → ruta de comando de máxima prioridad.
- **Recomendación fuerte (fuera de software):** un **botón físico de paro de emergencia**
  en la máquina. Un paro por WiFi/Internet nunca debe ser el único.

---

## 6. Pruebas

- **Arduino falso (`bridge/mock-arduino.js`):** emite el mismo JSON por un puerto serial
  virtual para probar puente + UI sin hardware.
- **Modo `?sim` de la UI:** conserva el simulador para desarrollo offline.
- **Validación de lecturas reales** contra la simulación una vez conectado el hardware.

---

## 7. Decisiones tomadas

| Decisión | Elección | Razón |
| --- | --- | --- |
| Microcontrolador | Arduino Uno/Nano/Mega (USB) | Hardware existente |
| Puente | Laptop (Node) | Disponible; corre serial + WS + túnel |
| Origen de la UI | **Vercel** (sin cambio de URL) | Requisito del usuario |
| Enlace seguro | **Túnel con cert real** (Cloudflare/ngrok) | Evita certs self-signed en el tablet; hostname estable |
| Autenticación | Token compartido en WS | El túnel expone el control a Internet |
| Watchdog | Sí, apaga calor en pérdida de comms | Seguridad: elementos calefactores |
| Modo simulador | Conservado como fallback | Desarrollo offline |

---

## 8. Fuera de alcance (YAGNI por ahora)

- Persistencia/base de datos de telemetría histórica en el puente (la UI ya exporta
  CSV/XLSX/PNG por lote).
- Múltiples tostadoras / multi-dispositivo.
- Cuentas de usuario / roles (un solo token compartido por ahora).
