# 2교시 리허설

AI 해커톤 1차 예선 2교시(보조자료 + AI 어시스턴트 활용 단답형·객관식) 연습 앱.

- 4개 문제 세트(동아리 간식 수요조사 · AI 구독 비용 최적화 · 웨이퍼 검사 로그 · 해외 출장비 정산), 세트당 4문항
- 시드마다 새 데이터를 만들고 정답은 코드로 계산 (`src/generators.js`)
- AI 질문 횟수 제한(문항 수 × 2~3), 질문 간 쿨다운, 요청당 토큰 한도, 문항별 대화와 재첨부
- 제출 후 문항별 해설, 내가 보낸 프롬프트, 4D 기준 프롬프트 코칭

AI 어시스턴트는 claude.ai 아티팩트의 `sample` 기능(Claude)으로 동작한다. 다른 곳에서 열면 AI 없이 자료만으로 풀 수 있다.

## 빌드

```
node build.js   # src/shell.html + generators.js + app.js → index.html
```

## 2차 예선 모의 체험 키트 (`stage2-mock/`)

통근버스 좌석 배정 서비스를 코딩 에이전트와 함께 만들어 보는 모의 과제와 채점기. 시작은 [`stage2-mock/START_HERE.md`](stage2-mock/START_HERE.md).
