# Node.js `os` Module — Complete Reference

Import with:
```js
const os = require('os');
// or ESM:
import os from 'os';
```

This module provides operating system-related utility methods and properties. It is cross-platform, so some fields behave differently (or are stubbed) on Windows vs. macOS (Darwin) vs. Linux. Notes on platform differences are included throughout.

## Table of Contents

1. [os.arch()](#1-osarch)
2. [os.machine()](#2-osmachine)
3. [os.cpus()](#3-oscpus)
4. [os.endianness()](#4-osendianness)
5. [os.freemem()](#5-osfreemem)
6. [os.totalmem()](#6-ostotalmem)
7. [os.getPriority([pid])](#7-osgetprioritypid)
8. [os.setPriority([pid, ]priority)](#8-ossetprioritypid-priority)
9. [os.homedir()](#9-oshomedir)
10. [os.hostname()](#10-oshostname)
11. [os.loadavg()](#11-osloadavg)
12. [os.networkInterfaces()](#12-osnetworkinterfaces)
13. [os.platform()](#13-osplatform)
14. [os.release()](#14-osrelease)
15. [os.tmpdir()](#15-ostmpdir)
16. [os.type()](#16-ostype)
17. [os.uptime()](#17-osuptime)
18. [os.userInfo([options])](#18-osuserinfooptions)
19. [os.availableParallelism()](#19-osavailableparallelism)
20. [os.devNull](#20-osdevnull)
21. [os.EOL](#21-oseol)
22. [os.constants](#22-osconstants)
23. [Quick Reference Table](#quick-reference-table)

---

## 1. `os.arch()`

**Signature:** `os.arch()`
**Returns:** `string`

Returns the CPU architecture that the Node.js **binary** was compiled for. This is **not** necessarily the actual hardware architecture (see [os.machine()](#2-osmachine) below). Equivalent to `process.arch`.

Possible values include: `'arm'`, `'arm64'`, `'ia32'`, `'loong64'`, `'mips'`, `'mipsel'`, `'ppc'`, `'ppc64'`, `'riscv64'`, `'s390'`, `'s390x'`, `'x64'`.

```js
console.log(os.arch()); // 'arm64'
```

> **Note:** If running an x64 build of Node under emulation (e.g. Rosetta 2 on Apple Silicon), `os.arch()` reports `'x64'` even though the real hardware is `arm64`. Use `os.machine()` to get the true hardware architecture.

[⬆ Back to top](#table-of-contents)

---

## 2. `os.machine()`

**Signature:** `os.machine()`
**Returns:** `string`
**Added in:** v18.9.0

Returns the machine's hardware architecture as reported by the OS/kernel (equivalent to running `uname -m` on Unix systems). Unlike `os.arch()`, this reflects the actual physical hardware, not the compiled Node binary.

```js
console.log(os.machine()); // 'arm64'
```

[⬆ Back to top](#table-of-contents)

---

## 3. `os.cpus()`

**Signature:** `os.cpus()`
**Returns:** `Array<Object>` — one object per logical CPU core

Each object has the shape:
```js
{
  model: string,      // CPU model name (same string for every core)
  speed: number,      // clock speed in MHz (see caveat below)
  times: {
    user: number,     // ms spent in user-space code
    nice: number,     // ms spent on "niced" (lowered-priority) processes
    sys:  number,     // ms spent in kernel/system code
    idle: number,     // ms spent idle
    irq:  number      // ms spent servicing hardware interrupts
  }
}
```

All `times` values are **cumulative milliseconds since system boot** — not point-in-time percentages. To compute "CPU usage %", sample `os.cpus()` twice with a delay and calculate the delta of each bucket over the delta of total time.

**Platform caveats:**
- On Apple Silicon (M-series Macs), `speed` is often a static filler value (e.g. `2400`) for every core — macOS doesn't expose real live per-core clock speed through the API Node uses, so this number is **not reliable** there.
- On macOS, `nice` and `irq` are always `0` — Darwin doesn't track these separately from `user`/`sys`.
- The array length equals the number of **logical** cores (all P-cores + E-cores combined on Apple Silicon). Node does not distinguish performance vs. efficiency cores in this API.

```js
// Example output (Apple M4 Pro, 12-core)
[
  {
    model: 'Apple M4 Pro',
    speed: 2400,
    times: { user: 31961130, nice: 0, sys: 17191490, idle: 127606890, irq: 0 }
  },
  // ... 11 more entries
]
```

> **Tip:** To reliably distinguish performance vs. efficiency cores on Apple Silicon, you need a native call to:
> ```bash
> sysctl -n hw.perflevel0.physicalcpu   # performance cores
> sysctl -n hw.perflevel1.physicalcpu   # efficiency cores
> ```
> (Not available directly through `os.cpus()`.)

[⬆ Back to top](#table-of-contents)

---

## 4. `os.endianness()`

**Signature:** `os.endianness()`
**Returns:** `string` — either `'BE'` (big endian) or `'LE'` (little endian)

Returns the endianness of the CPU. Almost all modern consumer hardware (x64, Apple Silicon) is little-endian.

```js
console.log(os.endianness()); // 'LE'
```

[⬆ Back to top](#table-of-contents)

---

## 5. `os.freemem()`

**Signature:** `os.freemem()`
**Returns:** `number` — bytes of free system memory

```js
console.log(os.freemem());               // 2147483648
console.log(os.freemem() / (1024 ** 3));  // 2 (GB)
```

> **Note:** "Free" memory on modern OSes can be misleading — macOS/Linux aggressively use "free" RAM for disk caching, which is reclaimed on demand. Low `os.freemem()` does not necessarily mean the system is under memory pressure.

[⬆ Back to top](#table-of-contents)

---

## 6. `os.totalmem()`

**Signature:** `os.totalmem()`
**Returns:** `number` — total installed system memory, in bytes

```js
console.log(os.totalmem());               // 36507222016
console.log(os.totalmem() / (1024 ** 3));  // ~34 (GB)
```

[⬆ Back to top](#table-of-contents)

---

## 7. `os.getPriority([pid])`

**Signature:** `os.getPriority([pid])`
**Parameters:** `pid` (number, optional) — process ID; defaults to `0` (current process)
**Returns:** `number` — scheduling priority

```js
console.log(os.getPriority());     // priority of current process
console.log(os.getPriority(1234)); // priority of process 1234
```

[⬆ Back to top](#table-of-contents)

---

## 8. `os.setPriority([pid, ]priority)`

**Signature:** `os.setPriority([pid, ]priority)`
**Parameters:**
- `pid` (number, optional) — process ID; defaults to `0` (current process)
- `priority` (number, required) — new priority value

Attempts to set the scheduling priority for a process. Requires elevated privileges (root/admin) on most systems, depending on the target and value.

```js
os.setPriority(1234, os.constants.priority.PRIORITY_HIGH);
```

[⬆ Back to top](#table-of-contents)

---

## 9. `os.homedir()`

**Signature:** `os.homedir()`
**Returns:** `string` — absolute path to the current user's home directory

```js
console.log(os.homedir()); // '/Users/yourname' (macOS) or '/home/yourname' (Linux)
```

[⬆ Back to top](#table-of-contents)

---

## 10. `os.hostname()`

**Signature:** `os.hostname()`
**Returns:** `string` — the hostname of the operating system

```js
console.log(os.hostname()); // 'MacBook-Pro.local'
```

[⬆ Back to top](#table-of-contents)

---

## 11. `os.loadavg()`

**Signature:** `os.loadavg()`
**Returns:** `Array<number>` — exactly 3 floats

Returns `[1-minute, 5-minute, 15-minute]` load averages, a Unix kernel concept representing the average number of processes running or waiting for CPU time over that window.

```js
console.log(os.loadavg()); // [ 2.19921875, 2.35205078125, 2.28466796875 ]
```

**Interpretation:** A load value is relative to your core count. E.g., a load of `2.0` on a 2-core machine means ~100% average utilization, while the same `2.0` on a 12-core machine means only ~17% utilization. Comparing the three numbers shows the trend:
- `1-min < 5-min < 15-min` → load has been decreasing
- `1-min > 5-min > 15-min` → load has been climbing

> **Platform caveat:** Always returns `[0, 0, 0]` on Windows — no equivalent concept exists there.

[⬆ Back to top](#table-of-contents)

---

## 12. `os.networkInterfaces()`

**Signature:** `os.networkInterfaces()`
**Returns:** `Object` — keyed by interface name, **not** an array

Each key maps to an **array** of address objects (an interface can have multiple addresses: IPv4, IPv6, link-local, etc.)

Each address object has:
```js
{
  address:   string,   // the IP address itself
  netmask:   string,   // subnet mask for the address
  family:    string,   // 'IPv4' or 'IPv6'
  mac:       string,   // MAC address (all zeros for loopback/virtual ifaces)
  internal:  boolean,  // true = loopback/internal only, false = real network-facing
  cidr:      string,   // address + prefix length, e.g. '192.168.1.42/24'
  scopeid:   number    // IPv6 ONLY — disambiguates link-local addresses
}
```

```js
// Example output
{
  lo0: [
    {
      address: '127.0.0.1',
      netmask: '255.0.0.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '127.0.0.1/8'
    },
    {
      address: '::1',
      netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      family: 'IPv6',
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '::1/128',
      scopeid: 0
    }
  ],
  en0: [
    {
      address: '192.168.1.42',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: 'a4:83:e7:xx:xx:xx',
      internal: false,
      cidr: '192.168.1.42/24'
    },
    {
      address: 'fe80::1c3d:...',
      netmask: 'ffff:ffff:ffff:ffff::',
      family: 'IPv6',
      mac: 'a4:83:e7:xx:xx:xx',
      internal: false,
      cidr: 'fe80::1c3d:.../64',
      scopeid: 4
    }
  ]
}
```

**Common interface names:**
| Platform | Interfaces |
|---|---|
| macOS | `lo0` (loopback), `en0`/`en1` (Ethernet/Wi-Fi), `utun0`+ (VPN/tunnel), `awdl0` (Apple Wireless Direct Link), `bridge0` |
| Linux | `lo`, `eth0`, `wlan0`, `docker0` |
| Windows | `'Ethernet'`, `'Wi-Fi'` |

[⬆ Back to top](#table-of-contents)

---

## 13. `os.platform()`

**Signature:** `os.platform()`
**Returns:** `string` — identifies the operating system platform

Possible values: `'aix'`, `'darwin'`, `'freebsd'`, `'linux'`, `'openbsd'`, `'sunos'`, `'win32'`. Equivalent to `process.platform`.

```js
console.log(os.platform()); // 'darwin'
```

[⬆ Back to top](#table-of-contents)

---

## 14. `os.release()`

**Signature:** `os.release()`
**Returns:** `string` — OS release/version string (kernel version)

```js
console.log(os.release()); // '24.1.0' (Darwin kernel version, macOS)
```

[⬆ Back to top](#table-of-contents)

---

## 15. `os.tmpdir()`

**Signature:** `os.tmpdir()`
**Returns:** `string` — absolute path to the default directory for temp files

```js
console.log(os.tmpdir()); // '/var/folders/xx/.../T/' (macOS) or '/tmp' (Linux)
```

[⬆ Back to top](#table-of-contents)

---

## 16. `os.type()`

**Signature:** `os.type()`
**Returns:** `string` — OS name, as returned by `uname`

Possible values: `'Linux'`, `'Darwin'` (macOS), `'Windows_NT'`.

```js
console.log(os.type()); // 'Darwin'
```

[⬆ Back to top](#table-of-contents)

---

## 17. `os.uptime()`

**Signature:** `os.uptime()`
**Returns:** `number` — system uptime in **seconds** since boot

```js
console.log(os.uptime()); // 183822
```

[⬆ Back to top](#table-of-contents)

---

## 18. `os.userInfo([options])`

**Signature:** `os.userInfo([options])`
**Parameters:** `options` (Object, optional) — `encoding` (string): character encoding for returned strings; default `'utf8'`
**Returns:** `Object` — info about the current effective user

```js
{
  username: string,
  uid: number,      // -1 on Windows
  gid: number,      // -1 on Windows
  shell: string,    // null on Windows
  homedir: string
}
```

```js
console.log(os.userInfo());
// {
//   username: 'yourname',
//   uid: 501,
//   gid: 20,
//   shell: '/bin/zsh',
//   homedir: '/Users/yourname'
// }
```

[⬆ Back to top](#table-of-contents)

---

## 19. `os.availableParallelism()`

**Signature:** `os.availableParallelism()`
**Returns:** `number`
**Added in:** v19.4.0 / v18.14.0

Returns the estimated number of parallel threads recommended for the current Node instance. Usually equals `os.cpus().length`, but can be **lower** if running inside a container/cgroup with CPU limits (e.g., Docker with `--cpus=4` reports `4` here even on a 12-core host machine).

This is the **preferred** way to determine worker-pool / thread-pool sizing, rather than `os.cpus().length`, because it respects runtime CPU restrictions.

```js
console.log(os.availableParallelism()); // 12
```

[⬆ Back to top](#table-of-contents)

---

## 20. `os.devNull`

**Type:** `string` (property, **not** a function)
**Value:** Platform-specific path to the "null device" — `'/dev/null'` on POSIX (macOS, Linux), `'NUL'` on Windows

```js
console.log(os.devNull); // '/dev/null'
```

[⬆ Back to top](#table-of-contents)

---

## 21. `os.EOL`

**Type:** `string` (property, **not** a function)
**Value:** Platform-specific end-of-line marker — `'\n'` on POSIX (macOS, Linux), `'\r\n'` on Windows

```js
console.log(os.EOL === '\n'); // true on macOS/Linux
```

[⬆ Back to top](#table-of-contents)

---

## 22. `os.constants`

**Type:** `Object` (property, **not** a function)

Contains OS-specific constant values, grouped into sub-objects:

| Sub-object | Contents |
|---|---|
| `os.constants.signals` | Signal constants used with `process.kill()`, e.g. `SIGHUP`, `SIGINT`, `SIGQUIT`, `SIGILL`, `SIGTRAP`, `SIGABRT`, `SIGKILL`, `SIGTERM`, `SIGSTOP`, `SIGCONT`, etc. |
| `os.constants.errno` | Error number constants for system errors, e.g. `EPERM`, `ENOENT`, `ESRCH`, `EINTR`, `EIO`, `ENXIO`, `E2BIG`, `EACCES`, `EEXIST`, etc. |
| `os.constants.priority` | Process scheduling priority constants, used with `os.setPriority()`: `PRIORITY_LOW`, `PRIORITY_BELOW_NORMAL`, `PRIORITY_NORMAL`, `PRIORITY_ABOVE_NORMAL`, `PRIORITY_HIGH`, `PRIORITY_HIGHEST` |
| `os.constants.dlopen` | Constants for dynamic linking behavior (platform-specific), used internally with things like `process.dlopen()`; rarely used directly. |

```js
console.log(os.constants.signals.SIGINT);              // 2
console.log(os.constants.priority.PRIORITY_HIGH);       // -14 (platform-dependent)
os.setPriority(pid, os.constants.priority.PRIORITY_HIGH);
```

[⬆ Back to top](#table-of-contents)

---

## Quick Reference Table

| Function/Property | Returns | Notes |
|---|---|---|
| [os.arch()](#1-osarch) | `string` | Node binary's compiled arch |
| [os.machine()](#2-osmachine) | `string` | Actual hardware arch (v18.9+) |
| [os.cpus()](#3-oscpus) | `Array<Object>` | Per-core model/speed/times |
| [os.endianness()](#4-osendianness) | `string` | `'BE'` or `'LE'` |
| [os.freemem()](#5-osfreemem) | `number` (bytes) | |
| [os.totalmem()](#6-ostotalmem) | `number` (bytes) | |
| [os.getPriority([pid])](#7-osgetprioritypid) | `number` | |
| [os.setPriority([pid,] pri)](#8-ossetprioritypid-priority) | `undefined` | Requires elevated privileges |
| [os.homedir()](#9-oshomedir) | `string` | Path |
| [os.hostname()](#10-oshostname) | `string` | |
| [os.loadavg()](#11-osloadavg) | `Array<number>` (3) | `[0,0,0]` on Windows |
| [os.networkInterfaces()](#12-osnetworkinterfaces) | `Object` (keyed) | Not an array! |
| [os.platform()](#13-osplatform) | `string` | |
| [os.release()](#14-osrelease) | `string` | |
| [os.tmpdir()](#15-ostmpdir) | `string` | Path |
| [os.type()](#16-ostype) | `string` | `'Darwin'`/`'Linux'`/`'Windows_NT'` |
| [os.uptime()](#17-osuptime) | `number` (seconds) | |
| [os.userInfo([options])](#18-osuserinfooptions) | `Object` | |
| [os.availableParallelism()](#19-osavailableparallelism) | `number` | Preferred over `cpus().length` |
| [os.devNull](#20-osdevnull) | `string` (property) | Path constant |
| [os.EOL](#21-oseol) | `string` (property) | Line-ending constant |
| [os.constants](#22-osconstants) | `Object` (property) | signals/errno/priority/dlopen |

[⬆ Back to top](#table-of-contents)