#!/usr/bin/env bash
# Nasadí aktuální stav kokpitu na web (GitHub Pages).
# Data zakázek se tímhle netýká — ta žijí v privátním datovém repu klienta.
set -euo pipefail

cd "$(dirname "$0")"

if grep -q '"studio": null' config.js; then
  echo "config.js nemá nastavený přístup. Spusť nejdřív:  python3 nastav_pristup.py"
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "Nic se nezměnilo."
  exit 0
fi

git commit -m "${1:-Úprava kokpitu}"
git push origin main

# https://github.com/vlastnik/repo(.git) → https://vlastnik.github.io/repo/
adresa=$(git remote get-url origin | sed -E 's#^(https://github.com/|git@github.com:)##; s#\.git$##')
echo
echo "Nasazeno. Za chvíli bude živé na:"
echo "  https://${adresa%%/*}.github.io/${adresa#*/}/"
