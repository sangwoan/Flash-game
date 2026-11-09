#!/usr/bin/env bash
# 실시간 로그 보기 (Ctrl+C로 종료). 문제가 생겼을 때 이 화면을 캡처해 주면 원인 파악이 빠릅니다.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' "$ROOT/local.properties" 2>/dev/null || echo "$HOME/Library/Android/sdk")}"
"$SDK/platform-tools/adb" logcat -v time -s BlockBot:D AndroidRuntime:E
