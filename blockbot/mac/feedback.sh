#!/usr/bin/env bash
# 피드백 모으기: 폰 로그를 가져와 최근 세션의 📷 신고·드래그 실패·멈춤 스크린샷과 요약을 바탕화면 폴더에 모은다.
# 그 폴더의 사진과 summary.txt를 Claude 대화창에 끌어다 놓으면 된다. (저장소가 공개라 GitHub에는 올리지 않음)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/mac/pull-logs.sh" >/dev/null
LOGS="$ROOT/logs-from-phone"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$HOME/Desktop/blockbot-feedback-$TS"
mkdir -p "$OUT"
# 최근 세션 3개
SESSIONS=$(ls -1t "$LOGS"/session_*.jsonl 2>/dev/null | head -3)
[[ -n "$SESSIONS" ]] || { echo "로그가 없습니다. 폰 연결·앱 실행 여부를 확인하세요."; exit 1; }
for s in $SESSIONS; do
  stamp="$(basename "$s" .jsonl | sed 's/^session_//')"
  dir="$LOGS/screens_$stamp"
  [[ -d "$dir" ]] && find "$dir" -name '*.png' \( -name '*report*' -o -name '*drop_rejected*' -o -name '*drag_hold*' -o -name '*stuck*' -o -name '*resync*' \) -exec cp {} "$OUT/" \;
done
{
  echo "# BlockBot 피드백 요약 ($TS)"
  for s in $SESSIONS; do
    echo; echo "## $(basename "$s")"
    echo "자동 이동 $(grep -c '"type":"move"' "$s" || true)회, 드래그 학습 $(grep -c '"type":"drag_learn"' "$s" || true)회 (적중 $(grep -c '"hit":true' "$s" || true)), 드롭 거부 $(grep -c '"type":"drop_rejected"' "$s" || true)회, 📷 $(grep -c '"type":"report"' "$s" || true)회"
    grep -E '"type":"(report|drop_rejected|drag_learn|move|stuck|models|geometry|error)"' "$s" | tail -60
  done
} > "$OUT/summary.txt"
echo "모았습니다 → $OUT ($(ls "$OUT" | wc -l | tr -d ' ')개 파일)"
echo "이 폴더의 사진과 summary.txt를 Claude 대화창에 끌어다 놓아 주세요."
command -v open >/dev/null && open "$OUT" || true
