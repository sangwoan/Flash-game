# blockbot

8×8 블록 퍼즐 자동 플레이/힌트 안드로이드 앱 (오버레이 + 접근성 서비스).

## 모듈
- `core/` — 순수 Kotlin. 안드로이드 의존성 없음 → 폰 없이 JVM에서 테스트.
  - `Board`, `Piece`, `Pieces` — 비트보드, 블록 모양, 표준 블록 목록
  - `Rules` — 배치·줄 클리어·콤보 상태. 콤보 유지 방식 `SLIDING`(3수 안에 다시 지우기) / `PER_ROUND`(라운드마다 1회 이상) 선택
  - `ScoreModel` — 게임 점수 모델: 칸당 1 + 10×T(줄 수) + 10×줄 수×직전 콤보 (+퍼펙트). 계수는 실측으로 보정 예정
  - `Weights`, `Evaluator` — 최종 보드 평가(생존성 + 콤보 이어가기). 보드 건강 항목은 콤보가 클수록 가중
  - `Solver` — 남은 블록의 모든 순서 × 위치 전수 탐색. 순위: 퍼펙트 > 생존(놓은 개수) > 점수
  - `Simulator` — 무작위 블록 자가 대국으로 정책 비교
- `app/` — 안드로이드 앱 (예정)

## 진행
1. [x] 솔버 + 단위 테스트
2. [ ] 인식(vision) + 샘플 스크린샷 테스트
3. [ ] 접근성 제스처 시험 앱 (게임이 드래그를 받는지 확인)
4. [ ] 오버레이 힌트 모드
5. [ ] 자동 플레이 모드 (토글)

## 테스트 / 시뮬레이션
```
./gradlew :core:test
./gradlew :core:simulate -PsimArgs="게임수 최대라운드 시드 SLIDING|PER_ROUND"
./gradlew :core:simulate -PsimArgs="60 300 23 SLIDING sweep 0.05,0.1,0.2"   # healthPerStreak 비교
```
