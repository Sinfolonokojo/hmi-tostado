/*
  tostadora.ino  ·  Firmware for the hmi-tostado coffee-roaster controller
  Board: Arduino UNO

  WHAT IT DOES
    - Reads chamber temperature from a MAX6675 K-type thermocouple.
    - Holds a setpoint by switching an SSR-40 DA that drives the AC heater
      (bang-bang control with hysteresis).
    - Talks to the hmi-tostado web UI over USB serial using newline-delimited
      JSON, matching the state shape in src/lib/machineData.jsx.

  LIBRARIES (install via Arduino IDE  ->  Tools  ->  Manage Libraries...)
    - "MAX6675 library"  by Adafruit
    - "ArduinoJson"      by Benoit Blanchon   (v7.x)

  WIRING (default pins -- change the constants below if you wired differently)
    MAX6675 module:
        VCC -> 5V        GND -> GND
        SCK -> D6        CS  -> D5        SO (MISO) -> D4
    SSR-40 DA (DC-controlled, AC-switching):
        control +  -> D8          control -  -> GND   (share ground with Arduino)
        load side  -> switches AC MAINS to the heating element

  >>> MAINS SAFETY (your responsibility -- this code only drives a logic pin) <<<
        - Mount the SSR on a HEATSINK (a 40 A SSR gets hot even at low load).
        - Use an inline FUSE sized to the heater, correct wire gauge, and a
          proper enclosure. No exposed mains. Test logic side first with the
          heater UNPLUGGED, watching the SSR's own indicator LED.
        - If the SSR will not switch reliably from the Arduino's 5 V pin, drive
          it through a small NPN transistor (e.g. 2N2222 + 1k base resistor).

  SERIAL PROTOCOL  (115200 baud, one JSON object per line)
    Arduino -> UI (every TELEMETRY_MS):
        {"temperature":183.5,"setpoint":215,"actuators":{"heat":true},"enabled":true,"connected":true,"fault":null}
        ("actuators":{"heat":...} is the ACTUAL SSR state; "enabled" is the master switch)
    UI -> Arduino (send any of these; keys can be combined on one line):
        {"heat":true}            master enable ON  (also clears a latched e-stop)
        {"heat":false}           master enable OFF
        {"setpoint":215}         target temperature in C (0..450)
        {"estop":true}           emergency stop: forces heat off and latches
        {"ping":1}               heartbeat only (keeps the comms watchdog happy)

  BENCH TESTING from the IDE Serial Monitor:
    Set the monitor to 115200 baud and line ending "Newline", then type e.g.
        {"setpoint":50}
        {"heat":true}
    With WATCHDOG_ENABLED = true you must send a line at least every 5 s or the
    heater fail-safes OFF. For relaxed bench testing, set WATCHDOG_ENABLED = false.
*/

#include "max6675.h"
#include <ArduinoJson.h>

// ---------------- Pins ----------------
const uint8_t PIN_TC_SCK = 6;   // MAX6675 SCK
const uint8_t PIN_TC_CS  = 5;   // MAX6675 CS
const uint8_t PIN_TC_SO  = 4;   // MAX6675 SO (MISO)
const uint8_t PIN_SSR    = 8;   // SSR control (+). HIGH = heater ON

// ---------------- Tunables ----------------
const float    HYSTERESIS_C     = 2.0;     // deadband below setpoint (anti-chatter)
const float    MAX_SAFE_TEMP_C  = 260.0;   // hard ceiling: SSR forced OFF above this
const float    SETPOINT_MIN_C   = 0.0;
const float    SETPOINT_MAX_C   = 450.0;   // matches the UI setpoint slider
const uint16_t TC_READ_MS       = 250;     // MAX6675 needs >= ~220 ms per conversion
const uint16_t TELEMETRY_MS     = 500;     // how often we report state to the UI
const uint32_t COMMS_TIMEOUT_MS = 5000;    // fail-safe if the UI goes silent
const bool     WATCHDOG_ENABLED = true;    // false = no heartbeat required (bench only)
const bool     PLOTTER_MODE     = false;   // true = emit Serial-Plotter lines instead of
                                           // JSON (bench-only; the bridge/UI need JSON, so
                                           // keep this false except when graphing in the IDE)

// ---------------- Hardware ----------------
MAX6675 thermocouple(PIN_TC_SCK, PIN_TC_CS, PIN_TC_SO);

// ---------------- State ----------------
float    setpointC       = 215.0;  // target temp commanded by the UI
bool     heatEnabled     = false;  // master enable from the UI (starts OFF)
bool     ssrOn           = false;  // actual SSR output state
bool     tcFault         = true;   // true until the first valid reading
bool     estopLatched    = false;  // emergency-stop latch
float    lastTempC       = NAN;    // last valid temperature
uint32_t lastTcReadMs    = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastCmdMs       = 0;      // last time we received a valid line

// ---------------- Helpers ----------------
void setSSR(bool on) {
  ssrOn = on;
  digitalWrite(PIN_SSR, on ? HIGH : LOW);
}

// Read one JSON command line and apply it. Any valid line resets the watchdog.
void handleCommand(const char* line, uint32_t now) {
  JsonDocument doc;                              // ArduinoJson v7
  if (deserializeJson(doc, line)) return;        // ignore malformed lines
  lastCmdMs = now;                               // valid line counts as a heartbeat

  if (!doc["heat"].isNull()) {
    heatEnabled = doc["heat"].as<bool>();
    if (heatEnabled) estopLatched = false;       // re-enabling clears a latched e-stop
  }
  if (!doc["setpoint"].isNull()) {
    setpointC = constrain(doc["setpoint"].as<float>(), SETPOINT_MIN_C, SETPOINT_MAX_C);
  }
  if (doc["estop"].as<bool>()) {                 // e-stop wins if present on the line
    estopLatched = true;
    heatEnabled  = false;
  }
  // {"ping":...} needs no handling beyond the lastCmdMs refresh above.
}

// Accumulate serial bytes into a line buffer, dispatch on newline.
void readSerialCommands(uint32_t now) {
  static char buf[128];
  static uint8_t idx = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (idx > 0) { buf[idx] = '\0'; handleCommand(buf, now); idx = 0; }
    } else if (idx < sizeof(buf) - 1) {
      buf[idx++] = c;
    } else {
      idx = 0;  // overflow: drop the line
    }
  }
}

// Emit one line the Arduino IDE Serial Plotter can graph: "label:value" pairs,
// comma-separated. Open Tools -> Serial Plotter at 115200 baud to see the curves.
// Heater is scaled to the setpoint so its on/off square wave is visible against
// the temperature trace instead of being pinned flat at 0/1.
void sendPlotterLine() {
  Serial.print("Temperature:");
  Serial.print((tcFault || isnan(lastTempC)) ? 0.0 : lastTempC, 1);
  Serial.print(",Setpoint:");
  Serial.print(setpointC, 1);
  Serial.print(",Heater:");
  Serial.println(ssrOn ? setpointC : 0.0, 1);
}

void sendTelemetry(bool commsLost) {
  if (PLOTTER_MODE) { sendPlotterLine(); return; }

  JsonDocument doc;

  if (tcFault || isnan(lastTempC)) doc["temperature"] = nullptr;
  else doc["temperature"] = round(lastTempC * 10.0) / 10.0;   // 1 decimal

  doc["setpoint"] = setpointC;
  doc["actuators"]["heat"] = ssrOn;     // ACTUAL SSR state (what the heater is doing)
  doc["enabled"]   = heatEnabled;       // master enable (for diagnostics)
  doc["connected"] = true;              // firmware alive; UI marks false when the port drops

  if (tcFault)                                          doc["fault"] = "thermocouple";
  else if (estopLatched)                                doc["fault"] = "estop";
  else if (commsLost)                                   doc["fault"] = "comms";
  else if (!isnan(lastTempC) && lastTempC >= MAX_SAFE_TEMP_C) doc["fault"] = "overtemp";
  else                                                  doc["fault"] = nullptr;

  serializeJson(doc, Serial);
  Serial.println();
}

// ---------------- Setup / Loop ----------------
void setup() {
  pinMode(PIN_SSR, OUTPUT);
  setSSR(false);                 // start with the heater OFF
  Serial.begin(115200);
  delay(500);                    // let the MAX6675 settle after power-up
  lastCmdMs = millis();          // grace period before the watchdog can trip
}

void loop() {
  uint32_t now = millis();

  // 1) Read the thermocouple at a safe cadence.
  if (now - lastTcReadMs >= TC_READ_MS) {
    lastTcReadMs = now;
    float t = thermocouple.readCelsius();   // NAN if the thermocouple is open
    if (isnan(t)) {
      tcFault = true;
    } else {
      tcFault = false;
      lastTempC = t;
    }
  }

  // 2) Process any incoming commands (also refreshes the comms watchdog).
  readSerialCommands(now);

  // 3) Decide the SSR state -- safety gates first, then bang-bang control.
  bool commsLost = WATCHDOG_ENABLED && (now - lastCmdMs > COMMS_TIMEOUT_MS);
  bool safe = !tcFault && !estopLatched && !commsLost &&
              !isnan(lastTempC) && lastTempC < MAX_SAFE_TEMP_C;

  if (!heatEnabled || !safe) {
    if (ssrOn) setSSR(false);                                   // force OFF
  } else {
    if (!ssrOn && lastTempC <= setpointC - HYSTERESIS_C) setSSR(true);
    else if (ssrOn && lastTempC >= setpointC)            setSSR(false);
  }

  // 4) Report state to the UI.
  if (now - lastTelemetryMs >= TELEMETRY_MS) {
    lastTelemetryMs = now;
    sendTelemetry(commsLost);
  }
}
