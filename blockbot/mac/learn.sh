#!/usr/bin/env bash
# BlockBot 패턴 학습: 폰 로그 가져오기 → 실제 블록 출현 패턴 학습 → (선택) 가중치 튜닝 → 폰에 올리기
# 사용: 폰을 USB로 연결한 뒤
#   bash mac/learn.sh          블록 분포만 학습 (1~2분)
#   bash mac/learn.sh --tune   가중치 자가대국 튜닝까지 (약 20분, 맥북을 켜 두세요)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_ID="com.blockbot.app"
TUNE="${1:-}"
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✔ %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31m✖ %s\033[0m\n" "$*"; exit 1; }

# Java / adb: run.sh가 찾아 둔 설정을 재사용
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
[[ -x "$ADB" ]] || die "adb를 찾지 못했습니다. 먼저 bash mac/run.sh 를 한 번 실행하세요."

step "1/4 폰에서 로그 가져오기"
"$ADB" get-state >/dev/null 2>&1 || die "폰이 연결되지 않았습니다 (케이블·USB 디버깅 확인)."
mkdir -p logs-from-phone
"$ADB" pull /sdcard/Android/data/$APP_ID/files/logs/. logs-from-phone/ >/dev/null
ok "$(ls logs-from-phone/*.jsonl 2>/dev/null | wc -l | tr -d ' ')개 세션 로그"

step "2/4 실제 블록 출현 패턴 학습"
sh ./gradlew --console=plain -q :core:learn -PlearnArgs="logs-from-phone model-out"

if [[ "$TUNE" == "--tune" ]]; then
  step "3/4 평가 가중치 튜닝 (자가대국, 약 20분)"
  sh ./gradlew --console=plain -q :core:tune -PtuneArgs="model-out/distribution.txt model-out 20"
else
  step "3/4 가중치 튜닝 건너뜀 (원하면: bash mac/learn.sh --tune)"
fi

step "4/4 폰에 학습 결과 올리기"
DEST="/sdcard/Android/data/$APP_ID/files/model"
"$ADB" shell mkdir -p "$DEST" >/dev/null 2>&1 || true
PUSHED=0
for f in model-out/distribution.txt model-out/weights.txt; do
  [[ -f "$f" ]] || continue
  if "$ADB" push "$f" "$DEST/" >/dev/null 2>&1; then
    PUSHED=$((PUSHED + 1))
  else
    # 일부 기기는 Android/data 쓰기를 막음 → 앱 내부 저장소로 (디버그 빌드라 run-as 가능)
    "$ADB" push "$f" /data/local/tmp/ >/dev/null
    "$ADB" shell run-as "$APP_ID" sh -c "'mkdir -p files/model && cp /data/local/tmp/$(basename "$f") files/model/'"
    PUSHED=$((PUSHED + 1))
  fi
done
ok "$PUSHED개 파일 올림"
printf "\n\033[1;32m완료!\033[0m 게임에서 패널의 [정지] → [힌트](또는 [자동])를 누르면 학습 결과가 적용됩니다.\n"
printf "많이 플레이할수록 정확해집니다. 몇 판마다 다시 실행해 주세요.\n"
