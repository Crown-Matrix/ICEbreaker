

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

const sendStaticUserDataAsHeader = (res, userData) => {
  console.log(userData)
  console.log(userData.username)
  console.log(userData['account_Creation_Date'])
  res.set('x-userdata-username',encodeURIComponent(userData.username)); // Set the user data in the response headers
  res.set('x-userdata-accountcreationdate', userData['account_Creation_Date']); // Set the user data in the response headers
  return res;
}

module.exports = {
    getSessionTokenFromRequest,
    sendSessionTokenAsCookie,
    sendStaticUserDataAsHeader
}