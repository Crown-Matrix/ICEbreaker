

// middleware compatibility for express
//auth.cjs


// grabs cookie from request
const getSessionTokenFromRequest = (req) => {
  // Express route — cookieParser() already populated req.cookies
  if (req.cookies) {
    return req.cookies.sessionToken ?? null;
  }

  // Socket.IO handshake — parse the raw cookie header manually
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, decodeURIComponent(val.join('='))];
    })
  );

  return cookies.sessionToken ?? null;
};

const isProduction = !(process.env.TEST_MODE === 'true');


//send httponly cookie with session token to client
const sendSessionTokenAsCookie = (res, sessionToken) => {
  res.cookie('sessionToken', sessionToken, {
    httpOnly: true,
     secure: isProduction,      // only require HTTPS in prod
     // localhost is not HTTPS, so we can't require it in dev, chrome allows it, safari doesnt..
     // incredibly annoyingg
    sameSite: 'Lax',           // 'Strict' blocks the cookie after redirects and cross-site top-level
    // navigations — Safari drops it constantly with Strict + ITP enabled.
    // Lax still blocks cross-site POST/PUT/DELETE (CSRF protection intact).
    // Without this the cookie is a session cookie; Safari (especially
    // iOS) aggressively purges session cookies when backgrounding.
    // literally a nightmare to get this working across browsers, but this is the best compromise.
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  return res;
}

const sendStaticUserDataAsHeader = (res, userData) => {
  res.set('x-userdata-username', encodeURIComponent(userData.username)); // Set the user data in the response headers
  res.set('x-userdata-accountcreationdate', userData['account_Creation_Date']); // Set the user data in the response headers
  return res;
}

module.exports = {
  getSessionTokenFromRequest,
  sendSessionTokenAsCookie,
  sendStaticUserDataAsHeader
}