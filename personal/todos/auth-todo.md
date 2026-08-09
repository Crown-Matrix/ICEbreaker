# ICEbreaker Authentication — Remediation TODO

Re-audited against current codebase. Original review covered `singlePlayer.js`,
`SQL.cjs`, `auth.js` — those have since been split/renamed to
`server-core.cjs` + `singlePlayerServer.cjs`, `SQL.cjs` + `tracked-SQL.cjs`,
and `auth.cjs`. File references below use current names.

## Status legend
| Status | Meaning |
|---|---|
| `OPEN` | Still applies, unchanged from original audit |
| `PARTIAL` | Partially addressed — follow-up recommended |
| `FIXED` | Resolved, no action needed |
| `REGRESSION` | New issue introduced since original audit (not in original doc) |

## Summary table
| ID | Title | Status | Priority | File(s) |
|---|---|---|---|---|
| 1 | Session token in console.log | FIXED | — | singlePlayerServer.cjs |
| 2 | Minimum password length | PARTIAL | LOW | SQL.cjs, tracked-SQL.cjs |
| 3 | Timing-based username enumeration | OPEN | CRITICAL | SQL.cjs, tracked-SQL.cjs |
| 4 | Sign-up / checkForUsername enumeration | OPEN | HIGH | server-core.cjs |
| 5 | Rate limiting on auth routes | PARTIAL | HIGH | server-core.cjs |
| 6 | Persistent structured logging | OPEN | MEDIUM | server-core.cjs, tracked-SQL.cjs |
| 7 | Password reset flow | OPEN | HIGH | multiple (new) |
| 8 | TOTP-based MFA | OPEN | HIGH (admin) / MEDIUM (user) | multiple (new) |
| 9 | Breached password check | OPEN | LOW-MEDIUM | SQL.cjs / route |
| 10 | Session cookie SameSite weakened | REGRESSION | MEDIUM | auth.cjs |

---

## [1] Session token in console.log
- **Status:** FIXED
- **File(s):** `singlePlayerServer.cjs`, `multiPlayerServer.cjs` (`io.use` socket middleware)
- **Verification:** No `console.log` of `sessionToken` or handshake auth data found anywhere in either socket middleware. Only non-sensitive logs remain (IP-missing warnings, socket ID).
- **Action:** None.

## [2] Minimum password length
- **Status:** PARTIAL
- **File(s):** `SQL.cjs`, `tracked-SQL.cjs` — `createUser()`
- **Current state:** A minimum now exists: `if (password.length < 8) return {ErrorCode: 2, ...}`. The original "no minimum at all" gap is closed.
- **Remaining gap:** 8 is below the 12-character modern baseline the original audit recommended (NIST SP 800-63B floor is 8, but 12 is the safer default for a game holding in-app currency).
- **Fix (optional follow-up):**
  ```js
  const MIN_PASSWORD_LENGTH = 12;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ErrorCode: 2, ErrorMessage: 'Password must be at least 12 characters' };
  }
  ```
- **Priority:** LOW — real fix already landed, this is a hardening tweak.

## [3] Timing-based username enumeration in passwordMatch()
- **Status:** OPEN — unchanged
- **File(s):** `SQL.cjs` (sync `passwordMatch`), `tracked-SQL.cjs` (async `passwordMatch`)
- **Problem:** Both implementations still return immediately when the user isn't found, skipping `bcrypt.compareSync`:
  ```js
  const user = getUserByUsername(username);
  if (!user) return false;          // ~0ms — no bcrypt call
  return bcrypt.compareSync(password_attempt, user.password);  // ~100ms
  ```
  The timing gap lets an attacker determine whether a username is registered without logging in.
- **Fix:**
  ```js
  // once, at module load:
  const DUMMY_HASH = bcrypt.hashSync('dummy-sentinel-value', 12);

  const passwordMatch = (username, password_attempt) => {
      const user = getUserByUsername(username);
      const hashToCompare = user ? user.password : DUMMY_HASH;
      const result = bcrypt.compareSync(password_attempt, hashToCompare);
      return user ? result : false;
  };
  ```
  Apply to both `SQL.cjs` and `tracked-SQL.cjs` — they've drifted into separate implementations, so this needs to land in both.
- **Priority:** CRITICAL

## [4] Sign-up / checkForUsername response enumeration
- **Status:** OPEN — unchanged
- **File(s):** `server-core.cjs` — `POST /sign-up`, `GET /auth/checkForUsername/:username`
- **Problem:** Sign-up still returns an explicit `409 { message: 'username already taken!' }`. `checkForUsername` still directly returns `{ available: !user }`. Either alone confirms account existence; together with no username-specific throttling (see [5]), bulk enumeration is easy.
- **Fix options (unchanged from original):**
  - **A (simple):** collapse to a generic message on conflict, vary only status code.
  - **B (preserve UX):** keep descriptive errors but rate-limit both endpoints specifically and tightly (tighter than the current global limiter — see [5]).
- **Priority:** HIGH

## [5] Rate limiting on auth routes
- **Status:** PARTIAL
- **File(s):** `server-core.cjs`
- **Current state:** Rate limiting now exists and is real — `express-rate-limit` is wired up with IP-based and session-token-based limiters (low/high cost × short/long term), applied globally before `/log-in`, `/sign-up`, and `/auth/checkForUsername` are declared. `trust proxy` is configured via `PROXY_HOP_AMOUNT` env var, addressing the original doc's proxy-header concern.
- **Configured limits** (`rateLimitConfig.json`):
  | Tier | Window | Limit |
  |---|---|---|
  | highCost longTerm | 15 min | 500 req/IP |
  | highCost shortTerm | 15 sec | 45 req/IP |
- **Remaining gap:** These are generic, shared across all "high cost" routes — not dedicated to auth. 500 attempts per 15 minutes per IP is loose for credential stuffing specifically (original recommendation was 10 login attempts / 15 min).
- **Fix (optional follow-up):** layer a dedicated stricter limiter on `/log-in` on top of the existing global one:
  ```js
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: { message: 'Too many login attempts. Please try again later.' },
  });
  app.post('/log-in', loginLimiter, async (req, res) => { ... });
  ```
- **Priority:** HIGH (was CRITICAL — downgraded since baseline protection now exists)

## [6] Persistent structured logging
- **Status:** OPEN — unchanged
- **File(s):** `server-core.cjs`, `tracked-SQL.cjs`
- **Verification:** No `winston` or `pino` in `package.json` or anywhere in the codebase. All logging is still `console.log` / `console.warn` / `console.error`, lost on restart, no structured/searchable audit trail.
- **Fix:** unchanged from original — add `winston`, log structured events (`login_failed`, `login_success`, `account_created`, `ban_applied`, `tamper_detected`, etc.) with `{ event, ip, UUID }` fields.
- **Priority:** MEDIUM

## [7] Password reset flow
- **Status:** OPEN — unchanged
- **File(s):** none yet (new feature)
- **Verification:** No `forgot-password`, `reset-password`, or reset-token table/logic anywhere in `private/` or `public/`. Accounts remain permanently unrecoverable if a password is forgotten.
- **Fix:** unchanged from original — token table with 30-min expiry + single-use tokens, identical response regardless of whether the account exists, rate-limited endpoint, email delivery via nodemailer + SMTP provider.
- **Priority:** HIGH

## [8] TOTP-based multi-factor authentication
- **Status:** OPEN — unchanged
- **File(s):** none yet (new feature)
- **Verification:** No `mfa` or `totp` references anywhere in the codebase.
- **Fix:** unchanged from original — `mfa_secret`/`mfa_enabled` columns, recovery codes table (hashed, not plaintext), setup/verify/disable/recover routes, login flow gated on `mfa_enabled` before issuing a full session token.
- **Priority:** HIGH for admin/internal accounts, MEDIUM for regular users

## [9] Breached password check at sign-up
- **Status:** OPEN — unchanged
- **File(s):** `SQL.cjs` / sign-up route (new dependency)
- **Verification:** No `hibp` dependency in `package.json`, no pwned-password check anywhere.
- **Fix:** unchanged from original — `hibp` package, k-anonymity API call in the sign-up route before `createUser()`, reject on `pwnedCount > 0`.
- **Priority:** LOW-MEDIUM

## [10] Session cookie SameSite weakened — NEW FINDING
- **Status:** REGRESSION (not in original audit — original credited `SameSite: 'Strict'` as already-good)
- **File(s):** `auth.cjs`
- **Current state:**
  ```js
  httpOnly: true,
  secure: isProduction,      // only require HTTPS in prod
  sameSite: 'Lax',           // 'Strict' blocks the cookie after redirects and cross-site top-level
  ```
- **Context:** This looks like a deliberate, documented tradeoff (the comment explains `'Strict'` was breaking the cookie after redirects), not an oversight. `'Lax'` is still a reasonable, common choice and meaningfully better than `'None'`. Flagging only because the original audit specifically called out `'Strict'` as a passing item — worth a conscious decision on whether the redirect-breakage tradeoff is still the right one, not necessarily a fix.
- **Priority:** MEDIUM (informational — confirm this was an intentional tradeoff, not drift)

---

## Confirmed still good (verified this pass)
- bcrypt with 12 salt rounds — confirmed in both `SQL.cjs` and `tracked-SQL.cjs`
- No plaintext/reversible password storage
- `httpOnly: true` on session cookie
- `secure` conditional on production environment (`isProduction`)
- 7-day session expiry enforced in DB (`expires_at ... +7 days`) and in cookie `maxAge`
- Expired session tokens auto-deleted on validation and via periodic cleanup query
- Tamper detection still bans on tamper events (`Tampering:` / `MP Tampering:` reasons)
- IP + UUID ban system with expiry still in place

## Carried over from original audit, not re-verified this pass
- Session token entropy (`sha512(randomBytes(32))`)
- New session token generated on each login (no session fixation)
- Server-side session invalidation on logout
- Socket.IO middleware re-validating token on every connection
- Guest vs. authenticated user distinction throughout