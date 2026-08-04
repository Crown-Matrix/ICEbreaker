#!/usr/bin/env bash
set -euo pipefail

find . \
  \( \
    -name '.git' -o \
    -name 'node_modules' -o \
    -name 'imgs' -o \
    -name 'README-CONTENT' \
  \) -prune -o \
  -type f -print \
| sed 's|^\./||' \
| sort \
> personal/paths.txt