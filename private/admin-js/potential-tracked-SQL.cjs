const { createClient } = require('@libsql/client');
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID, hash, randomBytes } = require('crypto');
const auth = require('./auth.cjs');
const TESTING_MODE = process.env.TEST_MODE === 'true' ? true : false;

const fs = require('fs');

const dbPath = path.join(__dirname, '../database/ICEbreaker.db');
const dbDir = path.dirname(dbPath);

console.log('Database path:', dbPath);
console.log('Database directory:', dbDir);
console.log('Database files:', fs.readdirSync(dbDir));

// The Hrana sync stream can expire out from under a long-lived client.
// We keep `client` reassignable (via createNewClient) so a stream error
// can force a fresh connection without anyone holding a stale reference —
// every function below goes through the module-level `client` variable
// or a `tx` passed in, never a captured copy.
function createNewClient() {
    return createClient({
        url: `file:${dbPath}`,
        syncUrl: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
}

let client = createNewClient();

const STREAM_ERROR_PATTERN = /stream not found|STREAM_EXPIRED|stream has expired|HRANA_CLOSED/i;

// --- sync -------------------------------------------------------------
// Call this whenever you want to push local changes up / pull remote
// changes down. Async — awaits the round trip to Turso. Overlapping
// callers share one in-flight sync instead of racing.
let syncPromise = null;
function sync() {
    if (!syncPromise) {
        syncPromise = doSyncWithRecovery().finally(() => {
            syncPromise = null;
        });
    }
    return syncPromise;
}

async function doSyncWithRecovery(isRetry = false) {
    try {
        await client.sync();
    } catch (err) {
        const msg = String((err && err.message) || err);
        if (STREAM_ERROR_PATTERN.test(msg) && !isRetry) {
            console.warn('Hrana sync stream expired, reconnecting:', msg);
            try { client.close(); } catch (_) { /* already dead, ignore */ }
            client = createNewClient();
            return doSyncWithRecovery(true);
        }
        throw err;
    }
}

function hashPassword(password, override_safety = false) {
    if (!(checkPassword(password) || override_safety)) {
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

async function initializeUserTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE COLLATE NOCASE NOT NULL CHECK(LENGTH(username) BETWEEN 1 AND 19),
            password TEXT NOT NULL CHECK(LENGTH(password) BETWEEN 8 AND 63),
            account_UUID TEXT UNIQUE NOT NULL,
            sp_games_Played INTEGER DEFAULT 0,
            mp_games_Played INTEGER DEFAULT 0,
            mp_games_Won INTEGER DEFAULT 0,
            sp_games_Finished INTEGER DEFAULT 0,
            mp_games_Finished INTEGER DEFAULT 0,
            account_Creation_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            sp_average_Score REAL DEFAULT NULL,
            mp_average_Score REAL DEFAULT NULL,
            last_Login_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            account_Tier INTEGER DEFAULT 0,
            eddies INTEGER DEFAULT 0,
            settings TEXT DEFAULT '{}'
        )
    `
    await client.execute(createTableStmt);
}

`
    Account Tiers:
0 - default, no extra perks
1 - VIP, ability to use emotes / costs eddies or irl money
2 - PREMIUM, ability to use emotes + animation skips + opponent distractions in multiplayer / costs only irl money
3 - Admin, everything, plus full authentication for admin console access, not available to regular users
`

async function initializeFriendsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS friends (
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (friend_id) REFERENCES users(id)
        )
    `
    await client.execute(createTableStmt);
}

async function initializeSessionsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        account_UUID TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL DEFAULT (DATETIME('now', '+7 days')),
        FOREIGN KEY (account_UUID) REFERENCES users(account_UUID)
        )
    `
    await client.execute(createTableStmt);
}

async function initializeBannedTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS banned (
        ip_address TEXT UNIQUE NOT NULL,
        UUID TEXT UNIQUE DEFAULT NULL,
        reason TEXT,
        ban_expires DATE DEFAULT NULL,
        FOREIGN KEY (UUID) REFERENCES users(account_UUID)
        )
    `
    await client.execute(createTableStmt);
}

async function initializeAllTables() { //do not change this function name, unless u feel like updating it in the shell scripts as well
    await initializeUserTable();
    await initializeSessionsTable();
    await initializeFriendsTable();
    await initializeBannedTable();
}

//max username length: 64
//max password length: 64
//session lifespan: 7 days

// Wraps an async (tx, ...args) => {} body in an interactive transaction.
// Mirrors the original retry-once behavior, but additionally recycles
// the client on a stream error before the retry so the retry isn't
// doomed to hit the same dead stream.
function protected_sql(func) {
    return (...args) => runTransaction(func, args, true);
}

async function runTransaction(func, args, allowRetry) {
    const tx = await client.transaction('write');
    try {
        const result = await func(tx, ...args);
        await tx.commit();
        return result;
    } catch (err) {
        try { await tx.rollback(); } catch (_) { /* connection may already be dead */ }

        if (allowRetry) {
            const msg = String((err && err.message) || err);
            console.warn('SQL transaction failed, retrying:', msg);
            if (STREAM_ERROR_PATTERN.test(msg)) {
                try { client.close(); } catch (_) { /* ignore */ }
                client = createNewClient();
            }
            return runTransaction(func, args, false);
        }

        console.error('SQL transaction failed:', err.message);
        throw err; // re-throw so the caller can handle it too
    }
}

// simple reads — no transaction needed.
// Each takes an optional `tx` so it can also be called from inside a
// protected_sql body against that transaction's view of the data.
const getAllUsers = async (tx = client) => {
    const rs = await tx.execute('SELECT * FROM users');
    return rs.rows;
};

const getUserByUsername = async (username, tx = client) => {
    const rs = await tx.execute({
        sql: 'SELECT * FROM users WHERE LOWER(username) = ?',
        args: [username.toLowerCase()],
    });
    return rs.rows[0] || null;
};

// needs transaction — read then write
const createUser = protected_sql(async (tx, username, password) => {
    console.log('im being run!')
    if (username.length > 20) {
        return { ErrorCode: 1, ErrorMessage: 'Max username length exceeded' }
    } else if (password.length < 8) {
        return { ErrorCode: 2, ErrorMessage: 'Minimum password length not met' }
    } else if (username.length < 1) {
        return { ErrorCode: 3, ErrorMessage: 'Username is required' }
    } else if (password.length > 64) {
        return { ErrorCode: 4, ErrorMessage: 'Max password length exceeded' }
    }
    if (!checkUsername(username)) {
        return { ErrorCode: 5, ErrorMessage: 'Invalid username characters' }
    }
    if (!checkPassword(password)) {
        return { ErrorCode: 6, ErrorMessage: 'Invalid password characters' }
    }
    const existing = await getUserByUsername(username, tx);
    const UUID = randomUUID()
    if (existing) return { ErrorCode: 7, ErrorMessage: 'Username already taken' };
    console.log('creds validated')
    await tx.execute({
        sql: 'INSERT INTO users (username, password, account_UUID) VALUES (?, ?, ?)',
        args: [username, hashPassword(password), UUID],
    });
    console.log('creating a user with UUID:', UUID);
    return UUID;
});

const getUserByUUID = async (UUID, tx = client) => {
    const rs = await tx.execute({
        sql: 'SELECT * FROM users WHERE account_UUID = ?',
        args: [UUID],
    });
    return rs.rows[0] || null;
};

const getUserProfileByUUID = async (UUID, tx = client) => {
    //this is the same as getUserByUUID but without things that they wouldnt possibly need, like their password hash, account index, or UUID
    const rs = await tx.execute({
        sql: 'SELECT username,sp_games_played,mp_games_Played,mp_games_Won,sp_games_Finished,mp_games_Finished,account_Creation_Date,sp_average_score,mp_average_score,last_login_date,account_tier,eddies FROM users WHERE account_UUID = ?',
        args: [UUID],
    });
    return rs.rows[0] || null;
};

const getStaticUserDataByUUID = async (UUID, tx = client) => {
    const rs = await tx.execute({
        sql: 'SELECT username,account_Creation_Date FROM users WHERE account_UUID = ?',
        args: [UUID],
    });
    return rs.rows[0] || null;
};

// no transaction needed — single read + bcrypt compare, no write
const passwordMatch = async (username, password_attempt) => {
    if (checkUsername(username) === false || checkPassword(password_attempt) === false) {
        return false;
    }
    const user = await getUserByUsername(username);
    if (!user) return false;
    return bcrypt.compareSync(password_attempt, user.password);
};

const deleteUser = protected_sql(async (tx, username) => {
    if (checkUsername(username) === false) {
        throw new Error('Invalid username');
    }
    const existing = await getUserByUsername(username, tx);
    if (!existing) throw new Error('User not found');
    await tx.execute({
        sql: 'DELETE FROM users WHERE LOWER(username) = ?',
        args: [username.toLowerCase()],
    });
});

const updateGameStats = protected_sql(async (tx, username, appended_score, gameType, gameWon) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }

    if (!['sp', 'mp'].includes(gameType)) {
        throw new Error('Invalid gameType');
    }

    const rs = await tx.execute({
        sql: `
            SELECT ${gameType}_average_Score, ${gameType}_games_Finished
            FROM users
            WHERE LOWER(username) = ?
        `,
        args: [username.toLowerCase()],
    });
    const query = rs.rows[0];

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

    await tx.execute({
        sql: `
            UPDATE users
            SET ${gameType}_average_Score = ?,
                mp_games_Won = mp_games_Won + ?,
                ${gameType}_games_Finished = ${gameType}_games_Finished + 1
            WHERE LOWER(username) = ?
        `,
        args: [
            new_avg_score,
            (gameWon && gameType === 'mp') ? 1 : 0,
            username.toLowerCase(),
        ],
    });

    return true;
});

const incrementGame = protected_sql(async (tx, username, gameType) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    if (gameType !== 'sp' && gameType !== 'mp') {
        throw new Error('Invalid game type');
    }
    const rs = await tx.execute({
        sql: `UPDATE users SET ${gameType}_games_Played = ${gameType}_games_Played + 1 WHERE LOWER(username) = ?`,
        args: [username.toLowerCase()],
    });
    if (rs.rowsAffected === 0) {
        throw new Error('User not found');
    }
    return true
})

const scoreToEddies = (score /*should be a multiple of 100*/) => {
    const eddies = (Math.floor(score / 100) * 3) + 25
    //
    return eddies
}

const sendFriendRequest = protected_sql(async (tx, userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    // Check if the friend request already exists
    let existingRequest;
    try {
        const rs = await tx.execute({
            sql: `
                SELECT * FROM friends
                WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
            `,
            args: [userId, friendId, friendId, userId],
        });
        existingRequest = rs.rows[0];
    } catch (error) {
        console.error('Error checking existing friend request:', error);
        throw error;
    }

    if (existingRequest) {
        if (existingRequest.user_id == userId) {
            //request has already been sent by the user
            return false
        } else if (existingRequest.user_id == friendId) {
            //request has already been sent from the receiver
            //automatically accept the request
            await tx.execute({
                sql: "UPDATE friends SET status = 'accepted' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                args: [userId, friendId, friendId, userId],
            });
            return true;
        }
    }

    // Insert the new friend request
    try {
        await tx.execute({
            sql: 'INSERT INTO friends (user_id, friend_id) VALUES (?, ?)',
            args: [userId, friendId],
        });
    } catch (error) {
        console.error('Error inserting friend request:', error);
        throw error;
    }
    return true;
});

const acceptFriendRequest = protected_sql(async (tx, userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    try {
        const rs = await tx.execute({
            sql: `
                SELECT * FROM friends
                WHERE user_id = ? AND friend_id = ? AND status = 'pending'
            `,
            args: [friendId, userId],
        });
        const existingRequest = rs.rows[0];

        if (!existingRequest) {
            // No pending request found
            return false;
        }

        // Update the friend request to accepted
        await tx.execute({
            sql: "UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?",
            args: [friendId, userId],
        });
        return true;
    } catch (error) {
        console.error('Error accepting friend request:', error);
        throw error;
    }
});

const friendsCount = async (userId, tx = client) => {
    const rs = await tx.execute({
        sql: `
            SELECT COUNT(*) AS count FROM friends
            WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
        `,
        args: [userId, userId],
    });
    return rs.rows[0].count;
};

const wipeDatabase = async () => {
    await client.execute('PRAGMA foreign_keys = OFF');
    await client.execute('DROP TABLE IF EXISTS friends');
    await client.execute('DROP TABLE IF EXISTS users');
    await client.execute('PRAGMA foreign_keys = ON');
    await initializeUserTable();
    await initializeFriendsTable();
    await initializeSessionsTable();
    await initializeBannedTable();
    console.log('Database wiped and re-initialized');
}

const addEddies = protected_sql(async (tx, username, eddiesToAdd) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    const rs = await tx.execute({
        sql: 'UPDATE users SET eddies = eddies + ? WHERE username = ?',
        args: [eddiesToAdd, username],
    });
    if (rs.rowsAffected === 0) {
        throw new Error('User not found');
    }
    return true
})

const getUsernameFromUUID = async (UUID, tx = client) => {
    const rs = await tx.execute({
        sql: 'SELECT username FROM users WHERE account_UUID = ?',
        args: [UUID],
    });
    const query = rs.rows[0];
    if (!query) {
        throw new Error('user not found!')
    }
    return query.username
}

const getUUIDFromUsername = async (username, tx = client) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username');
    }
    const rs = await tx.execute({
        sql: 'SELECT account_UUID FROM users WHERE LOWER(username) = ?',
        args: [username.toLowerCase()],
    });
    const query = rs.rows[0];
    if (!query) {
        throw new Error('user not found!')
    }
    return query.account_UUID
}

const updateLastLoginDateFromUsername = protected_sql(async (tx, username) => {
    if (!checkUsername(username)) {
        throw new Error('Invalid username')
    }
    const rs = await tx.execute({
        sql: 'UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE LOWER(username) = ?',
        args: [username.toLowerCase()],
    });
    if (rs.rowsAffected === 0) {
        throw new Error('User not found');
    }
    return true
});

const updateLastLoginDateFromUUID = protected_sql(async (tx, UUID) => {
    if (!UUID || UUID.length < 30) {
        throw new Error('Invalid UUID');
    }
    const rs = await tx.execute({
        sql: 'UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE account_UUID = ?',
        args: [UUID],
    });
    if (rs.rowsAffected === 0) {
        throw new Error('User not found');
    }
    return true
});

//auth

const createSessionTokenForUUID = async (UUID, tx = client) => {
    //create session token to write
    let opaque = hash('sha512', randomBytes(32)).toString('hex');

    // write opaque with UUID
    await tx.execute({
        sql: `
            INSERT INTO sessions (session_token,account_UUID)
            VALUES (?,?)
        `,
        args: [opaque, UUID],
    });

    return opaque //to give back to user for http-only cookie storage
}

const sessionTokenToUUID = async (token, tx = client) => {
    //check if token exists, grab UUID if exists and is not expired
    //if expired, delete the token and return null, user will have to log in again to get a new token
    const rs = await tx.execute({
        sql: `
            SELECT account_UUID, (DATETIME('now') >= expires_at) as is_expired
            FROM sessions
            WHERE session_token = ?
        `,
        args: [token],
    });
    const query = rs.rows[0];

    if (!query) return null; //token not found, user is not authenticated

    if (query.is_expired) {
        //token is expired, delete it
        await tx.execute({
            sql: `
                DELETE FROM sessions
                WHERE session_token = ?
            `,
            args: [token],
        });

        return null;
    }

    return query.account_UUID
}

const deleteSessionTokenFromUUID = async (UUID, tx = client) => {
    const rs = await tx.execute({
        sql: 'DELETE FROM sessions WHERE account_UUID = ?',
        args: [UUID],
    });
    if (rs.rowsAffected == 0) { throw new Error('Session token not found') }
    return rs.rowsAffected
}

const deleteSessionToken = async (token, tx = client) => {
    const rs = await tx.execute({
        sql: 'DELETE FROM sessions WHERE session_token = ?',
        args: [token],
    });
    if (rs.rowsAffected == 0) { throw new Error('Session token not found') }
    return rs.rowsAffected
}

const clearExpiredSessionTokens = async (tx = client) => {
    const rs = await tx.execute('DELETE FROM sessions WHERE expires_at <= DATETIME("now")');
    return rs.rowsAffected
}

const clearAllSessionTokens = async (tx = client) => {
    const rs = await tx.execute('DELETE FROM sessions');
    return rs.rowsAffected
}

const banUser = protected_sql(async (tx, ip, UUID, reason, ban_length_days) => {
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

        await tx.execute({
            sql: `
                INSERT INTO banned (ip_address, UUID, reason, ban_expires)
                VALUES (?, ?, ?, ?)
            `,
            args: [ip, UUID, reason, ban_expires],
        });

        return true;
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Error('info is already banned');
        };
        throw error;
    };
});

const isIPBanned = async (ip, tx = client) => {
    const rs = await tx.execute({
        sql: `
            SELECT *
            FROM banned
            WHERE ip_address = ?
        `,
        args: [ip],
    });
    const row = rs.rows[0];

    // not banned
    if (!row) return false;

    // no expiry = permanent ban
    if (!row.ban_expires) return true;

    // check expiration
    const now = new Date();
    const expires = new Date(row.ban_expires);

    if (now >= expires) {
        await tx.execute({ sql: 'DELETE FROM banned WHERE ip_address = ?', args: [ip] });
        return false;
    }

    return true;
};

const isUUIDBanned = async (UUID, tx = client) => {
    const rs = await tx.execute({
        sql: `
            SELECT *
            FROM banned
            WHERE UUID = ?
        `,
        args: [UUID],
    });
    const row = rs.rows[0];

    if (!row) return false;
    if (!row.ban_expires) return true;

    const now = new Date();
    const expires = new Date(row.ban_expires);

    if (now >= expires) {
        await tx.execute({ sql: 'DELETE FROM banned WHERE UUID = ?', args: [UUID] });
        return false;
    }

    return true;
};

const unbanIP = protected_sql(async (tx, ip) => {
    const rs = await tx.execute({ sql: 'DELETE FROM banned WHERE ip_address = ?', args: [ip] });
    if (rs.rowsAffected === 0) {
        throw new Error('IP address not found in banned table');
    }
    return true;
})

const unbanUUID = protected_sql(async (tx, UUID) => {
    const rs = await tx.execute({ sql: 'DELETE FROM banned WHERE UUID = ?', args: [UUID] });
    if (rs.rowsAffected === 0) {
        throw new Error('UUID not found in banned table');
    }
    return true;
})

const isAdmin = async (UUID, tx = client) => {
    if (TESTING_MODE) {
        return true; // In testing mode, all users are considered admins
    }
    //they are usually more than 30, this is just a lower bound
    if (!UUID || UUID.length < 30) {
        return false; // No UUID provided, cannot be an admin
    }

    const rs = await tx.execute({
        sql: `
            SELECT account_Tier
            FROM users
            WHERE account_UUID = ?
        `,
        args: [UUID],
    });
    const row = rs.rows[0];

    return !!(row && row.account_Tier === 3); // Admin tier is 3
}

// single player flow:
//user starts game
// incrementGame ran to increase games played
//user finishes game
//available data: username || UUID, score, game_finished(implied true), can also calculate eddie from score

module.exports = {
    // `getClient()` replaces the old `sql`/`db` exports. It's a function,
    // not a property, on purpose: SQLManager (server-core.cjs) copies these
    // exports with Object.entries(), which evaluates getters immediately —
    // a `get client()` property would get frozen as a stale snapshot at
    // construction time. Callers must call getClient() fresh each time
    // rather than caching its return value. See migration notes.
    getClient: () => client,
    sync,
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
