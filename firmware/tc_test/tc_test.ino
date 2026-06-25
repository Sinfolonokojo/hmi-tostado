/*
  tc_test.ino  ·  MAX6675 thermocouple sensor test (no SSR, no UI, no control)
  Board: Arduino UNO

  Purpose: confirm the thermocouple is wired and reading correctly by plotting
  the temperature live. Nothing here drives the heater -- it is read-only.

  LIBRARY (Arduino IDE -> Tools -> Manage Libraries...)
    - "MAX6675 library"  by Adafruit

  WIRING (same pins as the main firmware)
    MAX6675:  VCC -> 5V   GND -> GND   SCK -> D6   CS -> D5   SO (MISO) -> D4

  HOW TO SEE THE PLOT
    1. Upload this sketch.
    2. Tools -> Serial Plotter, set baud to 115200.
    3. The "Temperature" curve appears. (Tools -> Serial Monitor at 115200
       shows the same numbers as text if you prefer.)
*/

#include "max6675.h"

const uint8_t  PIN_TC_SCK = 6;    // MAX6675 SCK
const uint8_t  PIN_TC_CS  = 5;    // MAX6675 CS
const uint8_t  PIN_TC_SO  = 4;    // MAX6675 SO (MISO)
const uint16_t READ_MS    = 250;  // MAX6675 needs >= ~220 ms per conversion

MAX6675 thermocouple(PIN_TC_SCK, PIN_TC_CS, PIN_TC_SO);

void setup() {
  Serial.begin(115200);
  delay(500);   // let the MAX6675 settle after power-up
}

void loop() {
  float t = thermocouple.readCelsius();   // NAN if the thermocouple is open

  // Serial Plotter graphs "label:value" lines. On an open/faulty sensor we plot
  // 0 so the trace stays flat instead of breaking the graph.
  Serial.print("Temperature:");
  Serial.println(isnan(t) ? 0.0 : t, 2);

  delay(READ_MS);
}
