#!/usr/bin/env bash
export PATH="$HOME/.npm-global/bin:$PATH"

lt --port 3000 | head -1 &
lt --port 4000 | head -1 &

echo 'tunnels opened'

wait