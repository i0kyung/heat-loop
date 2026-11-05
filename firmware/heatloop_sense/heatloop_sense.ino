// HEAT LOOP Sense — ESP32 예시 펌웨어 (캠프 실험 장치용, 검증 전)
// 출력: USB 직렬 115200bps, 1초마다 JSON 한 줄
//   {"deviceId":"HEATLOOP-DEMO-01","t1":35.0,"t2":31.0,"t3":15.0,"t4":20.0,"drainFlowLpm":2.5,"coldFlowLpm":2.0,"sensorStatus":"OK"}
// 웹(GitHub Pages 또는 localhost)에서 '데이터: USB 센서 (Web Serial)'를 고르면 MEASURED로 표시된다.
//
// 부품 가정
//   온도: DS18B20 방수형 ×4 (OneWire, GPIO4, 4.7kΩ 풀업)
//   유량: 홀센서 유량계 ×2 (GPIO26 배수, GPIO27 급수). K값(Hz per L/min)은 제품마다 다르므로 반드시 보정한다.
// 안전: 12V 이하 저전압, 실험용 독립 물 회로에만 사용. 식수·급탕 배관에 연결하지 않는다.
//
// 필요 라이브러리: OneWire, DallasTemperature

#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_PIN 4
#define FLOW_DRAIN_PIN 26
#define FLOW_COLD_PIN 27

// 보정값 — 실제 유량계로 1분간 받은 물 무게를 재서 맞춘다
const float K_DRAIN = 7.5;  // 펄스 Hz / (L/min), 가정치
const float K_COLD = 7.5;

// DS18B20 주소: 처음 실행 시 직렬 모니터에 찍힌 주소로 바꿔 T1~T4 위치를 고정한다
DeviceAddress ADDR[4];
bool addrOk[4] = {false, false, false, false};

OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensors(&oneWire);

volatile uint32_t pulsesDrain = 0, pulsesCold = 0;
void IRAM_ATTR onDrain() { pulsesDrain++; }
void IRAM_ATTR onCold() { pulsesCold++; }

void setup() {
  Serial.begin(115200);
  sensors.begin();
  sensors.setResolution(12);
  for (int i = 0; i < 4; i++) addrOk[i] = sensors.getAddress(ADDR[i], i);
  pinMode(FLOW_DRAIN_PIN, INPUT_PULLUP);
  pinMode(FLOW_COLD_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_DRAIN_PIN), onDrain, FALLING);
  attachInterrupt(digitalPinToInterrupt(FLOW_COLD_PIN), onCold, FALLING);
}

void printNum(const char* key, float v, bool ok) {
  Serial.print('"'); Serial.print(key); Serial.print("\":");
  if (ok) Serial.print(v, 2); else Serial.print("null");  // 측정 실패는 null → 웹에서 INVALID
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last < 1000) return;
  float dt = (millis() - last) / 1000.0;
  last = millis();

  noInterrupts();
  uint32_t pd = pulsesDrain, pc = pulsesCold;
  pulsesDrain = 0; pulsesCold = 0;
  interrupts();

  sensors.requestTemperatures();
  float t[4];
  bool ok[4];
  bool allOk = true;
  for (int i = 0; i < 4; i++) {
    t[i] = addrOk[i] ? sensors.getTempC(ADDR[i]) : DEVICE_DISCONNECTED_C;
    ok[i] = t[i] != DEVICE_DISCONNECTED_C;
    allOk = allOk && ok[i];
  }
  float drainLpm = (pd / dt) / K_DRAIN;
  float coldLpm = (pc / dt) / K_COLD;

  Serial.print("{\"deviceId\":\"HEATLOOP-DEMO-01\",");
  printNum("t1", t[0], ok[0]); Serial.print(',');
  printNum("t2", t[1], ok[1]); Serial.print(',');
  printNum("t3", t[2], ok[2]); Serial.print(',');
  printNum("t4", t[3], ok[3]); Serial.print(',');
  printNum("drainFlowLpm", drainLpm, true); Serial.print(',');
  printNum("coldFlowLpm", coldLpm, true); Serial.print(',');
  Serial.print("\"sensorStatus\":\""); Serial.print(allOk ? "OK" : "TEMP_SENSOR_MISSING"); Serial.println("\"}");
}
