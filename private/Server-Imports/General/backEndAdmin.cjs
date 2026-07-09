const os = (function get_value() { return require('node:os'); })()
const SERVER_START_TIME = Date.now()

const osInfo = {
  os: {
    arch: {
      get value() { return os.arch(); },
      description: 'The operating system CPU architecture for which the Node.js binary was compiled.'
    },
    machine: {
      get value() { return os.machine(); },
      description: 'Actual hardware architecture, as reported by the OS/kernel.'
    },
    endianness: {
      get value() { return os.endianness(); },
      description: "Endianness of the CPU: 'BE' (big endian) or 'LE' (little endian)."
    },
    homedir: {
      get value() { return os.homedir(); },
      description: "Path to the current user's home directory."
    },
    hostname: {
      get value() { return os.hostname(); },
      description: 'Hostname of the operating system.'
    },
    platform: {
      get value() { return os.platform(); },
      description: "Operating system platform, e.g. 'darwin', 'linux', 'win32'."
    },
    release: {
      get value() { return os.release(); },
      description: 'Operating system release/kernel version string.'
    },
    tmpdir: {
      get value() { return os.tmpdir(); },
      description: 'Default directory for temporary files.'
    },
    type: {
      get value() { return os.type(); },
      description: "OS name as returned by uname, e.g. 'Darwin', 'Linux', 'Windows_NT'."
    },
    userInfo: {
      get value() { return os.userInfo(); },
      description: 'Information about the current effective user (username, uid, gid, shell, homedir).'
    }
  },
  analytics: {
    cpus: {
      get value() { return os.cpus(); },
      description: 'Information about each logical CPU core.'
    },
    freemem: {
      get value() { return os.freemem(); },
      description: 'Amount of free system memory in bytes.'
    },
    totalmem: {
      get value() { return os.totalmem(); },
      description: 'Total amount of system memory in bytes.'
    },
    loadavg: {
      get value() { return os.loadavg(); },
      description: '[1, 5, 15]-minute load averages. Always [0, 0, 0] on Windows.'
    },
    networkInterfaces: {
      get value() { return os.networkInterfaces(); },
      description: 'Network interfaces on the machine, keyed by interface name.'
    },
    uptime: {
      get value() { return os.uptime(); },
      description: 'System uptime in seconds since boot.'
    },
    availableParallelism: {
      get value() { return os.availableParallelism(); },
      description: 'Estimated number of parallel threads recommended for this Node instance (respects container/cgroup CPU limits).'
    },
    serverRunTime: {
      get value() { return (Date.now() - SERVER_START_TIME) / 1000; },
      description: 'Time in seconds since the server started.'
    }
  }
};

class backEndAdmin {
  constructor() {
    this.activeSessions = {}; // dict of sessionId to backEndHandler instances
    this.osInfo = osInfo; // Store the OS information for server-core.cjs access for admin panel
  }
  addSession(backEndHandlerInstanceArg) {
    this.activeSessions[backEndHandlerInstanceArg.sessionId] = backEndHandlerInstanceArg;
  }
  removeSession(sessionId) {
    delete this.activeSessions[sessionId];
  }

  summary() {
    //construct new dict with only sessionId and frontEndHandler.gameState
    let summary = {};
    Object.values(this.activeSessions).forEach((handlerInstance) => {
      summary[handlerInstance.sessionId] = handlerInstance.frontEndHandler ? handlerInstance.frontEndHandler.gameState : 'no frontEndHandler';
    });
    return summary;
  }

}



module.exports = {
  backEndAdminInstance: new backEndAdmin()
};