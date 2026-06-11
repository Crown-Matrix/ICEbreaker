

// middleware compatibility for express




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

//send httponly cookie with session token to client
const sendSessionTokenAsCookie = (res, sessionToken) => {
    res.cookie('sessionToken', sessionToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
    return res;
}

module.exports = {
    getSessionTokenFromRequest,
    sendSessionTokenAsCookie
}