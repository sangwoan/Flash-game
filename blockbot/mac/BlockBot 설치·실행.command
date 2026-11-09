#!/bin/bash
# Finder에서 더블클릭하면 터미널이 열리며 run.sh를 실행합니다.
cd "$(dirname "$0")" && bash ./run.sh
echo; read -r -p "엔터를 누르면 창이 닫힙니다… " _
