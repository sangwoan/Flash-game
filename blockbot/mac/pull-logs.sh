#!/usr/bin/env bash
# 폰의 BlockBot 로그(JSONL)와 문제 상황 스크린샷을 맥으로 가져온다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' "$ROOT/local.properties" 2>/dev/null || echo "$HOME/Library/Android/sdk")}"
ADB="$SDK/platform-tools/adb"
DEST="$ROOT/logs-from-phone"
mkdir -p "$DEST"
"$ADB" pull /sdcard/Android/data/com.blockbot.app/files/logs/. "$DEST/"
echo "가져옴 → $DEST"
ls -1t "$DEST" | head
