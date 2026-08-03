#!/usr/bin/env bash


BASE_URL="${1:-http://localhost:3000}"

BURST_SIZE="${BURST_SIZE:-50}"             # must exceed high-cost short-term (45)
STATIC_BURST_SIZE="${STATIC_BURST_SIZE:-800}"  # must exceed low-cost short-term (750)
SKIP_STATIC="${SKIP_STATIC:-false}"
PARALLEL_JOBS="${PARALLEL_JOBS:-10}"
CURL_TIMEOUT=5

SHORT_WINDOW_SECS=16   # resets high-cost short-term window (15 s)
LOW_WINDOW_SECS=31     # resets low-cost  short-term window (30 s)

# ANSI colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

PASS=0; FAIL=0
declare -a FAILED_ENDPOINTS=()

# core burst helper
# burst_request BURST METHOD URL [BODY]
# Prints "RATE_LIMITED <count>" or "UNPROTECTED <code-summary>"

burst_request() {
  local burst="$1" method="$2" url="$3" body="${4:-}"
  local tmpdir; tmpdir="$(mktemp -d)"
  local -a pids=()

  for i in $(seq 1 "$burst"); do
    {
      if [[ -n "$body" ]]; then
        curl -s -o /dev/null -w "%{http_code}\n" \
          -X "$method" -H "Content-Type: application/json" \
          --max-time "$CURL_TIMEOUT" -d "$body" "$url" 2>/dev/null
      else
        curl -s -o /dev/null -w "%{http_code}\n" \
          -X "$method" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null
      fi
    } >> "${tmpdir}/codes" &
    pids+=($!)
    if (( i % PARALLEL_JOBS == 0 )); then
      for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null; done; pids=()
    fi
  done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null; done

  local codes; codes="$(cat "${tmpdir}/codes" 2>/dev/null)"
  local n429;  n429="$(echo "$codes" | grep -c "429" || true)"
  rm -rf "$tmpdir"

  if (( n429 > 0 )); then
    printf "RATE_LIMITED %s" "$n429"
  else
    local summary
    summary="$(echo "$codes" | sort | uniq -c | sort -rn | tr '\n' ' ' | sed 's/ $//')"
    printf "UNPROTECTED %s" "$summary"
  fi
}

#test runners

# run_test LABEL METHOD PATH [BODY]
# Uses BURST_SIZE; sleeps SHORT_WINDOW_SECS after
run_test() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  printf "  ${DIM}%-44s${RESET} " "${method} ${path}"
  local result; result="$(burst_request "$BURST_SIZE" "$method" "${BASE_URL}${path}" "$body")"
  local status="${result%% *}" detail="${result#* }"
  if [[ "$status" == "RATE_LIMITED" ]]; then
    echo -e "${GREEN}✓  RATE-LIMITED${RESET}  ${DIM}(${detail} × 429)${RESET}  ${label}"
    (( PASS++ ))
  else
    echo -e "${RED}✗  NOT RATE-LIMITED${RESET}  ${DIM}codes: ${detail}${RESET}  ${label}"
    FAILED_ENDPOINTS+=("${method} ${path}")
    (( FAIL++ ))
  fi
  echo -e "  ${DIM}  sleeping ${SHORT_WINDOW_SECS}s…${RESET}"
  sleep "$SHORT_WINDOW_SECS"
}

# run_static_test LABEL METHOD PATH
# Uses STATIC_BURST_SIZE; sleeps LOW_WINDOW_SECS after
run_static_test() {
  local label="$1" method="$2" path="$3"
  printf "  ${DIM}%-44s${RESET} " "${method} ${path}"
  local result; result="$(burst_request "$STATIC_BURST_SIZE" "$method" "${BASE_URL}${path}")"
  local status="${result%% *}" detail="${result#* }"
  if [[ "$status" == "RATE_LIMITED" ]]; then
    echo -e "${GREEN}✓  RATE-LIMITED${RESET}  ${DIM}(${detail} × 429)${RESET}  ${label}"
    (( PASS++ ))
  else
    echo -e "${RED}✗  NOT RATE-LIMITED${RESET}  ${DIM}codes: ${detail}${RESET}  ${label}"
    FAILED_ENDPOINTS+=("${method} ${path}")
    (( FAIL++ ))
  fi
  echo -e "  ${DIM}  sleeping ${LOW_WINDOW_SECS}s (low-cost window)…${RESET}"
  sleep "$LOW_WINDOW_SECS"
}

section() { echo -e "\n${CYAN}${BOLD}── $* ──${RESET}"; }

# preflight

echo -e "${BOLD}ICEBreaker — Full Endpoint Rate-Limit Smoke Test${RESET}"
echo "  Target            : ${BASE_URL}"
echo "  API burst size    : ${BURST_SIZE}   (high-cost threshold = 45 req / 15 s)"
echo "  Static burst size : ${STATIC_BURST_SIZE}  (low-cost  threshold = 750 req / 30 s)"
echo "  Static tests      : $([ "$SKIP_STATIC" = "true" ] && echo "SKIPPED" || echo "enabled")"
echo "  Parallel jobs     : ${PARALLEL_JOBS}"
echo -e "  ${YELLOW}⚠  DISABLE_RATE_LIMIT must be unset or 'false'${RESET}"
echo ""

if ! curl -s -o /dev/null -m 3 "${BASE_URL}/"; then
  echo -e "${RED}${BOLD}  ERROR: ${BASE_URL} is not responding.${RESET}"
  exit 1
fi

# static asset routes
# Protected by low-cost limiters only (750 req / 30 s); NOT by high-cost global
# middleware because express.static returns before reaching it.

if [[ "$SKIP_STATIC" != "true" ]]; then
  section "Static Asset Routes  (low-cost limiter: 750 req / 30 s)"
  echo -e "  ${DIM}Note: requires ${STATIC_BURST_SIZE}-request burst to exceed the higher threshold${RESET}"
  # Use a file that won't exist — 404 still triggers the rate limiter
  run_static_test "JS  static tree"   GET  "/js/__rl_smoke_miss__.js"
  run_static_test "CSS static tree"   GET  "/css/__rl_smoke_miss__.css"
  run_static_test "IMG static tree"   GET  "/imgs/__rl_smoke_miss__.png"
else
  echo -e "\n  ${DIM}Static asset tests skipped (SKIP_STATIC=true)${RESET}"
fi

# page / HTML routes

section "Page / HTML Routes"
run_test  "Root redirect"             GET   "/"
run_test  "index.html redirect"       GET   "/index.html"
run_test  "Single-player lobby"       GET   "/singlePlayer"
run_test  "Single-player reference"   GET   "/singlePlayer/reference"
run_test  "Single-player result"      GET   "/singlePlayer/result"
run_test  "Multi-player lobby"        GET   "/multiPlayer"
run_test  "Multi-player reference"    GET   "/multiPlayer/reference"
run_test  "Multi-player result"       GET   "/multiPlayer/result"
run_test  "Login page"                GET   "/log-in"
run_test  "Sign-up page"              GET   "/sign-up"
run_test  "Logout page"               GET   "/log-out"
run_test  "Profile page"              GET   "/profile"
run_test  "Banned page"               GET   "/banned"
run_test  "Banned page alias"         GET   "/auth/banned"
run_test  "Admin panel page"          GET   "/admin-panel"

# auth endpoints

section "Auth Endpoints"
run_test  "POST /log-in (bad creds)"       POST  "/log-in"  \
            '{"username":"__rl_smoke__","password":"__rl_smoke__"}'
run_test  "POST /sign-up (test payload)"   POST  "/sign-up" \
            '{"username":"__rl_smoke__","password":"Hunter2xRL!!"}'
run_test  "POST /log-out"                  POST  "/log-out"
run_test  "Username availability check"    GET   "/auth/checkForUsername/__rl_smoke__"

# profile API

section "Profile API"
# No valid session — expects 401/403, but rate limiter fires first
run_test  "User profile lookup"    GET  "/profile/api/user/__rl_smoke__"

# friends API

section "Friends API  (low-cost + high-cost limiters)"
run_test  "GET  friends list"    GET   "/profile/api/friends"
run_test  "POST friends/request" POST  "/profile/api/friends/request" \
            '{"username":"__rl_smoke__"}'
run_test  "POST friends/accept"  POST  "/profile/api/friends/accept"  \
            '{"username":"__rl_smoke__"}'
run_test  "POST friends/decline" POST  "/profile/api/friends/decline" \
            '{"username":"__rl_smoke__"}'
run_test  "POST friends/cancel"  POST  "/profile/api/friends/cancel"  \
            '{"username":"__rl_smoke__"}'
run_test  "POST friends/remove"  POST  "/profile/api/friends/remove"  \
            '{"username":"__rl_smoke__"}'

# admin API
# No admin session — expects 403, but rate limiter fires first.
# ALL /admin-panel{/*splat} catches every method, so test a spread.

section "Admin API  (requires admin session — 403 expected, 429 required)"
run_test  "GET  /admin-panel/api default"        GET    "/admin-panel/api"
run_test  "GET  /admin-panel/api singlePlayer"   GET    "/admin-panel/api/singlePlayer"
run_test  "GET  /admin-panel/api multiPlayer"    GET    "/admin-panel/api/multiPlayer"
run_test  "GET  /admin-panel/api all/os"         GET    "/admin-panel/api/all/os"
run_test  "GET  /admin-panel/api all/analytics"  GET    "/admin-panel/api/all/analytics"
run_test  "POST to admin-panel tree"             POST   "/admin-panel/anything" \
            '{"test":true}'
run_test  "PUT  to admin-panel tree"             PUT    "/admin-panel/anything"
run_test  "DELETE to admin-panel tree"           DELETE "/admin-panel/anything"

# summary

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}Results${RESET}"
echo -e "  ${GREEN}Rate-limited  : ${PASS}${RESET}"
echo -e "  ${RED}Unprotected   : ${FAIL}${RESET}"

if (( FAIL == 0 )); then
  echo -e "\n${GREEN}${BOLD}  ✓  All endpoints are rate-limited.${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  exit 0
else
  echo -e "\n${RED}${BOLD}  ✗  Unprotected endpoints:${RESET}"
  for ep in "${FAILED_ENDPOINTS[@]}"; do
    echo -e "     ${RED}•  ${ep}${RESET}"
  done
  echo ""
  echo -e "  ${YELLOW}Possible causes:${RESET}"
  echo "    • Route mounted before global limiter middleware"
  echo "    • DISABLE_RATE_LIMIT=true in .env"
  echo "    • All responses are 000 — check CURL_TIMEOUT or server health"
  echo "    • Static route: STATIC_BURST_SIZE (${STATIC_BURST_SIZE}) is below threshold (750)"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  exit 1
fi
