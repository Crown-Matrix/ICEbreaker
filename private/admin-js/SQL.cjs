const sql = require('better-sqlite3')
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID, hash, randomBytes } = require('crypto');
const auth = require('./auth.cjs')
const TESTING_MODE = process.env.TEST_MODE === 'true' ? true : false;




const db = new sql(path.join(__dirname, '../database/ICEbreaker.db'))
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


function hashPassword(password, override_safety = false) {
    if (!(checkPassword(password) || ovverride_safety)) {
        throw new Error('Invalid password')
    }
    const SALT_ROUNDS = 12;
    let hash = bcrypt.hashSync(password, SALT_ROUNDS);
    return hash
}



const checkUsername = (username) => {
    if (username.length > 20 || username.length < 1 || !/^[a-zA-Z0-9_-]{1,19}$/.test(username)) {
        return false;
    }
    return true;
};


const checkPassword = (password) => {
    if (password.length < 8 || password.length > 64 || !/^[a-zA-Z0-9!`@#\$%\^&\*\(\)-_=\+\[\]\{\}\\|;:'",<\.>\/\? ]{8,63}$/.test(password)) {
        return false;
    }
    return true;
};

//name convention:
//foo_Bar
//standard js convention but with an underscore

function initializeUserTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS users (
            id                         INTEGER PRIMARY KEY AUTOINCREMENT,
            username                   TEXT UNIQUE COLLATE NOCASE NOT NULL CHECK(LENGTH(username) BETWEEN 1 AND 19),
            password                   TEXT NOT NULL CHECK(LENGTH(password) BETWEEN 8 AND 63),
            account_UUID               TEXT UNIQUE NOT NULL,
            sp_games_Played            INTEGER DEFAULT 0,
            mp_games_Played            INTEGER DEFAULT 0,
            mp_games_Won               INTEGER DEFAULT 0,
            sp_games_Finished          INTEGER DEFAULT 0,
            mp_games_Finished          INTEGER DEFAULT 0,
            account_Creation_Date      TEXT DEFAULT CURRENT_TIMESTAMP,
            sp_average_Score REAL      DEFAULT NULL,
            mp_average_Score REAL      DEFAULT NULL,
            last_Login_Date TEXT       DEFAULT CURRENT_TIMESTAMP,
            account_Tier INTEGER       DEFAULT 0,
            eddies                     INTEGER DEFAULT 0,
            settings                   TEXT DEFAULT '{}',
            inventory                  TEXT DEFAULT '{}'
        )
    `
    db.prepare(createTableStmt).run()
}


`
    Account Tiers:
0 - default, no extra perks
1 - VIP, ability to use emotes / costs eddies or irl money
2 - PREMIUM, ability to use emotes + animation skips + opponent distractions in multiplayer / costs only irl money
3 - Admin, everything, plus full authentication for admin console access, not available to regular users
`


function initializeFriendsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS friends (
            user_id          INTEGER NOT NULL,
            friend_id        INTEGER NOT NULL,
            status           TEXT NOT NULL DEFAULT 'pending',
            created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `
    db.prepare(createTableStmt).run()
}


function initializeSessionsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS sessions (
        session_token            TEXT PRIMARY KEY,
        account_UUID             TEXT NOT NULL,
        created_at               TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at               TEXT NOT NULL DEFAULT (DATETIME('now', '+7 days')),
        FOREIGN KEY (account_UUID) REFERENCES users(account_UUID) ON DELETE CASCADE
        )
    `
    db.prepare(createTableStmt).run()
}



function initializeBannedTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS banned (
        ip_address           TEXT UNIQUE NOT NULL,
        UUID TEXT            UNIQUE DEFAULT NULL,
        reason               TEXT,
        ban_expires          DATE DEFAULT NULL,
        FOREIGN KEY (UUID) REFERENCES users(account_UUID) ON DELETE CASCADE
        )
    `
    db.prepare(createTableStmt).run()
}


function initializeAllTables() { //do not change this function name, unless u feel like updating it in the shell scripts as well
    initializeUserTable();
    initializeSessionsTable();
    initializeFriendsTable();
    initializeBannedTable();
}


//max username length: 64
//max password length: 64
//session lifespan: 7 days

function protected_sql(func) {
    const transaction = db.transaction(func);
    return (...args) => {
        try {
            return transaction(...args);
        } catch (err) {
            console.error('SQL transaction failed:', err.message);
            throw err; // re-throw so the caller can handle it too
        }
    };
}

// simple reads — no transaction needed
const getAllUsers = () => db.prepare('SELECT * FROM users').all();

const getUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(username.toLowerCase());

// needs transaction — read then write
const createUser = protected_sql((username, password) => {
    
    
    if ( username.length > 20) {
        return {ErrorCode : 1, ErrorMessage : 'Max username length exceeded'}
    } else if (password.length < 8) {
        return {ErrorCode : 2, ErrorMessage : 'Minimum password length not met'}
    } else if (username.length < 1) {
        return {ErrorCode : 3, ErrorMessage : 'Username is required'}
    } else if (password.length > 64) {
        return {ErrorCode : 4, ErrorMessage : 'Max password length exceeded'}
    } 
    if (!checkUsername(username)) {
        return {ErrorCode : 5, ErrorMessage : 'Invalid username characters'}
    }
    if (!checkPassword(password)) {
        return {ErrorCode : 6, ErrorMessage : 'Invalid password characters'}
    }
    const existing = getUserByUsername(username);
    const UUID = randomUUID()
    if (existing) return {ErrorCode : 7, ErrorMessage : 'Username already taken'};
    const info = db.prepare('INSERT INTO users (username, password, account_UUID) VALUES (?, ?, ?)')
        .run(username, hashPassword(password), UUID);
    return UUID;
});

const getUserByUUID = (UUID) => {
    return db.prepare('SELECT * FROM users WHERE account_UUID = ?').get(UUID)
};

const getUserProfileByUUID = (UUID) => {
    //this is the same as getUserByUUID but without things that they wouldnt possibly need, like their password hash, account index, or UUID
    return db.prepare('SELECT username,sp_games_played,mp_games_Played,mp_games_Won,sp_games_Finished,mp_games_Finished,account_Creation_Date,sp_average_score,mp_average_score,last_login_date,account_tier,eddies FROM users WHERE account_UUID = ?').get(UUID)
};

const getStaticUserDataByUUID = (UUID) => {
    return db.prepare('SELECT username,account_Creation_Date FROM users WHERE account_UUID = ?').get(UUID)
}


// no transaction needed — single read + bcrypt compare, no write
const passwordMatch = (username, password_attempt) => {
    if (checkUsername(username) === false || checkPassword(password_attempt) === false) {
        return false;
    }
    const user = getUserByUsername(username);
    if (!user) return false;
    return bcrypt.compareSync(password_attempt, user.password);
};


const deleteUser = protected_sql((username) => {
    if (checkUsername(username) === false) {
        throw new Error('Invalid username');
    }
    const existing = getUserByUsername(username);
    if (!existing) throw new Error('User not found');
    db.prepare('DELETE FROM users WHERE LOWER(username) = ?').run(username.toLowerCase());
});


const updateGameStats = protected_sql((username, appended_score, gameType, gameWon) => {

    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }

    if (!['sp', 'mp'].includes(gameType)) {
        throw new Error('Invalid gameType');
    }

    const query = db.prepare(`
        SELECT ${gameType}_average_Score, ${gameType}_games_Finished 
        FROM users 
        WHERE LOWER(username) = ?
    `).get(username.toLowerCase());

    if (!query) {
        throw new Error('User not found');
    }

    if (gameType === 'sp') {
        gameWon = false;
    }

    const avg_score = query[`${gameType}_average_Score`];

    const gamesFinished = query[`${gameType}_games_Finished`]; // always >= 0 per schema

    const new_avg_score =
        avg_score !== null
            ? (avg_score * gamesFinished + appended_score) / (gamesFinished + 1)
            : appended_score;

    db.prepare(`
        UPDATE users 
        SET ${gameType}_average_Score = ?,
            mp_games_Won = mp_games_Won + ?,
            ${gameType}_games_Finished = ${gameType}_games_Finished + 1
        WHERE LOWER(username) = ?
    `).run(
        new_avg_score,
        (gameWon && gameType === 'mp') ? 1 : 0,
        username.toLowerCase()
    );

    return true;
});



const incrementGame = protected_sql((username, gameType) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    if (gameType !== 'sp' && gameType !== 'mp') {
        throw new Error('Invalid game type');
    }
    const query = db.prepare(`UPDATE users SET ${gameType}_games_Played = ${gameType}_games_Played + 1 WHERE LOWER(username) = ?`).run(username.toLowerCase());
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
})


const scoreToEddies = (score /*should be a multiple of 100*/) => {
    const eddies = (Math.floor(score / 100) * 3) + 25
    //
    return eddies
}

const sendFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    // Check if the friend request already exists
    try {
        const existingRequest = db.prepare(`
        SELECT * FROM friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
    `).get(userId, friendId, friendId, userId);
        if (existingRequest) {
            if (existingRequest.user_id == userId) {
                //request has already been sent by the user
                return false
            } else if (existingRequest.user_id == friendId) {
                //request has already been sent from the receiver
                //automatically accept the request
                db.prepare("UPDATE friends SET status = 'accepted' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").run(userId, friendId, friendId, userId)
                return true;
            }
        }
    } catch (error) {
        console.error('Error checking existing friend request:', error);
        throw error;
    }

    // Insert the new friend request
    try {
        db.prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(userId, friendId);
    } catch (error) {
        console.error('Error inserting friend request:', error);
        throw error;
    }
    return true;
});

const acceptFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    try {
        const existingRequest = db.prepare(`
        SELECT * FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).get(friendId, userId);

        if (!existingRequest) {
            // No pending request found
            return false;
        }

        // Update the friend request to accepted
        db.prepare("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(friendId, userId);
        return true;
    } catch (error) {
        console.error('Error accepting friend request:', error);
        throw error;
    }
});


const friendsCount = (userId) => db.prepare(`
    SELECT COUNT(*) AS count FROM friends 
    WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
`).get(userId, userId).count;





const wipeDatabase = () => {
    db.pragma('foreign_keys = OFF');
    db.prepare('DROP TABLE IF EXISTS friends').run();
    db.prepare('DROP TABLE IF EXISTS users').run();
    db.pragma('foreign_keys = ON');
    initializeUserTable();
    initializeFriendsTable();
    initializeSessionsDatabase();
    initializeBannedTable();
    console.log('Database wiped and re-initialized');
}


const addEddies = protected_sql((username, eddiesToAdd) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    const query = db.prepare('UPDATE users SET eddies = eddies + ? WHERE username = ?').run(eddiesToAdd, username);
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
})


const getUsernameFromUUID = (UUID) => {
    const query = db.prepare('SELECT username FROM users WHERE account_UUID = ?').get(UUID)

    if (!query) {
        throw new Error('user not found!')
    }

    return query.username
}

const getUUIDFromUsername = (username) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    const query = db.prepare('SELECT account_UUID FROM users WHERE LOWER(username) = ?').get(username.toLowerCase())

    if (!query) {
        throw new Error('user not found!')
    }
    return query.account_UUID
}

const updateLastLoginDateFromUsername = protected_sql((username) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username')
    }
    const query = db.prepare('UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE LOWER(username) = ?').run(username.toLowerCase());
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
});

const updateLastLoginDateFromUUID = protected_sql((UUID) => {
    if (!UUID || UUID.length < 30) {
        throw new Error('Invalid UUID');
    }
    const query = db.prepare('UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE account_UUID = ?').run(UUID);
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
});




//auth

const createSessionTokenForUUID = (UUID) => {
    //create session token to write

    let opaque = hash('sha512', randomBytes(32)).toString('hex');

    // write opaque with UUID

    db.prepare(`
        INSERT INTO sessions (session_token,account_UUID)
        VALUES (?,?)
    `).run(opaque, UUID)

    return opaque //to give back to user for http-only cookie storage
}

const sessionTokenToUUID = (token) => {
    //check if token exists, grab UUID if exists and is not expired
    //if expired, delete the token and return null, user will have to log in again to get a new token
    const query = db.prepare(`
        SELECT account_UUID, (DATETIME('now') >= expires_at) as is_expired
        FROM sessions
        WHERE session_token = ?
        `).get(token);


    if (!query) return null; //token not found, user is not authenticated

    if (query.is_expired) {
        //token is expired, delete it
        db.prepare(`
            DELETE FROM sessions
            WHERE session_token = ?
        `).run(token);

        return null;
    }

    return query.account_UUID
}


const deleteSessionTokenFromUUID = (UUID) => {
    const query = db.prepare('DELETE FROM sessions WHERE account_UUID = ?').run(UUID)
    if (query.changes == 0) { throw new Error('Session token not found') }
    return query.changes
}


const deleteSessionToken = (token) => {
    const query = db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
    if (query.changes == 0) { throw new Error('Session token not found') }
    return query.changes
}


const clearExpiredSessionTokens = () => {
    const query = db.prepare('DELETE FROM sessions WHERE expires_at <= DATETIME("now")').run();
    return query.changes
}


const clearAllSessionTokens = () => {
    const query = db.prepare('DELETE FROM sessions').run();
    return query.changes
}




const banUser = protected_sql((ip, UUID, reason, ban_length_days) => {


    if (Number.isNaN(ban_length_days)) {
        throw new Error('Invalid ban length');
    };

    

    const indefinite =
        ban_length_days == null /*also takes undefined as true*/ || 
        ban_length_days === Infinity;
    if (!indefinite) {
        if (ban_length_days < 0) {
            throw new Error('Invalid ban length');
        };
    };
    
    try {
        const ban_expires = indefinite
            ? null
            : new Date(Date.now() + ban_length_days * 86400000).toISOString();

        db.prepare(`
      INSERT INTO banned (ip_address, UUID, reason, ban_expires)
      VALUES (?, ?, ?, ?)
    `).run(ip, UUID, reason, ban_expires);

    return true;
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Error('info is already banned');
        };
        throw error;
    };
});



const isIPBanned = (ip) => {
    const row = db.prepare(`
    SELECT *
    FROM banned
    WHERE ip_address = ?
  `).get(ip);

    // not banned
    if (!row) return false;

    // no expiry = permanent ban
    if (!row.ban_expires) return true;

    // check expiration
    const now = new Date();
    const expires = new Date(row.ban_expires);

    if (now >= expires) {
        db.prepare('DELETE FROM banned WHERE ip_address = ?').run(ip);
        return false;
    }

    return true;
};

const isUUIDBanned = (UUID) => {
    const row = db.prepare(`
    SELECT *
    FROM banned
    WHERE UUID = ?
  `).get(UUID);

    if (!row) return false;

    if (!row.ban_expires) return true;

    const now = new Date();
    const expires = new Date(row.ban_expires);

    if (now >= expires) {
        db.prepare('DELETE FROM banned WHERE UUID = ?').run(UUID);
        return false;
    }

    return true;
};


const unbanIP = protected_sql((ip) => {
    const query = db.prepare('DELETE FROM banned WHERE ip_address = ?').run(ip);
    if (query.changes === 0) {
        throw new Error('IP address not found in banned table');
    }
    return true;
})

const unbanUUID = protected_sql((UUID) => {
    const query = db.prepare('DELETE FROM banned WHERE UUID = ?').run(UUID);
    if (query.changes === 0) {
        throw new Error('UUID not found in banned table');
    }
    return true;
})


const isAdmin = (UUID) => {
    if (TESTING_MODE) {
        return true; // In testing mode, all users are considered admins
    }
    //they are usually more than 30, this is just a lower bound
        if (!UUID || UUID.length < 30) {
        return false; // No UUID provided, cannot be an admin
    }


    const row = db.prepare(`
    SELECT account_Tier
    FROM users
    WHERE account_UUID = ?
  `).get(UUID);

    return (row && row.account_Tier === 3); // Admin tier is 3
}

// single player flow:


//user starts game
// incrementGame ran to increase games played
//user finishes game
//available data: username || UUID, score, game_finished(implied true), can also calculate eddie from score


module.exports = {
    sql,
    db,
    auth,
    initializeUserTable,
    initializeFriendsTable,
    initializeSessionsTable,
    initializeBannedTable,
    initializeAllTables,
    getAllUsers,
    getUserByUsername,
    createUser,
    passwordMatch,
    deleteUser,
    updateGameStats,
    incrementGame,
    friendsCount,
    sendFriendRequest,
    acceptFriendRequest,
    scoreToEddies,
    wipeDatabase,
    getUsernameFromUUID,
    addEddies,
    updateLastLoginDateFromUsername,
    updateLastLoginDateFromUUID,
    createSessionTokenForUUID,
    sessionTokenToUUID,
    deleteSessionTokenFromUUID,
    deleteSessionToken,
    clearExpiredSessionTokens,
    clearAllSessionTokens,
    getUUIDFromUsername,
    isIPBanned,
    isUUIDBanned,
    banUser,
    unbanIP, 
    unbanUUID,
    isAdmin,
    getUserByUUID,
    getUserProfileByUUID,
    getStaticUserDataByUUID,
    checkUsername,
    checkPassword,
}
