

<div align='center'>

# <span style='color: rgb(0, 255, 255)'>🧊🔨ICE</span><span style='color: rgb(255, 45, 120)'>Breaker🧊🔨</span>



![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red?style=for-the-badge)
&emsp;
&emsp;
&emsp;
&emsp;
![GitHub last commit](https://img.shields.io/github/last-commit/Crown-Matrix/ICEbreaker?style=for-the-badge)


---
![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![CommonJS](https://img.shields.io/badge/CommonJS-Server%20Modules-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
######
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-Frontend%20Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-v5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
---

![Express.js](https://img.shields.io/badge/Express.js-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-000000?logo=socketdotio&logoColor=white)
![better-sqlite3](https://img.shields.io/badge/better--sqlite3-003B57?logo=sqlite&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-password%20hashing-4A154B)
######
![Cookie Parser](https://img.shields.io/badge/Cookie--Parser-HTTP%20Cookies-orange)
![Anti-Cheat System](https://img.shields.io/badge/Security-Anti--Cheat%20Validation-critical)
#####
![SHA-512](https://img.shields.io/badge/Session%20Auth%20Tokens-SHA--512%20Tokens-FF6B6B&logo=letsencrypt&logoColor=white)
#####
<img src="https://img.shields.io/badge/Shell_Script-121011?logo=gnu-bash&logoColor=white" style="box-shadow: 0 0 0 0.5px white; border-radius: 4px;"/>
</div>

#
---
# Table of Contents
---
- [Introduction](#introduction)
- [Usage/Installation](#usage)
    + └─ [Usage](#usage)
    + └─ [Installation](#first-time-installation)
- [Architecture/Routes](#architecture)
    + └─ [Architecture](#architecture)
    + └─ [Routes](#routes)
- [Features/Mechanics](#features)
- [Planned Features (not yet active)](#planned-features-not-yet-active)
#
#
# Introduction

ICEbreaker is a browser-based single-player hacking minigame inspired by the
Cyberpunk 2077 "Breach Protocol" mechanic. Players are presented with a 7x7
matrix of 2-character hex codes and must select a sequence of cells following
alternating row/column constraints, with the goal of matching as many "daemon" solution
sequences as possible before a countdown timer expires. The GUI aesthetic is cyberpunk with
neon green/red terminal effects.

---
# Usage

### First-Time Installation

#### Environment Dependencies:
- Node (required)

#### Install Node (skip if you already have it installed)

You just need Node installed by whatever method works for you. A few options:

**Option A — Official installer (all platforms, easiest)**
Download and run the installer from [nodejs.org](https://nodejs.org) — it includes npm.

**Option B — Homebrew (macOS/Linux)**
```bash
# 1. Install Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Homebrew will print some setup commands tailored to your system — run those too

# 2. Install Node
brew install node
```

**Option C — winget (Windows)**
```bash
winget install OpenJS.NodeJS.LTS
```

**Option D — nvm (any platform, lets you manage multiple Node versions)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
```
Then close and relaunch your terminal window
```bash
nvm install --lts
```

**Important:** Now that you have node installed, reopen your terminal to ensure its loaded in the profile



Verify it worked (In new terminal window):
```bash
node -v
npm -v
```

#### Once Node is installed:
```bash
git clone https://github.com/Crown-Matrix/ICEbreaker.git

cd ICEbreaker

npm install
```

### Method 1: Localhost

1. Ensure project root directory is named either 'src' or 'icebreaker' (case-insensitive)
2. choose port to host on in .env, default is 3000
3. run ```npm run main```
    ##### This will do the following things:
 - Initialize database folder if neccessary
 - Initialize .env file if neccessary
 - import .env variables to process
 - if in TESTING_MODE a REPL terminal will pop up, will not work in general prod deployment
 - runs single player server on provided localhost:port
 - runs multi player server on the same provided localhost:port
 4. open process on [localhost:port](localhost:port)


### Method 2: Deployment
1. Ensure project root directory is named either 'src' or 'icebreaker' (case-insensitive)
2. Ensure port is allowed by deployment service rules
3. run ```npm run main```
    ##### This will do the following things:
 - Initialize database folder if neccessary
 - Initialize .env file if neccessary
 - imports .env to process
 - Runs both single/multiplayer player server on provided deployed origin

## Environment Variable Usage

1. ICEBREAKER_PORT = INT
    + Sets port to host icebreaker endpoints
2. AUTO_KILL_PREVIOUS_PROCESS= "true"/"false"
    + Whether or not ```npm run main``` should kill previous processes or not, disable if you want to run multiple instances
3. MAC_TAB= "true"/"false"
    + For macOS only, hosts the terminal instance on terminal app rather than the native IDE
4. ADMIN_OPEN= "true"/"false"
    + Auto opens the admin-panel after ```npm run main```
5. TEST_MODE= "true"/"false"
    + Enables/Disables (respectively) the REPL admin console

---
# Architecture

Original Overview - [ICEBreaker-Architecture](https://github.com/crown-matrix/ICEbreaker/blob/main/personal/ICEBreaker_Architecture.png)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                                   │
│  ┌─────────────────┐ ┌────────────────────┐ ┌──────────────────────────────┐│
│  │ HTML Pages      │ │     Styling        │ │  Frontend JS (ESM)           ││
│  │ singlePlayer    │ │   Bootstrap 5.3    │ │  singlePlayerFrontend.js     ││
│  │ Reference · Res │ │ vibe-cyberpunk.css │ │  codeMatrix.js               ││
│  │ Auth (login/up) │ │ singlePlayerStyles │ │  audio.js                    ││
│  └────────┬────────┘ └────────┬───────────┘ └──────────────┬───────────────┘│
└───────────┼───────────────────┼────────────────────────────┼────────────────┘
            │                   │  HTTP / Socket.IO          │
┌───────────▼───────────────────▼────────────────────────────▼────────────────┐
│  TRANSPORT                                                                  │
│  ┌───────────────────────────┐  ┌──────────────────────┐  ┌───────────────┐ │
│  │   HTTP / REST (Express)   │  │    Socket.IO v4      │  │  Auth layer   │ │
│  │    Static · Auth · API    │  │ Real-time game events│  │ cookie-parser │ │
│  └─────────────┬─────────────┘  └──────────┬───────────┘  └──────┬────────┘ │
└────────────────┼────────────────────────────┼────────────────────┼──────────┘
                 │                            │                    │
┌────────────────▼────────────────────────────▼────────────────────▼──────────┐
│  BACKEND                                                                    │
│   ┌─────────────────────────────┐  ┌──────────────────┐ ┌─────────────────┐ │
│   │  singlePlayerServer.cjs     │  │ admin-panel.cjs  │ │  main.cjs       │ │
│   │  backEndHandler (sessions)  │  │ Admin REST API   │ │  Entry + REPL   │ │
│   │  Anti-cheat · Scoring       │  │ Ban · user mgmt  │ │  console        │ │
│   └──────────────────┬──────────┘  └────────┬─────────┘ └────────┬────────┘ │
│                      └─────────────────────┬┘                    │          │
│  ┌─────────────────────────────────────────▼─────────────────────▼─────────┐│
│  │  SQL.cjs + auth.cjs — Data Access Layer                                 ││
│  │  Users · Sessions · Friends · Bans · bcrypt · crypto.randomUUID         ││ 
│  └──────────────────────────────────────┬──────────────────────────────────┘│ 
└─────────────────────────────────────────┼───────────────────────────────────┘
                                          │
┌─────────────────────────────────────────▼───────────────────────────────────┐
│  DATABASE                                                                   │
│  SQLite (better-sqlite3) — ICEbreaker.db                                    │
│  WAL journal · foreign keys · synchronous ops                               │
│  Tables: users · sessions · friends · banned                                │
└─────────────────────────────────────────────────────────────────────────────┘
```


```mermaid
graph LR

A[Frontend] --> B[HTTP REST and/or Socket.IO]
B --> C[Express/Socket Middleware\nCookies/Auth/Rate Limiting]
C --> D[Single-player server]
C --> E[Multi-player server]
D --> F[SQLite3\nDatabase]
E --> F
```

## Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Redirect to `/singlePlayer` |
| `GET` | `/singlePlayer` | Reference/lobby page |
| `GET` | `/singlePlayer/result` | Post-game results |
| `GET` | `/auth/log-in` | Login page |
| `GET` | `/auth/sign-up` | Sign-up page |
| `GET` | `/auth/log-out` | Logout page |
| `GET` | `/auth/checkForUsername/:u` | `{ available: bool }` for username availability |
| `POST` | `/auth/log-in` | Login handler |
| `POST` | `/auth/sign-up` | Registration handler |
| `POST` | `/auth/log-out` | Logout + clear cookie |
| `GET` | `/banned` | Ban notice page |


# Features
### Runtime & Server
| Layer | Technology | Details |
|---|---|---|
| Runtime | Node.js | CJS + ESM hybrid (`"type": "module"`, server files use `.cjs`) |
| HTTP Framework | Express 5 | Static serving, REST auth routes, JSON middleware |
| Real-time | Socket.IO v4 | WebSocket game loop; custom path `/singlePlayer/socket` |
| Entry Point | `main.cjs` | Bootstraps servers, creates `/database/` dir, opens REPL console |

### Authentication
| Layer | Technology | Details |
|---|---|---|
| Session tokens | `crypto.randomUUID` + `crypto.hash('sha512')` | Opaque 64-char hex token |
| Password hashing | bcrypt | 12 salt rounds |
| Cookie transport | `cookie-parser` | httpOnly, Secure, SameSite=Strict |
| Session lifetime | SQLite `sessions` table | 7-day expiry, validated automatically on each request |

### Database
| Layer | Technology | Details |
|---|---|---|
| Engine | SQLite | File: `private/database/ICEbreaker.db` |
| Bindings | `better-sqlite3` | Fully synchronous API |
| Config | WAL journal mode & Foreign constraints | `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON` |
| Schema | 4 tables | `users`, `sessions`, `friends`, `banned` |

### Frontend
| Layer | Technology | Details |
|---|---|---|
| Markup | Vanilla HTML5 | No SSR; Express serves static files |
| Styling | Bootstrap 5.3 + custom CSS | `vibe-cyberpunk.css` — full cyberpunk design system |
| JS | Vanilla ESM | `SinglePlayerFrontend` class (~1575 lines); no framework |
| Navigation | Custom SPA | `goToPage()` fetches HTML, replaces `<head>`/`<body>`, re-runs scripts; state via `sessionStorage` |
| Game logic | `codeMatrix.js` | Matrix generation, solution injection, buffer checking |
| Audio | `audio.js` | Sound effects and background music management |

### Game Mechanics
| Concept | Value | Notes |
|---|---|---|
| Matrix size | 7 × 7 | Fixed |
| Node symbols | `7A 1C BD 55 E9 FF` | 6 possible values |
| Max buffer | 9 cells | Server-enforced |
| Difficulties | Easy / Medium / Hard | 200 / 300 / 500 points |
| Max score | 1000 per round | All 3 daemons installed |
| Eddies formula | `((3 × score) / 100) + 25` | Always integer (score is multiple of 100) |
| Time options | 30 / 45 / 60 s | Changeable before round start only, final decision is server-stored |
| Anti-cheat | Server-side validation | Immutable keys; tampering = auto-ban |

### Dev Tooling
| Tool | Details |
|---|---|
| Shell scripts | `personal/shell/` — startup, DB init, env init, kill, filemap, etc. |
| macOS integration | `main.sh` opens a new Terminal tab for the admin REPL; auto-opens admin panel; configurable in .env |
| Admin REPL | `readline`-based eval console in `main.cjs` with live access to `db`, `sql`, `auth` |
| Environment | `.env` file with `ICEBREAKER_PORT`, `AUTO_KILL_PREVIOUS_PROCESS`, `MAC_TAB`, `ADMIN_OPEN` |


# Planned Features (not yet active)
- **Admin Panel** - route & structure initialized - awaiting full backend implementation
- **Multiplayer** — `main.cjs` has a commented-out `require()` for a future MP server
- **Friends** — Tables and SQL functions complete, no routes or UI yet
- **Account tiers** — VIP (emotes, costs eddies or IRL money), PREMIUM (emotes + animation skips + opponent distractions, IRL money only)
