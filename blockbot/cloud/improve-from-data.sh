#!/usr/bin/env bash
# 클라우드 개선 루프 (예약 실행용): blockbot-data 브랜치의 폰 로그로 학습·분석·튜닝·검증 →
# 결과(model/distribution.txt, weights.txt, report.txt)를 같은 브랜치에 올린다. 새 로그가 없으면 아무것도 안 함.
# 사용: blockbot 폴더에서  bash cloud/improve-from-data.sh [튜닝 분, 기본 20]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
MIN="${1:-20}"
DATA="$REPO/../.blockbot-data-cloud"
cd "$REPO"
git fetch -q origin blockbot-data || { echo "blockbot-data 브랜치가 아직 없습니다 (맥에서 mac/sync.sh를 한 번 실행해야 생김)."; exit 0; }
if [[ -e "$DATA" ]]; then git worktree remove --force "$DATA" 2>/dev/null || rm -rf "$DATA"; git worktree prune; fi
git worktree add -q -B blockbot-data-cloud "$DATA" origin/blockbot-data
cd "$DATA"
shopt -s nullglob
LOGS=(logs/*.jsonl.gz)
[[ ${#LOGS[@]} -gt 0 ]] || { echo "로그가 없습니다."; exit 0; }
STAMP="$(ls -l logs | sha1sum | cut -c1-12)"
if [[ -f model/stamp && "$(cat model/stamp)" == "$STAMP" ]]; then echo "새 로그 없음 — 건너뜀"; exit 0; fi
mkdir -p model
# 이전 결과(가중치)에서 이어서 개선
mkdir -p "$ROOT/model-cloud"
if [[ -f model/weights.txt ]]; then cp model/weights.txt "$ROOT/model-cloud/weights.txt"; fi
if [[ -n "${BLOCKBOT_DRYRUN:-}" ]]; then   # 흐름 점검용: 계산 생략
  echo "friendly 0.9" > "$ROOT/model-cloud/distribution.txt"; echo "(dry run)" > "$ROOT/model-cloud/report.txt"
else
  (cd "$ROOT" && sh ./gradlew --console=plain -q :core:improve -PimproveArgs="$DATA/logs $ROOT/model-cloud $MIN")
fi
for f in distribution.txt weights.txt report.txt; do if [[ -f "$ROOT/model-cloud/$f" ]]; then cp "$ROOT/model-cloud/$f" model/; fi; done
echo "$STAMP" > model/stamp
date -u +"%Y-%m-%dT%H:%MZ" > model/updated_at
git add model
git -c user.name="BlockBot cloud" -c user.email="blockbot@users.noreply.github.com" commit -q -m "model: improve from ${#LOGS[@]} session logs" || { echo "변경 없음"; exit 0; }
git push -q origin HEAD:blockbot-data
echo "올림: model/ (blockbot-data 브랜치)"
sed -n '1,60p' model/report.txt
