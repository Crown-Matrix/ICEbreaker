
// this file exports server variables to be used by both singlePlayer and multiPlayer servers
// they will operate on the same node process, server, and port, but will have different socketIO paths and routes
//server-core.cjs
const codeMatrix = require("../../public/js/codeMatrix.js");

const express = require('express');
const app = express();
app.set('trust proxy', process.env.PROXY_HOP_AMOUNT ? parseInt(process.env.PROXY_HOP_AMOUNT) : 0);
const os = require('node:os');

const { join, default: path } = require('node:path');

const rateLimitConfig = require(join(__dirname, '../Server-Imports/General/rateLimitConfig.json'));
//ip - low - long
//ip - low - short
//ip - high - long
//ip - high - short
//
//sessionToken - low - long
//sessionToken - low - short
//sessionToken - high - long
//sessionToken - high - short
// these are all the rate limiters

const singlePlayer = {};

const multiPlayer = {};

const cookieParser = require("cookie-parser");
app.use(cookieParser()); //parse cookies from incoming requests
app.use(express.json()); //parse JSON bodies

const DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT === 'true'

const { rateLimit } = require('express-rate-limit');



// Common settings for all IP-based limiters
const ipBaseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: true,
  ipv6Subnet: 56,
  skip: () => DISABLE_RATE_LIMIT
};

// Common settings for all Token-based limiters
const tokenBaseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: true,
  skip: (req) => DISABLE_RATE_LIMIT || !req.cookies?.sessionToken,
  keyGenerator: (req) => req.cookies?.sessionToken
};

// --- IP Limiters ---
const ipLimiter_lowCost_longTerm = rateLimit({ ...rateLimitConfig.lowCost.longTerm, ...ipBaseOptions });
const ipLimiter_lowCost_shortTerm = rateLimit({ ...rateLimitConfig.lowCost.shortTerm, ...ipBaseOptions });
const ipLimiter_highCost_longTerm = rateLimit({ ...rateLimitConfig.highCost.longTerm, ...ipBaseOptions });
const ipLimiter_highCost_shortTerm = rateLimit({ ...rateLimitConfig.highCost.shortTerm, ...ipBaseOptions });

// --- Session Token Limiters ---
const sessionTokenLimiter_lowCost_longTerm = rateLimit({ ...rateLimitConfig.lowCost.longTerm, ...tokenBaseOptions });
const sessionTokenLimiter_lowCost_shortTerm = rateLimit({ ...rateLimitConfig.lowCost.shortTerm, ...tokenBaseOptions });
const sessionTokenLimiter_highCost_longTerm = rateLimit({ ...rateLimitConfig.highCost.longTerm, ...tokenBaseOptions });
const sessionTokenLimiter_highCost_shortTerm = rateLimit({ ...rateLimitConfig.highCost.shortTerm, ...tokenBaseOptions });




const TESTING_MODE = process.env.TEST_MODE === 'true'

const { createServer } = require('node:http');


const path_alias = require(join(__dirname, '../Server-Imports/General/path_alias.json'))


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

const SQL_TYPE = process.env.USE_TURSO_DATABASE === 'true' ? 'turso' : 'no_turso'; //false by default
const SQL_URLS = {
  turso: '../admin-js/tracked-SQL.cjs',
  no_turso: '../admin-js/SQL.cjs'
}



class SQLManager {
  constructor() {
    const mySQL = require(SQL_URLS[SQL_TYPE]);
    Object.defineProperties(this, Object.getOwnPropertyDescriptors(mySQL));
  }
}

const SQL_Manager_Instance = new SQLManager();



module.exports = { SQL_Manager_Instance }; //needs earlier export, other things are added at the bottom of file

const envWrite = require(join(__dirname, './envWrite.cjs'));


const hardDB = require(join(__dirname, './hard-db.cjs'));




if (SQL_TYPE === 'turso') {
  console.log('Using Turso database for SQL operations.');


  if (process.env.LAST_SQL_MODE === 'false') { //undefined is intentionally grouped with true, and will not trigger this sync up, as that means there are no local changes to sync up yet
    console.log('Last SQL mode was not Turso, performing initial sync...');
    hardDB.runResetWal(); //reset WAL before force push, to avoid "database is locked" errors
    hardDB.forcePush(SQL_Manager_Instance.db);
  }
  (async () => {
    try {
      await SQL_Manager_Instance.sync();
      if (SQL_Manager_Instance.applyPragmas) SQL_Manager_Instance.applyPragmas();
      console.log('Initial sync complete.');
      setInterval(async () => {
        //sync with turso every minute, if using turso
        // this is a backup in case the shutdown handler fails to run, which can happen if the process is killed abruptly
        try {
          console.log('Performing periodic sync with Turso...');
          await SQL_Manager_Instance.sync();
        } catch (err) {
          console.error('Sync failed:', err.message);
        }
      }, 1000 * 60 // 1 minute interval
      );
    } catch (err) {
      console.error('Initial sync failed:', err.message);
      process.exit(1);
    }
  })();
} else if (SQL_TYPE === 'no_turso') {
  console.log('Using local SQLite database for SQL operations.');
} else {
  console.error('Invalid SQL_TYPE specified'); //should be dead code, if this is running you f'd up
}

const { registerShutdownHandlers } = require(join(__dirname, './shutdown.cjs'));
registerShutdownHandlers(SQL_Manager_Instance, SQL_TYPE);

/*
    APP MIDDLEWARE
*/
const static_cheap_paths = ['/js', '/css', '/imgs'];

app.use(static_cheap_paths, [
  ipLimiter_lowCost_shortTerm,
  ipLimiter_lowCost_longTerm,
  sessionTokenLimiter_lowCost_shortTerm,
  sessionTokenLimiter_lowCost_longTerm
]);

static_cheap_paths.forEach(urlPath => {
  app.use(urlPath, express.static(join("public", urlPath)));
});

// gameCover static assets (CSS/JS) — low-cost rate limited, served from /gameCover/ at project root
app.use('/gameCover', [
  ipLimiter_lowCost_shortTerm,
  ipLimiter_lowCost_longTerm,
  sessionTokenLimiter_lowCost_shortTerm,
  sessionTokenLimiter_lowCost_longTerm
]);
app.use('/gameCover', express.static(join(__dirname, '../../public/gameCover')));

app.use([
  ipLimiter_highCost_shortTerm,
  ipLimiter_highCost_longTerm,
  sessionTokenLimiter_highCost_shortTerm,
  sessionTokenLimiter_highCost_longTerm
]);






app.get(['/banned', '/auth/banned'], (req, res) => {
  res.status(403).sendFile(join(__dirname, '../../public/auth/banned.html'));
});

/*
    BAN CHECK MIDDLEWARE
    checks banned table for ip or UUID, if found, redirects to /banned page
*/

app.use(async (req, res, next) => {
  let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  let sessionToken = req.cookies.sessionToken

  let UUID = sessionToken ?
    await SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;

  let isUserBanned = UUID ?
    await SQL_Manager_Instance.isUUIDBanned(UUID) : false;

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

  if (await SQL_Manager_Instance.isIPBanned(ip)) {
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



// gameCover handler (shared by /, and TEST_MODE aliases)
const gameCoverHandler = async (req, res) => {
  // Update last-login timestamp the same way /profile does, fire-and-forget
  const sessionToken = req.cookies.sessionToken;
  if (sessionToken) {
    const UUID = await SQL_Manager_Instance.sessionTokenToUUID(sessionToken);
    if (UUID) {
      SQL_Manager_Instance.updateLastLoginDateFromUUID(UUID); // intentionally not awaited
    }
  }
  res.status(200).sendFile('gameCover.html', { root: join(__dirname, '../../public/gameCover') });
};

app.get('/', gameCoverHandler);
app.get('/index.html', (req, res) => res.redirect('/'));

// /gameCover and /gameCover.html are only reachable in TEST_MODE
if (TESTING_MODE) {
  app.get(['/gameCover', '/gameCover.html'], gameCoverHandler);
}






app.all('/admin-panel{/*splat}', async (req, res, next) => {
  //auth , check if user UUID has admin status, if not, return 403
  const sessionToken = req.cookies.sessionToken;
  const UUID = sessionToken ? await SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : false;
  if (!TESTING_MODE && (!UUID || !await SQL_Manager_Instance.isAdmin(UUID))) {
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
    case 'multiplayer':
      if (subendpoint === 'os') {
        res.status(200).json(multiPlayer.backEndAdminInstance.osInfo.os); //return the singlePlayer osInfo object
      } else if (subendpoint === 'analytics') {
        res.status(200).json(multiPlayer.backEndAdminInstance.osInfo.analytics); //return the singlePlayer analytics object
      } else {
        res.status(200).json(multiPlayer.backEndAdminInstance) //return whole thing
      }
      break;
    case 'all':
      const response = {
        singlePlayer: singlePlayer.backEndAdminInstance,
        multiPlayer: multiPlayer.backEndAdminInstance
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



app.get('/profile/api/user/:username', async (req, res) => {
  const sessionToken = req.cookies.sessionToken;
  const UUID = sessionToken ? await SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;
  if (!UUID) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  await SQL_Manager_Instance.updateLastLoginDateFromUUID(UUID);
  const requestedUsername = req.params.username;
  const user_info = await SQL_Manager_Instance.getUserProfileByUUID(UUID);
  if (!user_info || user_info.username !== requestedUsername) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own profile.' });
  }
  res.status(200).json(user_info);
});



const friendLimiters = [
  ipLimiter_lowCost_shortTerm,
  ipLimiter_lowCost_longTerm,
  sessionTokenLimiter_lowCost_shortTerm,
  sessionTokenLimiter_lowCost_longTerm
];

// Shared auth helper for friendship routes
async function resolveFriendshipSession(req, res) {
  const sessionToken = req.cookies.sessionToken;
  const UUID = sessionToken ? await SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;
  if (!UUID) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return null;
  }
  const user = SQL_Manager_Instance.getUserByUUID(UUID);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. User not found.' });
    return null;
  }
  return user; // has .id (integer PK) and .username
}

// GET /profile/api/friends — fetch the caller's full friendship state
app.get('/profile/api/friends', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const state = await SQL_Manager_Instance.getFriendships(me.id);
    return res.status(200).json(state);
  } catch (err) {
    console.error('GET /profile/api/friends error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/friends/request — send a friend request
app.post('/profile/api/friends/request', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const { username: targetUsername } = req.body;
    if (!targetUsername || typeof targetUsername !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const target = SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === me.id) return res.status(400).json({ error: 'You cannot send a request to yourself.' });

    const result = await SQL_Manager_Instance.sendFriendRequest(me.id, target.id);
    if (result === false) return res.status(409).json({ error: 'Friend request already sent.' });

    return res.status(200).json({ message: result === true ? 'Request sent.' : 'Already friends.' });
  } catch (err) {
    console.error('POST /profile/api/friends/request error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/friends/accept — accept an incoming request
app.post('/profile/api/friends/accept', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const { username: targetUsername } = req.body;
    if (!targetUsername || typeof targetUsername !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const target = SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const result = await SQL_Manager_Instance.acceptFriendRequest(me.id, target.id);
    if (!result) return res.status(404).json({ error: 'No pending request found.' });

    return res.status(200).json({ message: 'Friend request accepted.' });
  } catch (err) {
    console.error('POST /profile/api/friends/accept error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/friends/decline — decline an incoming request
app.post('/profile/api/friends/decline', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const { username: targetUsername } = req.body;
    if (!targetUsername || typeof targetUsername !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const target = SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const result = await SQL_Manager_Instance.declineFriendRequest(me.id, target.id);
    if (!result) return res.status(404).json({ error: 'No pending request found.' });

    return res.status(200).json({ message: 'Friend request declined.' });
  } catch (err) {
    console.error('POST /profile/api/friends/decline error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/friends/cancel — cancel an outgoing request
app.post('/profile/api/friends/cancel', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const { username: targetUsername } = req.body;
    if (!targetUsername || typeof targetUsername !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const target = SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const result = await SQL_Manager_Instance.cancelFriendRequest(me.id, target.id);
    if (!result) return res.status(404).json({ error: 'No pending outgoing request found.' });

    return res.status(200).json({ message: 'Friend request cancelled.' });
  } catch (err) {
    console.error('POST /profile/api/friends/cancel error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/friends/remove — remove an accepted friend
app.post('/profile/api/friends/remove', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;

    const { username: targetUsername } = req.body;
    if (!targetUsername || typeof targetUsername !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const target = SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const result = await SQL_Manager_Instance.removeFriend(me.id, target.id);
    if (!result) return res.status(404).json({ error: 'You are not friends with this user.' });

    return res.status(200).json({ message: 'Friend removed.' });
  } catch (err) {
    console.error('POST /profile/api/friends/remove error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── Direct-challenge routes ────────────────────────────────────────────────

// GET /profile/api/challenges — fetch caller's challenge state
app.get('/profile/api/challenges', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;
    const state = await SQL_Manager_Instance.getChallenges(me.account_UUID);
    return res.status(200).json(state);
  } catch (err) {
    console.error('GET /profile/api/challenges error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/challenge/send — send a challenge (mutual → creates match)
app.post('/profile/api/challenge/send', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;
    const targetUsername = req.body?.username;
    if (typeof targetUsername !== 'string') return res.status(400).json({ error: 'Invalid username.' });
    const target = await SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.account_UUID === me.account_UUID) return res.status(400).json({ error: 'Cannot challenge yourself.' });
    const result = await SQL_Manager_Instance.sendChallenge(me.account_UUID, target.account_UUID);
    if (result.matched) return res.status(200).json({ matched: true, matchUUID: result.matchUUID, message: 'Match created!' });
    return res.status(200).json({ matched: false, message: result.alreadySent ? 'Challenge already sent.' : 'Challenge sent.' });
  } catch (err) {
    console.error('POST /profile/api/challenge/send error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /profile/api/challenge/cancel — cancel an outgoing challenge
app.post('/profile/api/challenge/cancel', friendLimiters, async (req, res) => {
  try {
    const me = await resolveFriendshipSession(req, res);
    if (!me) return;
    const targetUsername = req.body?.username;
    if (typeof targetUsername !== 'string') return res.status(400).json({ error: 'Invalid username.' });
    const target = await SQL_Manager_Instance.getUserByUsername(targetUsername.trim());
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const cancelled = await SQL_Manager_Instance.cancelChallenge(me.account_UUID, target.account_UUID);
    return res.status(200).json({ success: cancelled, message: cancelled ? 'Challenge cancelled.' : 'No challenge found.' });
  } catch (err) {
    console.error('POST /profile/api/challenge/cancel error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────

app.post('/log-out', async (req, res) => {
  const sessionToken = SQL_Manager_Instance.auth.getSessionTokenFromRequest(req);
  if (sessionToken) {
    await SQL_Manager_Instance.deleteSessionToken(sessionToken); // Invalidate the session token on the server side to log the user out
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
    const userUUID = await SQL_Manager_Instance.getUUIDFromUsername(username);
    const sessionToken = await SQL_Manager_Instance.createSessionTokenForUUID(userUUID);
    SQL_Manager_Instance.auth.sendSessionTokenAsCookie(res, sessionToken);
    SQL_Manager_Instance.auth.sendStaticUserDataAsHeader(res, await SQL_Manager_Instance.getStaticUserDataByUUID(userUUID));
    await SQL_Manager_Instance.updateLastLoginDateFromUsername(username);
    return res.status(200).json({ message: 'Logged in successfully' });
  } else {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }
});



app.get('/sign-up', (req, res) => {
  res.status(200).sendFile('auth/sign-up.html', { root: './public' });
});

app.post('/sign-up', async (req, res) => {
  //check if username taken
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  const username_existence = await SQL_Manager_Instance.getUserByUsername(username)

  if (!username_existence) {
    const newUUID = await SQL_Manager_Instance.createUser(username, password);
    if (typeof newUUID === 'object' && newUUID.ErrorCode) {
      return res.status(400).json({ message: newUUID.ErrorMessage });
    }

    const sessionToken = await SQL_Manager_Instance.createSessionTokenForUUID(newUUID);
    SQL_Manager_Instance.auth.sendSessionTokenAsCookie(res, sessionToken); // <-- fix
    SQL_Manager_Instance.auth.sendStaticUserDataAsHeader(res, await SQL_Manager_Instance.getStaticUserDataByUUID(newUUID));

    return res.status(201).json({
      message: 'User created successfully.',
      UUID: newUUID,
    });
  } else {
    return res.status(409).json({ message: 'username already taken!' });
  }
})



app.get('/auth/checkForUsername/:username', async (req, res) => {
  try {
    const username = req.params.username?.trim().toLowerCase();

    if (!username || username.length < 1) {
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
module.exports = { SQL_Manager_Instance, PORT, codeMatrix, express, app, createServer, cookieParser, Server, server, singlePlayer, multiPlayer };