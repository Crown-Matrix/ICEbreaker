
// this file exports server variables to be used by both singlePlayer and multiPlayer servers
// they will operate on the same node process, server, and port, but will have different socketIO paths and routes

const codeMatrix = require("../../public/js/codeMatrix.js");

const express = require('express');
const app = express();

const { createServer } = require('node:http');
const { join } = require('node:path');
const cookieParser = require("cookie-parser");



const { Server } = require('socket.io');
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



app.use(express.static('public')); //only after ban check middleware, so banned users cant access static files

/*
    Route handling
*/

app.get('/', (req, res) => {
  //temp redirect to single player page for testing until multiplayer is created
  res.redirect('/singlePlayer');
});

app.use('/admin-panel', express.static(join(__dirname, '../admin-panel/')));
app.get('/admin-panel', (req, res) => {
  res.status(200).sendFile('admin-panel/admin.html', { root: './private' });
});


//app.get('/auth/sign-up', (req, res) => {
//  res.status(200).sendFile('auth/sign-up.html', { root: __dirname + '../private' });
//});

app.post('/auth/log-out', (req, res) => {
  const sessionToken = SQL_Manager_Instance.auth.getSessionTokenFromRequest(req);
  if (sessionToken) {
    SQL_Manager_Instance.deleteSessionToken(sessionToken); // Invalidate the session token on the server side to log the user out
  }
  res.clearCookie('sessionToken'); // Clear the session token cookie on the client side
  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/auth/log-out', (req, res) => {
  res.status(200).sendFile('auth/log-out.html', { root: './public' });
});

app.get('/auth/log-in', (req, res) => {
  res.status(200).sendFile('auth/log-in.html', { root: './public' });
});


app.post('/auth/log-in', async (req, res) => {
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

app.get('/auth/sign-up', (req, res) => {
  res.status(200).sendFile('auth/sign-up.html', { root: './public' });
});

app.post('/auth/sign-up', (req, res) => {
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




// Start server

server. listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(' ') //newline
});



//exports

// singlePlayer and multiPlayers will both use these variables
module.exports = { SQL_Manager_Instance, PORT, codeMatrix , express, app, createServer, cookieParser, Server, server };