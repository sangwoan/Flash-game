#!/usr/bin/env bash
# 개선 루프 한 번: 폰 로그 → 블록 패턴 학습 → 실제 게임 분석 → 가중치 튜닝 → 검증 → 폰에 적용 → report.txt
# 사용: 폰을 USB로 연결한 뒤  bash mac/improve.sh [튜닝 분, 기본 20]
# 끝나면 report.txt 내용을 Claude 대화창에 붙여 넣어 주세요 (다음 개선의 근거가 됩니다).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MIN="${1:-20}"
APP_ID="com.blockbot.app"
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31m✖ %s\033[0m\n" "$*"; exit 1; }

java_ok() { [[ -x "$1/bin/java" ]] && "$1/bin/java" -version 2>&1 | grep -m1 'version "' | grep -qE '"(1[7-9]|2[0-4])'; }
if [[ -z "${JAVA_HOME:-}" ]] || ! java_ok "$JAVA_HOME"; then
  for j in "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
           "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" "$(/usr/libexec/java_home -v 17 2>/dev/null || true)"; do
    if [[ -n "$j" ]] && java_ok "$j"; then export JAVA_HOME="$j"; break; fi
  done
fi
[[ -n "${JAVA_HOME:-}" ]] || die "Java를 찾지 못했습니다. 먼저 bash mac/run.sh 를 한 번 실행하세요."
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' "$ROOT/local.properties" 2>/dev/null || echo "$HOME/Library/Android/sdk")}"
ADB="$SDK/platform-tools/adb"

step "1/3 폰에서 로그 가져오기"
"$ADB" get-state >/dev/null 2>&1 || die "폰이 연결되지 않았습니다."
mkdir -p logs-from-phone
"$ADB" pull /sdcard/Android/data/$APP_ID/files/logs/. logs-from-phone/ >/dev/null

step "2/3 학습·분석·튜닝·검증 (약 ${MIN}분 + 검증 몇 분, 맥북을 켜 두세요)"
sh ./gradlew --console=plain -q :core:improve -PimproveArgs="logs-from-phone model-out $MIN"

step "3/3 폰에 적용"
DEST="/sdcard/Android/data/$APP_ID/files/model"
"$ADB" shell mkdir -p "$DEST" >/dev/null 2>&1 || true
for f in model-out/distribution.txt model-out/weights.txt; do
  [[ -f "$f" ]] || continue
  "$ADB" push "$f" "$DEST/" >/dev/null 2>&1 || {
    "$ADB" push "$f" /data/local/tmp/ >/dev/null
    "$ADB" shell run-as "$APP_ID" sh -c "'mkdir -p files/model && cp /data/local/tmp/$(basename "$f") files/model/'"
  }
done
printf "\n\033[1;32m완료!\033[0m 게임에서 [정지] → [힌트]를 누르면 적용됩니다.\n"
printf "리포트: %s\n이 파일 내용을 Claude 대화창에 붙여 넣어 주세요.\n" "$ROOT/model-out/report.txt"
command -v open >/dev/null && open "$ROOT/model-out/report.txt" || true
