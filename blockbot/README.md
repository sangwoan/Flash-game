# blockbot

8×8 블록 퍼즐 자동 플레이/힌트 안드로이드 앱 (오버레이 + 접근성 서비스).

**설치·실행 방법은 [SETUP.md](SETUP.md)** — 폰을 USB로 연결하고 `bash mac/run.sh` 한 줄.

## 모듈
- `core/` — 순수 Kotlin. 안드로이드 의존성 없음 → 폰 없이 JVM에서 테스트.
  - `Board`, `Piece`, `Pieces` — 비트보드, 블록 모양, 표준 블록 목록
  - `Rules` — 배치·줄 클리어·콤보 상태. 콤보 유지 방식 `SLIDING`(3수 안에 다시 지우기) / `PER_ROUND`(라운드마다 1회 이상) 선택
  - `ScoreModel` — 게임 점수 모델: 칸당 1 + 10×T(줄 수) + 10×줄 수×직전 콤보 (+퍼펙트). 계수는 실측으로 보정 예정
  - `Weights`, `Evaluator` — 최종 보드 평가(생존성 + 콤보 이어가기). 보드 건강 항목은 콤보가 클수록 가중
  - `Solver` — 남은 블록의 모든 순서 × 위치 전수 탐색. 순위: 퍼펙트 > 생존(놓은 개수) > 점수
  - `Simulator` — 무작위 블록 자가 대국으로 정책 비교
  - `Vision` — 스크린샷에서 보드 격자 자동 검출(테마·해상도 무관), 8×8 점유, 트레이 블록 모양
  - `GameTracker` — 화면 변화에서 어떤 블록을 어디 놓았는지 역추적해 콤보 상태 유지
  - `DragPlanner` — 드래그 좌표 계산과 착지 오차 자동 학습
- `app/` — 안드로이드 앱: 접근성 서비스 하나로 캡처·오버레이(힌트)·드래그(자동). 로그는 폰에 JSONL로 저장
- `mac/` — `run.sh`(도구 설치→빌드→설치→접근성 켜기→실행), `pull-logs.sh`, `watch.sh`

## 진행
1. [x] 솔버 + 단위 테스트
2. [x] 인식(vision) + 실제 스크린샷 테스트
3. [x] 앱: 접근성 캡처·제스처 (실기기 확인 필요)
4. [x] 오버레이 힌트 모드
5. [x] 자동 플레이 모드 (토글, 드래그 보정 자동 학습)

## 테스트 / 시뮬레이션
```
./gradlew :core:test
./gradlew :core:simulate -PsimArgs="게임수 최대라운드 시드 SLIDING|PER_ROUND"
./gradlew :core:simulate -PsimArgs="60 300 23 SLIDING sweep 0.05,0.1,0.2"   # healthPerStreak 비교
```
