# HEAT LOOP v3 — 웹 프로토타입

Carbon Start(탄소첫걸음)의 스마트 배수열 회수 모듈 **HEAT LOOP** 시연용 정적 웹앱입니다.
심사위원이 3분 안에 세 질문에 답을 얻도록 만들었습니다.

| 단계 | 화면 | 답하는 질문 |
|---|---|---|
| STEP 01 | `#diagnose` 배수열 회수 적합도 진단 | 이 건물에 설치할 가치가 있나? |
| STEP 02 | `#demo` 폐열 회수 측정·작동 시연 (BYPASS / ON) | 실제로 버려지는 열을 회수하나? |
| STEP 03 | `#economics` 효과·경제성 분석 | 얼마의 에너지와 비용을 아낄 가능성이 있나? |
| 건물 3D | `#building` 건물 개략 3D (조감·지상·정면·단면) | 우리 건물 어디에, 얼마나 큰 공간에 들어가나? |
| 제품 | `#product` Core·Sense·Dashboard, 도면 6종 | 어떤 제품인가? |
| 보고서 | `#report` 요약 복사·인쇄 | 결과를 어떻게 공유하나? |

## 실행

빌드가 필요 없습니다. ES 모듈을 쓰므로 `file://`로 열지 말고 로컬 서버로 엽니다.

```bash
node tools/serve.mjs 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.

테스트는 Node 18 이상에서 실행합니다(외부 패키지 없음).

```bash
npm test
```

## 건물 3D (`#building`)

- 입력값: 지상·지하 층수, 층고, 정면 가로, 측면 세로, 샤워실 층, 기계실 층
- 이 값으로 건물 개략 모형을 만들고 다음을 올려 보여줍니다.
  - 샤워실과 기계실
  - 배수 수직관
  - HEAT LOOP Core
  - 급수·예열수·급탕 배관
  - 높이·가로·세로 치수선
- 시점은 네 가지입니다.

| 시점 | 보여주는 것 |
|---|---|
| **조감** | 건물 전체를 위에서 비스듬히 본 모습. 드래그로 돌리기, 휠·핀치로 확대 |
| **지상** | 길 건너편 눈높이 1.6 m에서 올려다본 모습. 거리와 꼭대기를 보는 각도를 표시 |
| **정면** | 원근 없는 입면. 축척 막대(1·2·5×10ⁿ m)로 높이·폭을 가늠 |
| **단면** | 앞·오른쪽 유리벽과 지면을 걷어내고 샤워실에서 기계실 Core까지 보는 모습. T1~T4 실시간 값 표시 |

- **측정 연동:** STEP 02 시연(시뮬레이션 또는 USB 센서)이 돌아가는 동안 3D에도 같은 값이 반영됩니다.
  - 배관 속 흐름 점이 유량에 비례해 움직입니다.
  - BYPASS일 때는 우회관으로 흐르고, ON일 때는 Core가 회수 열출력만큼 빛납니다.
- **판정 값** (`js/building-model.js`, 순수 함수)
  - 건물 높이, 개략 연면적: 진단 입력과 15% 넘게 다르면 경고
  - 배수 수직관 길이
  - Core 수직 구간 확보 여부: 가정 1.2 m, 층고 − 슬래브 0.3 − 천장 0.6 − 바닥 0.4 m
- Three.js 0.160.0을 jsDelivr에서 해당 화면을 열 때만 불러옵니다(import map).
  - 처음 한 번 연 뒤에는 오프라인 캐시로 동작합니다.
  - 불러오지 못하면 안내 문구를 띄우고, 치수 계산은 계속 표시합니다.
- **개략 매스 모델**입니다.
  - 실측 도면이 아니고, 배관 경로는 설명용 예시입니다.
  - Core 지름은 보기 쉽게 실제보다 크게 그렸습니다.

## 앱으로 쓰기 (PWA)

- **폰:** 하단 탭바가 나오고, 선택한 아이콘이 위로 떠오릅니다.
  - Android Chrome: 헤더의 **앱 설치** 버튼을 누릅니다.
  - iOS Safari: 공유 → 홈 화면에 추가를 고릅니다.
- **태블릿·데스크톱(768px 이상):** 탭바가 왼쪽 레일로 바뀝니다.
- **오프라인:** `sw.js`가 네트워크를 먼저 시도하고, 실패하면 캐시로 응답합니다.
  - 한 번 연 뒤에는 시연장 와이파이가 끊겨도 동작합니다.
  - HTTPS 또는 localhost에서만 등록됩니다.
  - 파일을 고친 뒤에는 `sw.js`의 `CACHE` 이름을 올리세요.
- **앱 아이콘:** 팀 CLAIM의 C·잎사귀 아이콘으로 192·512·maskable·apple-touch·파비콘 PNG를 만들었습니다.

## 이미지 출처

- `assets/icons3d/` — 팀이 제공한 「에너지 효율 관리 3D 아이콘 그리드」에서 쓰는 아이콘 25개만 잘라 배경을 투명하게 만든 것입니다.
- `assets/claim-logo.png` — 팀 CLAIM 로고(잎사귀 심볼). 테두리의 형광 초록 잡티를 지우고 여백을 잘랐습니다.
- `icons/` — 팀 CLAIM 앱 아이콘(초록 C와 잎새).

## 파일 구조

```
heat-loop/
├─ index.html                 # 6개 화면(해시 라우팅) + 아이콘 스프라이트 + 탭바
├─ manifest.webmanifest, sw.js, icons/   # PWA
├─ css/style.css              # Warm White·Sage·Coral(온수)·Blue(냉수)·Teal(예열)
├─ css/app-shell.css          # 하단 탭바 ↔ 왼쪽 레일, 떠오르는 아이콘, 런처 홈, 스크롤 리빌
├─ js/
│  ├─ factors.js              # 물성·배출계수·열원 기본값 (출처·연도·확인 상태 포함)
│  ├─ thermal.js              # 열출력·적분·검증 (순수 함수)
│  ├─ simulation.js           # 헬스장 19:00~21:00 시나리오 생성기 (SIMULATED)
│  ├─ sensor-adapter.js       # Simulation / Web Serial 어댑터, 페이로드 파서
│  ├─ suitability.js          # STEP 01 적합도 판정 (자체 기준·초기 가설)
│  ├─ economics.js            # STEP 03 경제성·민감도 (ESTIMATED)
│  ├─ flowviz.js / chart.js   # SVG 흐름도·그래프
│  ├─ product-art.js          # 제품 개념도 6종 (제조 도면 아님)
│  ├─ building-model.js       # 건물 치수·수직관·Core 구간 계산 (순수 함수)
│  ├─ building3d.js           # Three.js 건물 3D 뷰어 (지연 로드)
│  ├─ storage.js              # localStorage (실패해도 동작)
│  └─ app.js                  # 라우팅·상태·렌더링
├─ tests/*.test.js            # node --test, 36개
├─ firmware/heatloop_sense/   # ESP32 예시 펌웨어 (JSON 줄 출력)
├─ tools/serve.mjs            # 의존성 없는 로컬 서버
├─ HEAT_LOOP_v3.md            # 통합 제품 기획서
└─ VERIFICATION.md            # 검증 결과
```

## 단위와 데이터 상태 규칙

- 온도 ℃, 유량 L/min, 열출력 **kW_th**, 열량 **kWh_th**. 전기는 **kWh_e**로 따로 씁니다.
- 회수 열출력 `kW_th = (급수 유량 L/min ÷ 60) × 1.0 kg/L × 4.186 kJ/kg·K × (T4 − T3)`
  - 비열·밀도는 근사값입니다. 15~40℃에서 오차는 1% 이내입니다.
- 누적 열량은 표본 사이를 **사다리꼴 적분**합니다. 아래 구간은 적분에서 빼고, 뺀 시간을 화면에 표시합니다.
  - INVALID 구간
  - 표본 간격이 기준을 넘는 구간
- 데이터 상태는 세 가지입니다.

| 상태 | 뜻 | 붙는 조건 |
|---|---|---|
| `SIMULATED` | 가상 데이터 | 내부 시뮬레이터에서 나온 값. 화면에 "실측 아님"을 고정 표시합니다. |
| `MEASURED` | 실제 센서 값 | Web Serial 어댑터로 받은 값에만 붙습니다. 출처가 없으면 SIMULATED로 처리합니다. |
| `INVALID` | 측정 불가 | 센서 누락·범위 밖·음수 유량·ON에서 T4<T3·장치 오류·JSON 형식 오류. 열출력을 0으로 바꾸지 않고 `—`로 표시합니다. |

- 경고는 판정을 바꾸지 않고 따로 띄웁니다.
  - 열수지 불일치: 급수가 얻은 열과 배수가 잃은 열의 차이가 25%를 넘을 때
  - BYPASS에서 급수 온도가 0.3℃ 넘게 변할 때
- BYPASS에서 생긴 열출력은 회수량에 넣지 않습니다.
- 경제성 결과는 모두 `ESTIMATED`입니다.
  - 지역난방은 배출계수가 확인되지 않아 탄소 감소량을 계산하지 않습니다.
  - 순절감액이 0 이하이거나 설치비·단가가 없으면 회수기간을 "산정 불가"로 둡니다.

## 센서 연결 (HEAT LOOP Sense)

1. `firmware/heatloop_sense/heatloop_sense.ino`를 ESP32에 올립니다.
   - 필요한 라이브러리: OneWire, DallasTemperature
   - 처음 실행할 때 DS18B20 주소를 확인해 T1~T4 위치를 고정합니다.
   - 유량계 K값은 보정합니다. 1분 동안 받은 물의 무게로 맞춥니다.
2. ESP32를 USB로 연결합니다.
3. STEP 02에서 **데이터 → USB 센서 (Web Serial)**를 고르고 포트를 선택합니다.
4. 장치는 115200bps로 1초마다 JSON 한 줄을 보냅니다.
   - 키 이름은 `t1..t4`, `drainFlowLpm`, `coldFlowLpm`, `sensorStatus`를 씁니다.
   - `coldInC`, `warmInC` 같은 기존 명세의 키 이름도 받습니다.

```json
{"deviceId":"HEATLOOP-DEMO-01","t1":35.0,"t2":31.0,"t3":15.0,"t4":20.0,"drainFlowLpm":2.5,"coldFlowLpm":2.0,"sensorStatus":"OK"}
```

## 알려진 제약

- **Web Serial**은 데스크톱 Chrome·Edge 89 이상에서만 동작합니다.
  - Safari·Firefox·모바일 브라우저는 지원하지 않습니다.
  - 지원하지 않는 환경에서는 안내 문구를 띄우고 시뮬레이션 모드로 돌아갑니다.
  - HTTPS(GitHub Pages) 또는 `localhost`에서만 열리고, 포트 선택은 사용자가 버튼을 눌러야 합니다.
- **ESP32 Wi-Fi 직접 연결**은 GitHub Pages에서 막힙니다.
  - HTTPS 페이지에서 `http://192.168.x.x`나 `ws://` 주소로 요청하면 브라우저가 혼합 콘텐츠로 차단합니다. 사설망 접근 제한과 CORS 문제도 있습니다.
  - Wi-Fi로 받으려면 노트북에서 `localhost`로 열고 ESP32에 CORS 헤더를 설정해야 합니다. 이 방식은 아직 구현하지 않았습니다.
  - 현장 시연은 USB 연결을 권장합니다.
- 시뮬레이터의 유효도 ε 0.40과 진단의 보수 가정 ε 0.35는 HEAT LOOP 실측값이 아닙니다.
- 설치비, 에너지 단가, 유지관리비, 급수 온도는 모두 가정치입니다. 실제 견적과 고지서 값으로 바꿔야 합니다.
- 제품 그림은 설명용 렌더링입니다. 치수와 구조는 정하지 않았습니다.

## GitHub Pages 배포

1. 이 폴더를 저장소 루트로 올립니다. `.nojekyll`은 필요 없습니다(밑줄로 시작하는 파일이 없음).
2. Settings → Pages → Branch `main` / `(root)`를 선택합니다.
3. `https://<계정>.github.io/<저장소>/`에서 확인합니다. 경로가 모두 상대 경로라서 하위 경로에서도 동작합니다.

## 참고한 공개 프로젝트 (구조만 참고, 코드 복사 없음)

| 프로젝트 | 참고한 점 |
|---|---|
| [vogler/FlowMeter](https://github.com/vogler/FlowMeter) | 샤워 유량·온도를 1초마다 기록하고, 흐름이 30초 끊기면 1회 사용량을 정리하는 방식 |
| [davet2001/dhw_monitor](https://github.com/davet2001/dhw_monitor) | 온수 상태를 빨강~파랑 그림으로 보여주는 시각화 아이디어 |
| [cse-sim DHWHEATREC](https://cse-sim.github.io/cse/input-data/dhwheatrec) | 배수열 회수 모델 변수: 정격 유효도, 배수관 온도 손실, 예열수를 급탕기·샤워로 보내는 배관 구성 |
| [csiiiv/esp32-device-manager](https://github.com/csiiiv/esp32-device-manager), [ptai-eng/OpenSerial-Studio](https://github.com/ptai-eng/OpenSerial-Studio) | GitHub Pages + Web Serial + 줄 단위 JSON 구조와 브라우저 지원 제약 |
