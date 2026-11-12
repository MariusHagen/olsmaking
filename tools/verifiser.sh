#!/usr/bin/env bash
# Kjører alle testene, lokalt og i workflowen før publisering. Ingen avhengigheter utover node og python3.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Utvalget (node)"
node --test tests/*.test.mjs

echo "== Hentingen (python)"
python3 -m unittest discover -s tests -t . -p 'test_*.py'
