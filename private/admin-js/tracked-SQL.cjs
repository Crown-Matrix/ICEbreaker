// tracked-SQL.cjs

// Reads and writes hit the local .db file.

// db.sync() is the only network touch — called by server-core.cjs like an auto save

'use strict';

const Database = require('libsql');
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID, hash, randomBytes } = require('crypto');
const auth = require('./auth.cjs');
const fs = require('fs');

const TESTING_MODE = process.env.TEST_MODE === 'true';

const dbPath = path.join(__dirname, '../database/ICEbreaker.db');
const dbDir  = path.dirname(dbPath);

console.log('Database path:'    , dbPath);
console.log('Database directory:', dbDir);
console.log('Database files:', fs.readdirSync(dbDir));


// One instance for the lifetime of the process.
// NOTE: libsql 0.5.x embedded-replica routes BEGIN/COMMIT through a Hrana
// stream to Turso. That stream can expire during inactivity ("stream not found").
// We make `db` reassignable so reconnectDb() can swap it in-place on expiry.
// Reads (prepare().get/all) are always local (< 1 ms). Only writes go over Hrana,
// and reconnects only happen when the stream actually expires — not every call.
let db = openDb();

function openDb() {
    const instance = new Database(dbPath, {
        syncUrl:   process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    return instance;
}

const STREAM_ERROR = /stream not found|STREAM_EXPIRED|stream has expired|HRANA_CLOSED/i;

function reconnectDb() {
    console.warn('[tracked-SQL] Hrana stream expired — reconnecting...');
    try { db.close(); } catch (_) {}
    db = openDb();
}

// ─── Strip libsql _metadata ───────────────────────────────────────────────────
const strip    = (row)  => { if (!row) return row; const { _metadata, ...r } = row; return r; };
const stripAll = (rows) => rows.map(strip);


// db.sync() is synchronous. Wrap in a Promise for server-core.cjs compatibility,
// deduplicate concurrent callers, and reconnect once on Hrana stream expiry.
let syncPromise = null;
function sync() {
    if (!syncPromise) {
        syncPromise = new Promise((resolve, reject) => {
            try { db.sync(); resolve(); }
            catch (err) {
                if (STREAM_ERROR.test(String(err.message || err))) {
                    reconnectDb();
                    try { db.sync(); resolve(); }
                    catch (err2) { reject(err2); }
                } else {
                    reject(err);
                }
            }
        }).finally(() => { syncPromise = null; });
    }
    return syncPromise;
}


// Wraps a synchronous function in db.transaction() (BEGIN / COMMIT / ROLLBACK).
// Retries once with a fresh connection if a Hrana stream-expiry error is thrown.
// All callers keep their existing `await` via the async shell.
function protected_sql(func) {
    return async (...args) => {
        try {
            return db.transaction(func)(...args);
        } catch (err) {
            if (STREAM_ERROR.test(String(err.message || err))) {
                reconnectDb();
                return db.transaction(func)(...args); // retry once on fresh connection
            }
            throw err;
        }
    };
}


const checkUsername = (username) =>
    username.length >= 1 && username.length <= 20 && /^[a-zA-Z0-9_-]{1,19}$/.test(username);

const checkPassword = (password) =>
    password.length >= 8 && password.length <= 64 &&
    /^[a-zA-Z0-9!`@#\$%\^&\*\(\)-_=\+\[\]\{\}\\|;:'",<\.>\/\? ]{8,63}$/.test(password);

function hashPassword(password, override_safety = false) {
    if (!(checkPassword(password) || override_safety)) throw new Error('Invalid password');
    return bcrypt.hashSync(password, 12);
}


function initializeUserTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            username             TEXT UNIQUE COLLATE NOCASE NOT NULL CHECK(LENGTH(username) BETWEEN 1 AND 19),
            password             TEXT NOT NULL CHECK(LENGTH(password) BETWEEN 8 AND 63),
            account_UUID         TEXT UNIQUE NOT NULL,
            sp_games_Played      INTEGER DEFAULT 0,
            mp_games_Played      INTEGER DEFAULT 0,
            mp_games_Won         INTEGER DEFAULT 0,
            sp_games_Finished    INTEGER DEFAULT 0,
            mp_games_Finished    INTEGER DEFAULT 0,
            account_Creation_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            sp_average_Score     REAL DEFAULT NULL,
            mp_average_Score     REAL DEFAULT NULL,
            last_Login_Date      TEXT DEFAULT CURRENT_TIMESTAMP,
            account_Tier         INTEGER DEFAULT 0,
            eddies               INTEGER DEFAULT 0,
            settings             TEXT DEFAULT '{}'
        )
    `);
}

/*
    Account Tiers:
    0 - default, no extra perks
    1 - VIP (emotes; costs eddies or IRL money)
    2 - PREMIUM (emotes + animation skips + opponent distractions; IRL money only)
    3 - Admin (full access; not obtainable by regular users)
*/

function initializeFriendsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS friends (
            user_id    INTEGER NOT NULL,
            friend_id  INTEGER NOT NULL,
            status     TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, friend_id),
            FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
}

function initializeSessionsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_token TEXT PRIMARY KEY,
            account_UUID  TEXT NOT NULL,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at    TEXT NOT NULL DEFAULT (DATETIME('now', '+7 days')),
            FOREIGN KEY (account_UUID) REFERENCES users(account_UUID) ON DELETE CASCADE
        )
    `);
}

function initializeBannedTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS banned (
            ip_address  TEXT UNIQUE NOT NULL,
            UUID        TEXT UNIQUE DEFAULT NULL,
            reason      TEXT,
            ban_expires DATE DEFAULT NULL,
            FOREIGN KEY (UUID) REFERENCES users(account_UUID) ON DELETE CASCADE
        )
    `);
}

function initializeAllTables() {
    initializeUserTable();
    initializeSessionsTable();
    initializeFriendsTable();
    initializeBannedTable();
}

//reads sectionn
const getAllUsers = async () =>
    stripAll(db.prepare('SELECT * FROM users').all());

const getUserByUsername = (username) =>
    strip(db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(username.toLowerCase())) || null;

const getUserByUUID = (UUID) =>
    strip(db.prepare('SELECT * FROM users WHERE account_UUID = ?').get(UUID)) || null;

const getUserProfileByUUID = (UUID) =>
    strip(db.prepare(`
        SELECT username, sp_games_Played, mp_games_Played, mp_games_Won,
               sp_games_Finished, mp_games_Finished, account_Creation_Date,
               sp_average_Score, mp_average_Score, last_Login_Date,
               account_Tier, eddies
        FROM users WHERE account_UUID = ?
    `).get(UUID)) || null;

const getStaticUserDataByUUID = (UUID) =>
    strip(db.prepare('SELECT username, account_Creation_Date FROM users WHERE account_UUID = ?').get(UUID)) || null;

const getUsernameFromUUID = (UUID) => {
    const row = strip(db.prepare('SELECT username FROM users WHERE account_UUID = ?').get(UUID));
    if (!row) throw new Error('user not found!');
    return row.username;
};

const getUUIDFromUsername = (username) => {
    if (!checkUsername(username)) throw new Error('Invalid username');
    const row = strip(db.prepare('SELECT account_UUID FROM users WHERE LOWER(username) = ?').get(username.toLowerCase()));
    if (!row) throw new Error('user not found!');
    return row.account_UUID;
};


const passwordMatch = async (username, password_attempt) => {
    if (!checkUsername(username) || !checkPassword(password_attempt)) return false;
    const user = getUserByUsername(username);
    if (!user) return false;
    return bcrypt.compareSync(password_attempt, user.password);
};


const createUser = protected_sql((username, password) => {
    if (username.length > 20)     return { ErrorCode: 1, ErrorMessage: 'Max username length exceeded' };
    if (password.length < 8)      return { ErrorCode: 2, ErrorMessage: 'Minimum password length not met' };
    if (username.length < 1)      return { ErrorCode: 3, ErrorMessage: 'Username is required' };
    if (password.length > 64)     return { ErrorCode: 4, ErrorMessage: 'Max password length exceeded' };
    if (!checkUsername(username)) return { ErrorCode: 5, ErrorMessage: 'Invalid username characters' };
    if (!checkPassword(password)) return { ErrorCode: 6, ErrorMessage: 'Invalid password characters' };

    if (getUserByUsername(username)) return { ErrorCode: 7, ErrorMessage: 'Username already taken' };

    const UUID = randomUUID();
    db.prepare('INSERT INTO users (username, password, account_UUID) VALUES (?, ?, ?)')
      .run(username, hashPassword(password), UUID);
    return UUID;
});

const deleteUser = protected_sql((username) => {
    if (!checkUsername(username)) throw new Error('Invalid username');
    if (!getUserByUsername(username)) throw new Error('User not found');
    db.prepare('DELETE FROM users WHERE LOWER(username) = ?').run(username.toLowerCase());
});

const updateGameStats = protected_sql((username, appended_score, gameType, gameWon) => {
    if (!checkUsername(username))           throw new Error('Invalid username');
    if (!['sp', 'mp'].includes(gameType))   throw new Error('Invalid gameType');
    if (gameType === 'sp') gameWon = false;

    const row = strip(db.prepare(`
        SELECT ${gameType}_average_Score, ${gameType}_games_Finished
        FROM users WHERE LOWER(username) = ?
    `).get(username.toLowerCase()));
    if (!row) throw new Error('User not found');

    const avg_score     = row[`${gameType}_average_Score`];
    const gamesFinished = row[`${gameType}_games_Finished`];
    const new_avg_score = avg_score !== null
        ? (avg_score * gamesFinished + appended_score) / (gamesFinished + 1)
        : appended_score;

    db.prepare(`
        UPDATE users
        SET ${gameType}_average_Score     = ?,
            mp_games_Won                  = mp_games_Won + ?,
            ${gameType}_games_Finished    = ${gameType}_games_Finished + 1
        WHERE LOWER(username) = ?
    `).run(new_avg_score, (gameWon && gameType === 'mp') ? 1 : 0, username.toLowerCase());

    return true;
});

const incrementGame = protected_sql((username, gameType) => {
    if (!checkUsername(username))                       throw new Error('Invalid username');
    if (gameType !== 'sp' && gameType !== 'mp')         throw new Error('Invalid game type');
    const info = db.prepare(
        `UPDATE users SET ${gameType}_games_Played = ${gameType}_games_Played + 1 WHERE LOWER(username) = ?`
    ).run(username.toLowerCase());
    if (info.changes === 0) throw new Error('User not found');
    return true;
});

const scoreToEddies = (score) => (Math.floor(score / 100) * 3) + 25;

const addEddies = protected_sql((username, eddiesToAdd) => {
    if (!checkUsername(username)) throw new Error('Invalid username');
    const info = db.prepare('UPDATE users SET eddies = eddies + ? WHERE username = ?')
        .run(eddiesToAdd, username);
    if (info.changes === 0) throw new Error('User not found');
    return true;
});

const updateLastLoginDateFromUsername = protected_sql((username) => {
    if (!checkUsername(username)) throw new Error('Invalid username');
    const info = db.prepare('UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE LOWER(username) = ?')
        .run(username.toLowerCase());
    if (info.changes === 0) throw new Error('User not found');
    return true;
});

const updateLastLoginDateFromUUID = protected_sql((UUID) => {
    if (!UUID || UUID.length < 30) throw new Error('Invalid UUID');
    const info = db.prepare('UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE account_UUID = ?')
        .run(UUID);
    if (info.changes === 0) throw new Error('User not found');
    return true;
});


const friendsCount = async (userId) => {
    const row = strip(db.prepare(`
        SELECT COUNT(*) AS count FROM friends
        WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
    `).get(userId, userId));
    return row.count;
};

const sendFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    const existing = strip(db.prepare(`
        SELECT * FROM friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(userId, friendId, friendId, userId));

    if (existing) {
        if (existing.user_id == userId) return false; // already sent by this user
        // reverse request exists — auto-accept
        db.prepare(`UPDATE friends SET status = 'accepted' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`)
          .run(userId, friendId, friendId, userId);
        return true;
    }
    db.prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(userId, friendId);
    return true;
});

const acceptFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    const existing = strip(db.prepare(`
        SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).get(friendId, userId));
    if (!existing) return false;
    db.prepare(`UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`)
      .run(friendId, userId);
    return true;
});


const createSessionTokenForUUID = protected_sql((UUID) => {
    const opaque = hash('sha512', randomBytes(32)).toString('hex');
    db.prepare('INSERT INTO sessions (session_token, account_UUID) VALUES (?, ?)').run(opaque, UUID);
    return opaque;
});

const sessionTokenToUUID = async (token) => {
    const row = strip(db.prepare(`
        SELECT account_UUID, (DATETIME('now') >= expires_at) AS is_expired
        FROM sessions WHERE session_token = ?
    `).get(token));
    if (!row) return null;
    if (row.is_expired) {
        try { db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token); }
        catch (err) { console.warn('Failed to clean up expired session token:', err.message); }
        return null;
    }
    return row.account_UUID;
};

const deleteSessionTokenFromUUID = async (UUID) => {
    const info = db.prepare('DELETE FROM sessions WHERE account_UUID = ?').run(UUID);
    if (info.changes === 0) throw new Error('Session token not found');
    return info.changes;
};

const deleteSessionToken = async (token) => {
    const info = db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
    if (info.changes === 0) throw new Error('Session token not found');
    return info.changes;
};

const clearExpiredSessionTokens = async () => {
    const info = db.prepare('DELETE FROM sessions WHERE expires_at <= DATETIME("now")').run();
    return info.changes;
};

const clearAllSessionTokens = async () => {
    const info = db.prepare('DELETE FROM sessions').run();
    return info.changes;
};


const banUser = protected_sql((ip, UUID, reason, ban_length_days) => {
    if (Number.isNaN(ban_length_days)) throw new Error('Invalid ban length');
    const indefinite = ban_length_days == null || ban_length_days === Infinity;
    if (!indefinite && ban_length_days < 0) throw new Error('Invalid ban length');

    const ban_expires = indefinite
        ? null
        : new Date(Date.now() + ban_length_days * 86400000).toISOString();

    try {
        db.prepare('INSERT INTO banned (ip_address, UUID, reason, ban_expires) VALUES (?, ?, ?, ?)')
          .run(ip, UUID, reason, ban_expires);
        return true;
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('info is already banned');
        throw err;
    }
});

const isIPBanned = async (ip) => {
    const row = strip(db.prepare('SELECT * FROM banned WHERE ip_address = ?').get(ip));
    if (!row) return false;
    if (!row.ban_expires) return true;
    if (new Date() >= new Date(row.ban_expires)) {
        try { db.prepare('DELETE FROM banned WHERE ip_address = ?').run(ip); } catch (_) {}
        return false;
    }
    return true;
};

const isUUIDBanned = async (UUID) => {
    const row = strip(db.prepare('SELECT * FROM banned WHERE UUID = ?').get(UUID));
    if (!row) return false;
    if (!row.ban_expires) return true;
    if (new Date() >= new Date(row.ban_expires)) {
        try { db.prepare('DELETE FROM banned WHERE UUID = ?').run(UUID); } catch (_) {}
        return false;
    }
    return true;
};

const unbanIP = protected_sql((ip) => {
    const info = db.prepare('DELETE FROM banned WHERE ip_address = ?').run(ip);
    if (info.changes === 0) throw new Error('IP address not found in banned table');
    return true;
});

const unbanUUID = protected_sql((UUID) => {
    const info = db.prepare('DELETE FROM banned WHERE UUID = ?').run(UUID);
    if (info.changes === 0) throw new Error('UUID not found in banned table');
    return true;
});


const isAdmin = async (UUID) => {
    if (TESTING_MODE) return true;
    if (!UUID || UUID.length < 30) return false;
    const row = strip(db.prepare('SELECT account_Tier FROM users WHERE account_UUID = ?').get(UUID));
    return !!(row && row.account_Tier === 3);
};


const wipeDatabase = () => {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
        db.prepare('DROP TABLE IF EXISTS friends').run();
        db.prepare('DROP TABLE IF EXISTS sessions').run();
        db.prepare('DROP TABLE IF EXISTS banned').run();
        db.prepare('DROP TABLE IF EXISTS users').run();
    })();
    db.pragma('foreign_keys = ON');
    initializeAllTables();
    console.log('Database wiped and re-initialized');
};


module.exports = {
    db,              // persistent Database instance  — used by hard-db.cjs (forcePush / hardReset)
    sql: Database,   // Database constructor class    — used by hard-db.cjs (getRemote)
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
};






