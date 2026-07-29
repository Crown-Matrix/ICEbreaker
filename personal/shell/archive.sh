#!/usr/bin/env bash

set -euo pipefail

rm archive.zip || true

find . \
  -type f \
  ! -name ".env" \
  ! -path "*/node_modules/*" \
  ! -path "*/README-CONTENT/gameplay-vid/*" \
  ! -path "*/imgs/source-examples/*" \
  -print |
zip archive.zip -@