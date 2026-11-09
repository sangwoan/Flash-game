#!/usr/bin/env bash
# 동기화: 폰 로그 → GitHub의 blockbot-data 브랜치에 올림 (Claude가 읽고 분석·개선할 수 있게)
#         + 클라우드가 만든 최신 개선 모델을 받아 폰에 적용
# 사용: 폰을 USB로 연결한 뒤  bash mac/sync.sh
# 올리는 것: 게임 기록(JSONL: 보드·블록·수·점수 추정)과 학습 결과(텍스트). 스크린샷은 올리지 않음(저장소가 공개).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
APP_ID="com.blockbot.app"
DATA="$REPO/../.blockbot-data"
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✔ %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31m✖ %s\033[0m\n" "$*"; exit 1; }
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' "$ROOT/local.properties" 2>/dev/null || echo "$HOME/Library/Android/sdk")}"
ADB="$SDK/platform-tools/adb"

step "1/4 폰에서 로그 가져오기"
"$ADB" get-state >/dev/null 2>&1 || die "폰이 연결되지 않았습니다."
mkdir -p "$ROOT/logs-from-phone"
"$ADB" pull /sdcard/Android/data/$APP_ID/files/logs/. "$ROOT/logs-from-phone/" >/dev/null
ok "$(ls "$ROOT"/logs-from-phone/*.jsonl 2>/dev/null | wc -l | tr -d ' ')개 세션"

step "2/4 데이터 브랜치 준비 (blockbot-data)"
cd "$REPO"
git fetch -q origin blockbot-data 2>/dev/null || true
if [[ ! -d "$DATA/.git" && ! -f "$DATA/.git" ]]; then
  if git show-ref -q --verify refs/remotes/origin/blockbot-data; then
    git worktree add -q -B blockbot-data "$DATA" origin/blockbot-data
  else
    # 코드와 섞이지 않게 "빈" 브랜치로 시작 (데이터만 담음)
    git worktree add -q --detach "$DATA"
    (
      cd "$DATA"
      git switch -q --orphan blockbot-data 2>/dev/null || { git checkout -q --orphan blockbot-data && git rm -rfq . ; }
      git clean -fdxq
      printf "# BlockBot 데이터 브랜치\n\n- logs/: 폰 게임 기록 (gzip JSONL)\n- mac-model/: 맥에서 학습한 결과\n- model/: 클라우드 개선 루프가 만든 최신 모델과 리포트\n" > README.md
    )
  fi
fi
# 안전장치: 데이터 브랜치에 코드가 섞여 있으면 중단
if [[ -e "$DATA/blockbot" || -e "$DATA/index.html" ]]; then
  die "데이터 폴더($DATA)에 코드 파일이 섞여 있습니다. 폴더를 지우고(git worktree remove --force \"$DATA\") 다시 실행하세요."
fi
cd "$DATA"
git pull -q --rebase origin blockbot-data 2>/dev/null || true

step "3/4 로그·학습 결과 올리기"
mkdir -p logs mac-model
for f in "$ROOT"/logs-from-phone/*.jsonl; do
  [[ -f "$f" ]] || continue
  gz="logs/$(basename "$f").gz"
  # 바뀐 세션만 다시 압축
  if [[ ! -f "$gz" || "$f" -nt "$gz" ]]; then gzip -9 -n -c "$f" > "$gz"; fi
done
for f in distribution.txt weights.txt report.txt; do if [[ -f "$ROOT/model-out/$f" ]]; then cp "$ROOT/model-out/$f" mac-model/; fi; done
"$ADB" shell getprop ro.product.model | tr -d '\r' > device.txt
git add -A
if git diff --cached --quiet; then ok "새로 올릴 것 없음"
else
  git commit -q -m "data: sync $(date +%Y-%m-%d_%H:%M)"
  if git push -q origin blockbot-data 2>/dev/null; then ok "GitHub에 올림 (blockbot-data 브랜치)"
  else
    die "GitHub 업로드 실패 (로그인 필요). 한 번만 설정하세요:
   brew install gh && gh auth login   (GitHub.com → HTTPS → 브라우저로 로그인)
   gh auth setup-git
 그 다음 다시: bash mac/sync.sh"
  fi
fi

step "4/4 클라우드 개선 결과 받아 폰에 적용"
if [[ -f model/weights.txt || -f model/distribution.txt ]]; then
  DEST="/sdcard/Android/data/$APP_ID/files/model"
  "$ADB" shell mkdir -p "$DEST" >/dev/null 2>&1 || true
  for f in model/distribution.txt model/weights.txt; do
    [[ -f "$f" ]] || continue
    "$ADB" push "$f" "$DEST/" >/dev/null 2>&1 || {
      "$ADB" push "$f" /data/local/tmp/ >/dev/null
      "$ADB" shell run-as "$APP_ID" sh -c "'mkdir -p files/model && cp /data/local/tmp/$(basename "$f") files/model/'"
    }
    cp "$f" "$ROOT/model-out/" 2>/dev/null || true
  done
  ok "적용함 ($(git log -1 --format=%cd --date=format:'%m-%d %H:%M' -- model) 클라우드 결과)"
  if [[ -f model/report.txt ]]; then echo; sed -n '1,40p' model/report.txt; fi
else
  ok "아직 클라우드 개선 결과 없음 (하루 한 번 자동 실행)"
fi
printf "\n\033[1;32m완료!\033[0m 게임에서 [정지] → [힌트]를 누르면 최신 모델이 적용됩니다.\n"
