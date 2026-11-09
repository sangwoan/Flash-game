#!/usr/bin/env bash
# BlockBot — 맥에서 한 번에: (필요하면) 도구 설치 → 폰 확인 → 앱 빌드·설치 → 접근성 켜기 → 실행
# 사용: 폰을 USB로 연결한 뒤  bash mac/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_ID="com.blockbot.app"
SVC="$APP_ID/$APP_ID.BotService"
WAIT_SECS="${BLOCKBOT_WAIT_SECS:-120}"

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✔ %s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }
die()  { printf "\n\033[1;31m✖ %s\033[0m\n" "$*"; exit 1; }
have_brew() { command -v brew >/dev/null 2>&1; }

# ── 1. Java 17~24 (Gradle 8.14 실행용) ─────────────────────────────
step "1/5 Java 확인"
java_major() { "$1/bin/java" -version 2>&1 | grep -m1 'version "' | sed -E 's/.*version "([0-9]+).*/\1/'; }
pick_java() {
  local cands=("${JAVA_HOME:-}" "/Applications/Android Studio.app/Contents/jbr/Contents/Home")
  if [[ -x /usr/libexec/java_home ]]; then
    for v in 21 17; do cands+=("$(/usr/libexec/java_home -v "$v" 2>/dev/null || true)"); done
  fi
  if command -v java >/dev/null 2>&1; then
    cands+=("$(java -XshowSettings:properties -version 2>&1 | awk -F'= ' '/java.home/{print $2; exit}')")
  fi
  for j in "${cands[@]}"; do
    [[ -n "$j" && -x "$j/bin/java" ]] || continue
    local v; v="$(java_major "$j")"
    if [[ "$v" =~ ^[0-9]+$ && "$v" -ge 17 && "$v" -le 24 ]]; then echo "$j"; return 0; fi
  done
  return 1
}
if ! JH="$(pick_java)"; then
  have_brew || die "Java 17~21이 없습니다. Homebrew를 먼저 설치하고 다시 실행하세요: https://brew.sh"
  info "Homebrew로 Java 21(Temurin) 설치 중… (맥 비밀번호를 물을 수 있습니다)"
  brew install --cask temurin@21
  JH="$(pick_java)" || die "Java를 설치했지만 찾지 못했습니다. 터미널을 새로 열고 다시 실행해 보세요."
fi
export JAVA_HOME="$JH"
ok "Java $(java_major "$JH") — $JH"

# ── 2. Android SDK (adb 포함) ──────────────────────────────────────
step "2/5 Android SDK 확인"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
sdk_ready() { [[ -x "$SDK/platform-tools/adb" && -d "$SDK/platforms/android-35" && -d "$SDK/build-tools/35.0.0" ]]; }
if ! sdk_ready; then
  SM=""
  for s in "$SDK/cmdline-tools/latest/bin/sdkmanager" "$(command -v sdkmanager 2>/dev/null || true)"; do
    if [[ -n "$s" && -x "$s" ]]; then SM="$s"; break; fi
  done
  if [[ -z "$SM" ]]; then
    have_brew || die "Android SDK가 없습니다. Homebrew(https://brew.sh) 또는 Android Studio를 설치한 뒤 다시 실행하세요."
    info "Homebrew로 Android command-line tools 설치 중…"
    brew install --cask android-commandlinetools
    SM="$(command -v sdkmanager)" || die "sdkmanager를 찾지 못했습니다."
  fi
  mkdir -p "$SDK"
  info "SDK 구성요소 설치 중 (약 300MB, 몇 분 걸립니다)…"
  yes | "$SM" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
  "$SM" --sdk_root="$SDK" "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null
  sdk_ready || die "SDK 설치가 끝나지 않았습니다: $SDK"
fi
echo "sdk.dir=$SDK" > "$ROOT/local.properties"
export ANDROID_HOME="$SDK"
ADB="$SDK/platform-tools/adb"
ok "SDK — $SDK"

# ── 3. 폰 연결 ─────────────────────────────────────────────────────
step "3/5 폰 연결 확인"
"$ADB" start-server >/dev/null 2>&1 || true
SERIAL=""
for ((i = 0; i < WAIT_SECS / 2; i++)); do
  SERIAL="$("$ADB" devices | awk -F'\t' 'NR>1 && $2=="device"{print $1; exit}')"
  [[ -n "$SERIAL" ]] && break
  if "$ADB" devices | grep -q unauthorized; then
    msg="폰 화면의 'USB 디버깅을 허용하시겠습니까?'에서 [허용]을 눌러 주세요 (이 컴퓨터에서 항상 허용 체크)"
  else
    msg="폰이 안 보입니다. 데이터용 USB 케이블로 연결하고, 개발자 옵션 → USB 디버깅을 켜 주세요"
  fi
  (( i % 10 == 0 )) && info "… $msg"
  sleep 2
done
[[ -n "$SERIAL" ]] || die "폰을 찾지 못했습니다. 케이블·USB 디버깅·허용 팝업을 확인하고 다시 실행하세요."
export ANDROID_SERIAL="$SERIAL"
MODEL="$("$ADB" shell getprop ro.product.model | tr -d '\r')"
API="$("$ADB" shell getprop ro.build.version.sdk | tr -d '\r')"
ok "연결됨: $MODEL (Android API $API)"
[[ "$API" -ge 30 ]] || die "Android 11 이상이 필요합니다 (현재 API $API)."

# ── 4. 빌드·설치 ───────────────────────────────────────────────────
step "4/5 앱 빌드·설치 (첫 실행은 Gradle 내려받기로 3~5분 걸릴 수 있음)"
sh ./gradlew --console=plain -q :app:assembleDebug
APK="$ROOT/app/build/outputs/apk/debug/app-debug.apk"
[[ -f "$APK" ]] || die "APK가 만들어지지 않았습니다."
if ! OUT="$("$ADB" install -r -g "$APK" 2>&1)"; then
  if echo "$OUT" | grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE"; then
    info "다른 컴퓨터에서 설치한 이전 버전이 있어 지우고 다시 설치합니다 (앱 설정 초기화)"
    "$ADB" uninstall "$APP_ID" >/dev/null || true
    "$ADB" install -g "$APK" >/dev/null
  else
    echo "$OUT"
    die "설치 실패. 갤럭시 '자동 차단'이 켜져 있으면 끄고 다시 실행하세요 (설정 → 보안 및 개인정보 보호 → 자동 차단)."
  fi
fi
ok "설치 완료"

# ── 5. 접근성 서비스 켜기 + 실행 ────────────────────────────────────
step "5/5 접근성 서비스 켜기 + 앱 실행"
CUR="$("$ADB" shell settings get secure enabled_accessibility_services | tr -d '\r')"
[[ "$CUR" == "null" ]] && CUR=""
OTHERS="$(echo "$CUR" | tr ':' '\n' | grep -v -F "$SVC" | grep -v '^$' | paste -sd: - || true)"
# 다른 접근성 앱 설정은 그대로 두고 BlockBot만 껐다 켬(재설치 후 다시 연결되도록)
"$ADB" shell settings put secure enabled_accessibility_services "${OTHERS:-null}" >/dev/null || true
sleep 1
NEW="${OTHERS:+$OTHERS:}$SVC"
"$ADB" shell settings put secure enabled_accessibility_services "$NEW"
"$ADB" shell settings put secure accessibility_enabled 1
sleep 1
if "$ADB" shell settings get secure enabled_accessibility_services | tr -d '\r' | grep -q -F "$SVC"; then
  ok "BlockBot 접근성 서비스 켜짐"
else
  info "자동으로 켜지지 않았습니다. 폰에서: 설정 → 접근성 → 설치된 앱 → BlockBot → 켜기"
fi
"$ADB" shell am start -n "$APP_ID/.MainActivity" >/dev/null
ok "BlockBot 설정 화면을 폰에 띄웠습니다"

GAME="$("$ADB" shell pm list packages | tr -d '\r' | sed 's/^package://' | grep -i -E 'block' | grep -v -F "$APP_ID" | head -1 || true)"
if [[ -n "$GAME" ]]; then
  info "게임으로 보이는 앱: $GAME — 실행합니다"
  "$ADB" shell monkey -p "$GAME" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
fi

printf "\n\033[1;32m완료!\033[0m 폰에서 게임 화면 위쪽에 [힌트][자동][정지] 패널이 보이면 [힌트]부터 눌러 보세요.\n"
printf "케이블은 이제 뽑아도 됩니다. 로그 가져오기: bash mac/pull-logs.sh\n"
