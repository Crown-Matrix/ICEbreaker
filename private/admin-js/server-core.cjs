
// this file exports server variables to be used by both singlePlayer and multiPlayer servers
// they will operate on the same node process, server, and port, but will have different socketIO paths and routes
//server-core.cjs
const codeMatrix = require("../../public/js/codeMatrix.js");

const express = require('express');
const app = express();
const os = require('node:os');

const singlePlayer = {};



const TESTING_MODE = process.env.TEST_MODE === 'true' ? true : false;

const { createServer } = require('node:http');
const { join, default: path } = require('node:path');

const path_alias = require(join(__dirname, '../Server-Imports/General/path_alias.json'))

const cookieParser = require("cookie-parser");
const SERVER_START_TIME = Date.now(); //used to calculate server uptime
const coreOSInfo = {
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



const { Server } = require('socket.io');
const { url } = require("node:inspector");
const server = createServer(app);

const DEFAULT_PORT = 3000;
const PORT = process.env.ICEBREAKER_PORT || DEFAULT_PORT;

class SQLManager {
  constructor() {
    let mySQL = require('../admin-js/SQL.cjs');
    for (const [key, value] of Object.entries(mySQL)) {
      this[key] = value;
    }
  }
}

const SQL_Manager_Instance = new SQLManager();


/*
    APP MIDDLEWARE
*/

app.get('/banned', (req, res) => {
  res.status(403).sendFile('/auth/banned.html', { root: './public' });
});
app.use(cookieParser()); //parse cookies from incoming requests
app.use(express.json()); //parse JSON bodies]

/*
    BAN CHECK MIDDLEWARE
    checks banned table for ip or UUID, if found, redirects to /banned page
*/

app.use((req, res, next) => {
  let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  let sessionToken = req.cookies.sessionToken

  let UUID = sessionToken ?
    SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;

  let isUserBanned = UUID ?
    SQL_Manager_Instance.isUUIDBanned(UUID) : false;

  if (isUserBanned) {
    console.warn('Banned user attempted to access path:', req.path, 'UUID:', UUID);
    return res.status(403).sendFile('/auth/banned.html', { root: './public' });
  }

  if (
    req.path === '/banned' ||
    req.path === '/favicon.ico' ||
    req.path.startsWith('/.well-known/')
  ) {
    return next();
  }

  if (!ip) {
    console.warn('No IP address found in request for path:', req.path);
    return res.status(400).send('Bad Request: No IP address found');
  }

  if (SQL_Manager_Instance.isIPBanned(ip)) {
    console.warn('Banned IP attempted to access path:', req.path, 'IP:', ip);
    return res.status(403).sendFile('/auth/banned.html', { root: './public' });
  }
  next();
});


/*
    Route handling
*/

const create_precomputed_regexes = () => {
  const result = {}
  for (const key of Object.keys(path_alias)) {
    result[key] = [];
    for (const value of path_alias[key]) {
      if (key == value) {
        throw Error('key must not match value in path alias regex config')
      }
      const escapedOld = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^/${escapedOld}(?=[/?]|$)`, 'i')
      result[key].push(regex);
    }
  }
  return result;
}
const compiledAliases = create_precomputed_regexes();

app.use((req, res, next) => {
  /*
  This middleware targets root level alias of common endpoints using the precomputed regexes.
  /login is redirected permanently to log-in
  /register is redirected permanently to sign-up
  and so on.
  this targets all unbanned requests and only root-levels:
  /auth/checkForUsername/register will not be replaced, because /register is not at the root level, /auth is

  aliases and their correct endpoint are defined in Server-Imports/General/path_alias.json

  WARNING: Do not define the actual endpoint as one of the endpoints aliases, this will cause infinite redirects until browser rejects it
  a bad example: "profile": ["profile","account"]
  profile[0] should not be there and can cause major problems.
  */
  let new_url = req.originalUrl
  let replaced = false

  outer: //broken once any match is found
  for (const key of Object.keys(compiledAliases)) {
    for (const regex of compiledAliases[key]) {
      if (regex.test(new_url)) {
        new_url = new_url.replace(regex, `/${key}`)
        replaced = true;
        break outer; //only one replacement is possible from the fact that only the 1 root level is considered
      }
    }
  }
  if (replaced) {
    return res.status(308).redirect(new_url);
  }
  next();
});

app.get('/', (req, res) => {
  //temp redirect to single player page for testing until multiplayer is created
  res.redirect('/singlePlayer');
});

app.all('/admin-panel{/*splat}', (req, res, next) => {
  //auth , check if user UUID has admin status, if not, return 403
  const sessionToken = req.cookies.sessionToken;
  const UUID = sessionToken ? SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : false;
  if (!TESTING_MODE && (!UUID || !SQL_Manager_Instance.isAdmin(UUID))) {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
});

app.get('/admin-panel/api/:endpoint{/:subendpoint}', (req, res) => {
  //auth is handled in above middleware

  const endpoint = req.params.endpoint.toLowerCase();
  const subendpoint = req.params.subendpoint?.toLowerCase();

  switch (endpoint) {
    case 'singleplayer':
      if (subendpoint === 'os') {
        res.status(200).json(singlePlayer.backEndAdminInstance.osInfo.os); //return the singlePlayer osInfo object
      } else if (subendpoint === 'analytics') {
        res.status(200).json(singlePlayer.backEndAdminInstance.osInfo.analytics); //return the singlePlayer analytics object
      } else {
        res.status(200).json(singlePlayer.backEndAdminInstance) //return whole thing
      }
      break;
    // Handle singlePlayer API request
    case 'multiplayer':
      // Handle multiPlayer API request
      break;
    case 'all':
      const response = {
        singlePlayer: singlePlayer.backEndAdminInstance,
        //multiPlayer: multiPlayer.backEndAdminInstance
      }
      res.status(200).json(response);
      break;
      // Handle all API request
      break;
    case 'analytics':
      const analytics_response = new Object();
      for (const [key, obj] of Object.entries(coreOSInfo['analytics'])) {
        analytics_response[key] = obj.value; //theres a value property on each osInfo object, next to the description property
      }
      res.status(200).json(analytics_response);
      break;
    case 'os':
      const os_response = new Object();
      for (const [key, obj] of Object.entries(coreOSInfo['os'])) {
        os_response[key] = obj.value; //theres a value property on each osInfo object, next to the description property
      }
      res.status(200).json(os_response);
      break;
    default:
      res.status(404).json({ error: 'Endpoint not found' });
  }
});

app.use(express.static('public')); //only after ban check middleware, so banned users cant access static files

app.get('/profile', (req, res) => {
  res.status(200).sendFile('auth/profile/profile.html', { root: './public' });
});

app.get('/profile/api/user/:username', (req, res) => {
  const sessionToken = req.cookies.sessionToken;
  const UUID = sessionToken ? SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;
  if (!UUID) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  const requestedUsername = req.params.username;
  const user_info = SQL_Manager_Instance.getUserProfileByUUID(UUID);
  if (!user_info || user_info.username !== requestedUsername) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own profile.' });
  }
  res.status(200).json(user_info);
});

app.post('/auth/log-out', (req, res) => {
  const sessionToken = SQL_Manager_Instance.auth.getSessionTokenFromRequest(req);
  if (sessionToken) {
    SQL_Manager_Instance.deleteSessionToken(sessionToken); // Invalidate the session token on the server side to log the user out
  }
  res.clearCookie('sessionToken'); // Clear the session token cookie on the client side
  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/log-out', (req, res) => {
  res.status(200).sendFile('auth/log-out.html', { root: './public' });
});

app.get('/log-in', (req, res) => {
  res.status(200).sendFile('auth/log-in.html', { root: './public' });
});


app.post('/log-in', async (req, res) => {
  // check if username and password pair is valid
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const isValid = await SQL_Manager_Instance.passwordMatch(username, password);
  if (isValid) {
    const userUUID = SQL_Manager_Instance.getUUIDFromUsername(username);
    const sessionToken = SQL_Manager_Instance.createSessionTokenForUUID(userUUID);
    SQL_Manager_Instance.auth.sendSessionTokenAsCookie(res, sessionToken);
    return res.status(200).json({ message: 'Logged in successfully' });
  } else {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }
});

app.get('/sign-up', (req, res) => {
  res.status(200).sendFile('auth/sign-up.html', { root: './public' });
});

app.post('/sign-up', (req, res) => {
  //check if username taken
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  const username_existence = SQL_Manager_Instance.getUserByUsername(username)

  if (!username_existence) {
    let newUUID = SQL_Manager_Instance.createUser(username, password);
    return res.status(201).cookie('sessionToken', SQL_Manager_Instance.createSessionTokenForUUID(newUUID)).json({
      message: 'User created successfully.',
      UUID: newUUID,
    })
  } else {
    return res.status(409).json({ message: 'username already taken!' })
  }
})

app.get('/auth/checkForUsername/:username', async (req, res) => {
  try {
    const username = req.params.username?.trim().toLowerCase();
    console.log(username)

    if (!username || username.length < 3) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const user = await SQL_Manager_Instance.getUserByUsername(username);

    return res.status(200).json({
      available: !user
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});


app.use('/admin-panel', express.static(join(__dirname, '../admin-panel/')));
app.get('/admin-panel', (req, res) => {
  //auth is handled in above middleware
  res.status(200).sendFile('admin-panel/admin.html', { root: './private' });
});






// Start server

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(' ') //newline
});



//exports

// singlePlayer and multiPlayers will both use these variables
module.exports = { SQL_Manager_Instance, PORT, codeMatrix, express, app, createServer, cookieParser, Server, server, singlePlayer };