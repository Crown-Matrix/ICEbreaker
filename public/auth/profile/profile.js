// client-side account profile view - profile.js

const STORAGE_KEYS = {
    username: 'x-userdata-username',
    accountCreationDate: 'x-userdata-accountcreationdate',
    friendship: 'icebreaker.profile.friendship'
};

const NO_DATA = 'NO DATA';
const REQUEST_SENT_STATUS = 'Request sent';

const ACCOUNT_TIERS = {
    0: { name: 'Novice', color: '#FFE600' },
    1: { name: 'VIP', color: '#00FFFF' },
    2: { name: 'Premium', color: '#9D00FF' },
    3: { name: 'Admin', color: 'var(--cy-magenta)' }
};

const DEFAULT_FRIENDSHIP_STATE = {
    incoming: [],
    outgoing: [],
    friends: [],
    pendingRemove: []
};

const FIELD_CONFIG = {
    username: { id: 'username', label: 'Username', type: 'text' },
    sp_games_Played: { id: 'sp_games_Played', label: 'Games Played', type: 'number' },
    mp_games_Played: { id: 'mp_games_Played', label: 'Games Played', type: 'number' },
    mp_games_Won: { id: 'mp_games_Won', label: 'Games Won', type: 'number' },
    sp_games_Finished: { id: 'sp_games_Finished', label: 'Games Finished', type: 'number' },
    mp_games_Finished: { id: 'mp_games_Finished', label: 'Games Finished', type: 'number' },
    sp_average_Score: { id: 'sp_average_score', label: 'Average Score', type: 'score' },
    mp_average_Score: { id: 'mp_average_score', label: 'Average Score', type: 'score' },
    account_Creation_Date: { id: 'account_Creation_Date', label: 'Account Creation Date', type: 'date' },
    last_Login_Date: { id: 'last_Login_Date', label: 'Last Login Date', type: 'date' }
};

const tabGroups = {
    account: 'account',
    singleplayer: 'singleplayer',
    multiplayer: 'multiplayer',
    friends: 'friends'
};

const dom = {
    usernameTitle: document.getElementById('username-title'),
    systemStatus: document.getElementById('system-status'),
    syncOverlay: document.getElementById('syncOverlay'),
    statFrame: document.getElementById('stat-frame'),
    tabButtons: {
        account: document.getElementById('account-tab'),
        singleplayer: document.getElementById('singleplayer-tab'),
        multiplayer: document.getElementById('multiplayer-tab'),
        friends: document.getElementById('friends-tab')
    },
    friendshipSummary: document.getElementById('friendship-summary'),
    requestInput: document.getElementById('friend-search-input'),
    requestSendButton: document.getElementById('friend-search-clear'),
    requestStatusPanel: document.getElementById('friend-search-results'),
    friendshipIncomingList: document.getElementById('friend-incoming-list'),
    friendshipOutgoingList: document.getElementById('friend-outgoing-list'),
    friendshipList: document.getElementById('friend-list'),
    friendshipOpenBtn: document.getElementById('friendship-open-btn'),
    friendshipCloseBtn: document.getElementById('friendship-close-btn'),
    friendshipToast: document.getElementById('friendship-toast'),
    eddies: document.getElementById('eddies'),
    tierValue: document.getElementById('tier-value')
};

const username = localStorage.getItem(STORAGE_KEYS.username) || '';
document.documentElement.style.setProperty('--username', `'${username}'`);
if (dom.usernameTitle) dom.usernameTitle.textContent = username;
if (dom.systemStatus) dom.systemStatus.setAttribute('pending', '');
if (username) document.title = `Profile - ${username}`;

let friendshipState = loadFriendshipState();
let challengeState = { incoming: [], outgoing: [], activeMatch: null };
let challengePollInterval = null;

init();

function init() {
    setupTabs();
    setupFriendshipUI();
    renderFriendshipSystem();
    updateProfileData();
    syncFriendshipsFromServer();
    startChallengePoll();
}

async function syncFriendshipsFromServer() {
    try {
        const res = await fetch('/profile/api/friends');
        if (!res.ok) return;
        const data = await res.json();
        setFriendshipState({
            incoming: (data.incoming || []).map(entry => ({
                name:   entry.username,
                status: entry.created_at ? formatDate(entry.created_at) : 'Awaiting response'
            })),
            outgoing: (data.outgoing || []).map(entry => ({
                name:   entry.username,
                status: entry.created_at ? formatDate(entry.created_at) : 'Request sent'
            })),
            friends: (data.friends || []).map(name => ({ name, status: '' })),
            pendingRemove: []
        });
    } catch { /* silent — local state stays as-is */ }
}

// Direct-challenge system

async function syncChallengesFromServer() {
    try {
        const res = await fetch('/profile/api/challenges', { cache: 'no-store' }); // avoid stale cached response
        if (!res.ok) return;
        const data = await res.json();
        challengeState = {
            incoming:    data.incoming    || [],
            outgoing:    data.outgoing    || [],
            activeMatch: data.activeMatch || null
        };
        renderChallengeSystem();
        updateChallengeBadge();
        renderFriendshipSystem();
        if (data.activeMatch) {
            navigateToDirectMatch(data.activeMatch.matchUUID);
        }
    } catch { /* silent */ }
}

function navigateToDirectMatch(matchUUID) {
    if (!matchUUID) return;

    // We already sent this session to this exact match — don't do it again.
    // (Prevents redirect loops when the server still reports an
    // activeMatch that's actually stale/finished.)
    if (sessionStorage.getItem('directMatchUUID') === matchUUID) return;

    clearInterval(challengePollInterval);
    sessionStorage.setItem('directMatchUUID', matchUUID);
    window.location.href = '/multiPlayer/multiPlayerReference.html';
}

function startChallengePoll() {
    syncChallengesFromServer();
    challengePollInterval = setInterval(syncChallengesFromServer, 4000);
}

function renderChallengeSystem() {
    const incomingList = document.getElementById('challenge-incoming-list');
    const outgoingList = document.getElementById('challenge-outgoing-list');

    if (incomingList) {
        if (!challengeState.incoming.length) {
            incomingList.innerHTML = '<div class="friendship-empty">No incoming challenges.</div>';
        } else {
            incomingList.innerHTML = challengeState.incoming.map(c => `
                <div class="friendship-entry">
                    <div class="friendship-entry-main">
                        <span class="friendship-name">${c.username}</span>
                        <span class="friendship-meta">Challenged you</span>
                    </div>
                    <div class="friendship-actions">
                        <button type="button" class="challenge-btn" data-friend-action="challenge" data-friend-name="${c.username}">⚡ Challenge Back</button>
                    </div>
                </div>
            `).join('');
        }
    }

    if (outgoingList) {
        if (!challengeState.outgoing.length) {
            outgoingList.innerHTML = '<div class="friendship-empty">No outgoing challenges.</div>';
        } else {
            outgoingList.innerHTML = challengeState.outgoing.map(c => `
                <div class="friendship-entry">
                    <div class="friendship-entry-main">
                        <span class="friendship-name">${c.username}</span>
                        <span class="friendship-meta">Challenge sent</span>
                    </div>
                    <div class="friendship-actions">
                        <button type="button" data-friend-action="cancel-challenge" data-friend-name="${c.username}">Cancel</button>
                    </div>
                </div>
            `).join('');
        }
    }
}

function updateChallengeBadge() {
    const badge = document.getElementById('challenge-badge');
    if (!badge) return;
    const count = challengeState.incoming.length;
    badge.textContent = count;
    badge.hidden = count === 0;
}

// ─────────────────────────────────────────────────────────────────────────

function setupTabs() {
    if (!dom.statFrame) return;

    Object.entries(dom.tabButtons).forEach(([key, element]) => {
        if (!element) return;
        element.addEventListener('click', () => showTabGroup(tabGroups[key]));
    });

    dom.tabButtons.account?.click();
}

function showTabGroup(group) {
    dom.statFrame.querySelectorAll('.stat-card[group]').forEach(element => {
        element.style.display = element.getAttribute('group') === group ? 'block' : 'none';
    });
}

async function fetchUserData() {
    const response = await fetch(`/profile/api/user/${username}`);

    if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
            localStorage.removeItem(STORAGE_KEYS.username);
            localStorage.removeItem(STORAGE_KEYS.accountCreationDate);
            window.location.href = '/login';
            return null;
        }
        console.error('Failed to fetch user data:', response.statusText);
        return null;
    }

    return response.json();
}

async function updateProfileData() {
    const userProfileData = await fetchUserData();
    if (!userProfileData) {
        console.error('No user data available to update profile.');
        return;
    }

    document.dispatchEvent(new CustomEvent('profileDataUpdate', { detail: userProfileData }));
}

function loadFriendshipState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.friendship);
        if (!raw) return structuredClone(DEFAULT_FRIENDSHIP_STATE);

        const parsed = JSON.parse(raw);
        return {
            incoming: sanitizeFriendEntries(parsed.incoming),
            outgoing: sanitizeFriendEntries(parsed.outgoing),
            friends: sanitizeFriendEntries(parsed.friends),
            pendingRemove: Array.isArray(parsed.pendingRemove)
                ? parsed.pendingRemove.map(normalizeName).filter(Boolean)
                : []
        };
    } catch {
        return structuredClone(DEFAULT_FRIENDSHIP_STATE);
    }
}

function sanitizeFriendEntries(list) {
    if (!Array.isArray(list)) return [];

    return list
        .map(entry => ({
            name: normalizeName(entry?.name),
            status: normalizeName(entry?.status)
        }))
        .filter(entry => entry.name);
}

function saveFriendshipState() {
    localStorage.setItem(STORAGE_KEYS.friendship, JSON.stringify(friendshipState));
}

function normalizeName(value) {
    return String(value ?? '').trim();
}

function namesMatch(left, right) {
    return normalizeName(left).toLowerCase() === normalizeName(right).toLowerCase();
}

function isKnownFriend(name) {
    return friendshipState.friends.some(entry => namesMatch(entry.name, name))
        || friendshipState.incoming.some(entry => namesMatch(entry.name, name))
        || friendshipState.outgoing.some(entry => namesMatch(entry.name, name));
}

function isPendingRemoval(name) {
    return friendshipState.pendingRemove.some(entry => namesMatch(entry, name));
}

function createFriendshipResult(ok, reason = '') {
    return { ok, reason };
}

function upsertEntry(listName, name, status, position = 'front') {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return false;

    friendshipState[listName] = friendshipState[listName].filter(entry => !namesMatch(entry.name, normalizedName));
    const nextEntry = { name: normalizedName, status: normalizeName(status) };

    if (position === 'front') {
        friendshipState[listName].unshift(nextEntry);
    } else {
        friendshipState[listName].push(nextEntry);
    }
    return true;
}

function removeFromList(listName, name) {
    const beforeLength = friendshipState[listName].length;
    friendshipState[listName] = friendshipState[listName].filter(entry => !namesMatch(entry.name, name));
    return friendshipState[listName].length !== beforeLength;
}

function addOutgoingRequest(name, status = REQUEST_SENT_STATUS) {
    const target = normalizeName(name);
    if (!target) return createFriendshipResult(false, 'Enter a username first.');
    if (namesMatch(target, username)) return createFriendshipResult(false, 'You cannot send a request to yourself.');
    if (isKnownFriend(target)) return createFriendshipResult(false, `${target} is already in your friendship lists.`);

    upsertEntry('outgoing', target, status);
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, `Request sent to ${target}.`);
}

function addIncomingRequest(name, status = 'Awaiting response') {
    const target = normalizeName(name);
    if (!target) return createFriendshipResult(false, 'Missing username.');
    if (isKnownFriend(target)) return createFriendshipResult(false, `${target} already exists in friendship lists.`);

    upsertEntry('incoming', target, status);
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, `${target} added to incoming requests.`);
}

function addFriend(name, status = '') {
    const target = normalizeName(name);
    if (!target) return createFriendshipResult(false, 'Missing username.');
    if (namesMatch(target, username)) return createFriendshipResult(false, 'You cannot add yourself.');

    removeFromList('incoming', target);
    removeFromList('outgoing', target);
    friendshipState.pendingRemove = friendshipState.pendingRemove.filter(entry => !namesMatch(entry, target));
    upsertEntry('friends', target, normalizeName(status));
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, `${target} added to friends.`);
}

function setFriendStatus(name, status) {
    const target = normalizeName(name);
    if (!target) return createFriendshipResult(false, 'Missing username.');
    const index = friendshipState.friends.findIndex(entry => namesMatch(entry.name, target));
    if (index === -1) return createFriendshipResult(false, `${target} is not in your friend list.`);

    friendshipState.friends[index] = {
        ...friendshipState.friends[index],
        status: normalizeName(status)
    };
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, `${target} status updated.`);
}

function removeIncomingRequest(name) {
    const removed = removeFromList('incoming', name);
    saveFriendshipState();
    renderFriendshipSystem();
    return removed
        ? createFriendshipResult(true, `${normalizeName(name)} removed from incoming requests.`)
        : createFriendshipResult(false, `${normalizeName(name)} was not in incoming requests.`);
}

function removeOutgoingRequest(name) {
    const removed = removeFromList('outgoing', name);
    saveFriendshipState();
    renderFriendshipSystem();
    return removed
        ? createFriendshipResult(true, `${normalizeName(name)} removed from outgoing requests.`)
        : createFriendshipResult(false, `${normalizeName(name)} was not in outgoing requests.`);
}

function removeFriend(name) {
    const target = normalizeName(name);
    const removed = removeFromList('friends', target);
    friendshipState.pendingRemove = friendshipState.pendingRemove.filter(entry => !namesMatch(entry, target));
    saveFriendshipState();
    renderFriendshipSystem();
    return removed
        ? createFriendshipResult(true, `${target} removed from friends.`)
        : createFriendshipResult(false, `${target} was not in your friend list.`);
}

function acceptIncomingRequest(name) {
    const target = normalizeName(name);
    const wasIncoming = removeFromList('incoming', target);
    if (!wasIncoming) return createFriendshipResult(false, `${target} was not in incoming requests.`);
    return addFriend(target);
}

function declineIncomingRequest(name) {
    return removeIncomingRequest(name);
}

function cancelOutgoingRequest(name) {
    return removeOutgoingRequest(name);
}

function markFriendForRemoval(name) {
    const target = normalizeName(name);
    if (!target) return createFriendshipResult(false, 'Missing username.');
    if (!friendshipState.friends.some(entry => namesMatch(entry.name, target))) {
        return createFriendshipResult(false, `${target} is not in your friend list.`);
    }

    if (isPendingRemoval(target)) {
        return removeFriend(target);
    }

    friendshipState.pendingRemove = [
        ...friendshipState.pendingRemove.filter(entry => !namesMatch(entry, target)),
        target
    ];
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, `Click remove again to confirm deleting ${target}.`);
}

function setFriendshipState(nextState) {
    friendshipState = {
        incoming: sanitizeFriendEntries(nextState?.incoming),
        outgoing: sanitizeFriendEntries(nextState?.outgoing),
        friends: sanitizeFriendEntries(nextState?.friends),
        pendingRemove: Array.isArray(nextState?.pendingRemove)
            ? nextState.pendingRemove.map(normalizeName).filter(Boolean)
            : []
    };
    saveFriendshipState();
    renderFriendshipSystem();
    return createFriendshipResult(true, 'Friendship state replaced.');
}

function getFriendshipState() {
    return structuredClone(friendshipState);
}

function renderFriendshipList(container, items, kind, emptyLabel) {
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="friendship-empty">${emptyLabel}</div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const actions = getFriendActions(kind, item.name);
        return `
            <div class="friendship-entry">
                <div class="friendship-entry-main">
                    <span class="friendship-name">${item.name}</span>
                    <span class="friendship-meta">${item.status}</span>
                </div>
                <div class="friendship-actions">
                    ${actions.map(button => `
                        <button type="button" class="${button.className || ''}" data-friend-action="${button.action}" data-friend-name="${item.name}">
                            ${button.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function getFriendActions(kind, name) {
    if (kind === 'incoming') {
        return [
            { action: 'accept', label: 'Accept' },
            { action: 'decline', label: 'Decline' }
        ];
    }
    if (kind === 'outgoing') {
        return [{ action: 'cancel', label: 'Cancel' }];
    }
    if (kind === 'friends') {
        const confirm    = isPendingRemoval(name);
        const challenged = challengeState.outgoing.some(c => c.username === name);
        const incoming   = challengeState.incoming.some(c => c.username === name);
        const actions = [{
            action: 'remove',
            label: confirm ? 'Confirm?' : 'Remove',
            className: confirm ? 'friend-action-remove-confirm' : ''
        }];
        // Don't show challenge button if they already challenged us (show "Challenge Back" in the Challenges panel instead)
        if (!incoming) {
            actions.push(challenged
                ? { action: 'cancel-challenge', label: '✕ Challenge', className: 'challenge-btn-sent' }
                : { action: 'challenge',        label: '⚡ Challenge', className: 'challenge-btn' }
            );
        }
        return actions;
    }
    return [];
}

function renderRequestComposerStatus(customMessage = '') {
    if (!dom.requestStatusPanel) return;

    const inputValue = normalizeName(dom.requestInput?.value);
    if (customMessage) {
        dom.requestStatusPanel.innerHTML = `<div class="friendship-empty">${customMessage}</div>`;
        return;
    }

    if (!inputValue) {
        dom.requestStatusPanel.innerHTML = '<div class="friendship-empty">Enter a username and press Send.</div>';
        return;
    }

    dom.requestStatusPanel.innerHTML = `<div class="friendship-empty">Ready to send request to ${inputValue}.</div>`;
}

function renderFriendshipSystem() {
    if (dom.friendshipSummary) {
        dom.friendshipSummary.textContent = `${friendshipState.friends.length} Friends`;
    }

    renderFriendshipList(dom.friendshipIncomingList, friendshipState.incoming, 'incoming', 'No incoming requests.');
    renderFriendshipList(dom.friendshipOutgoingList, friendshipState.outgoing, 'outgoing', 'No outgoing requests.');
    renderFriendshipList(dom.friendshipList, friendshipState.friends, 'friends', 'No friends yet.');
    renderChallengeSystem();
    updateChallengeBadge();
    renderRequestComposerStatus();
}

function setupFriendshipUI() {
    dom.friendshipOpenBtn?.addEventListener('click', toggleFriendshipToast);
    dom.friendshipCloseBtn?.addEventListener('click', closeFriendshipToast);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeFriendshipToast();
    });

    document.addEventListener('click', handleFriendshipOutsideClick);
    document.addEventListener('click', handleFriendActionClick);

    dom.requestInput?.addEventListener('input', () => {
        renderRequestComposerStatus();
    });

    dom.requestInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSendRequestFromInput();
        }
    });

    dom.requestSendButton?.addEventListener('click', handleSendRequestFromInput);
}

async function handleSendRequestFromInput() {
    const targetName = normalizeName(dom.requestInput?.value);
    if (!targetName) {
        renderRequestComposerStatus('Enter a username first.');
        return;
    }
    if (namesMatch(targetName, username)) {
        renderRequestComposerStatus('You cannot send a request to yourself.');
        return;
    }
    if (isKnownFriend(targetName)) {
        renderRequestComposerStatus(`${targetName} is already in your friendship lists.`);
        return;
    }

    renderRequestComposerStatus('Sending request...');
    try {
        const res = await fetch('/profile/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: targetName })
        });
        const data = await res.json();
        if (res.ok) {
            const result = addOutgoingRequest(targetName);
            renderRequestComposerStatus(result.reason);
            if (result.ok && dom.requestInput) dom.requestInput.value = '';
        } else {
            renderRequestComposerStatus(data.error || 'Failed to send request.');
        }
    } catch {
        renderRequestComposerStatus('Network error. Try again.');
    }
}

function toggleFriendshipToast() {
    if (!dom.friendshipToast) return;
    if (dom.friendshipToast.hidden) {
        openFriendshipToast();
    } else {
        closeFriendshipToast();
    }
}

function openFriendshipToast() {
    if (!dom.friendshipToast) return;
    dom.friendshipToast.hidden = false;
    requestAnimationFrame(() => dom.requestInput?.focus());
}

function closeFriendshipToast() {
    if (dom.friendshipToast) dom.friendshipToast.hidden = true;
}

function handleFriendshipOutsideClick(event) {
    if (!dom.friendshipToast || dom.friendshipToast.hidden) return;
    if (event.target.closest('#friendship-toast') || event.target.closest('#friendship-open-btn')) return;
    closeFriendshipToast();
}

async function handleFriendActionClick(event) {
    const button = event.target.closest('[data-friend-action]');
    if (!button) return;

    const action = button.getAttribute('data-friend-action');
    const friendName = normalizeName(button.getAttribute('data-friend-name'));
    if (!action || !friendName) return;

    if (action === 'accept') {
        try {
            const res = await fetch('/profile/api/friends/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: friendName })
            });
            if (res.ok) acceptIncomingRequest(friendName);
        } catch { /* network error — leave local state unchanged */ }
        return;
    }
    if (action === 'decline') {
        try {
            const res = await fetch('/profile/api/friends/decline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: friendName })
            });
            if (res.ok) declineIncomingRequest(friendName);
        } catch { /* network error */ }
        return;
    }
    if (action === 'cancel') {
        try {
            const res = await fetch('/profile/api/friends/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: friendName })
            });
            if (res.ok) cancelOutgoingRequest(friendName);
        } catch { /* network error */ }
        return;
    }
    if (action === 'remove') {
        if (isPendingRemoval(friendName)) {
            // Second click — confirmed; call server then remove locally
            try {
                const res = await fetch('/profile/api/friends/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: friendName })
                });
                if (res.ok) markFriendForRemoval(friendName); // now executes removeFriend() locally
            } catch { /* network error */ }
        } else {
            // First click — just mark as pending confirmation, no API call yet
            markFriendForRemoval(friendName);
        }
        return;
    }
    if (action === 'challenge') {
        try {
            const res = await fetch('/profile/api/challenge/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: friendName })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.matched) {
                    navigateToDirectMatch(data.matchUUID);
                } else if (!data.alreadySent) {
                    challengeState.outgoing.push({ username: friendName });
                    renderFriendshipSystem();
                }
            }
        } catch { /* network error */ }
        return;
    }
    if (action === 'cancel-challenge') {
        try {
            const res = await fetch('/profile/api/challenge/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: friendName })
            });
            if (res.ok) {
                challengeState.outgoing = challengeState.outgoing.filter(c => c.username !== friendName);
                renderFriendshipSystem();
            }
        } catch { /* network error */ }
        return;
    }
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function formatScore(value) {
    if (value === null || value === undefined) return NO_DATA;
    return formatNumber(value);
}

function formatDate(value, includeTime = true) {
    if (!value) return NO_DATA;

    const config = {
        dateStyle: 'long',
        ...(includeTime && { timeStyle: 'short' })
    };

    const date = new Date(value.replace(' ', 'T') + 'Z');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const toLocaleDate = input => input.toLocaleDateString(undefined, { dateStyle: 'long' });
    const todayLabel = toLocaleDate(today);
    const yesterdayLabel = toLocaleDate(yesterday);

    let formatted = date.toLocaleString(undefined, config);
    if (toLocaleDate(date) === todayLabel) return formatted.replace(todayLabel, 'Today');
    if (toLocaleDate(date) === yesterdayLabel) return formatted.replace(yesterdayLabel, 'Yesterday');
    return formatted;
}

function updateProfile(data) {
    Object.keys(FIELD_CONFIG).forEach(key => {
        const config = FIELD_CONFIG[key];
        const element = document.getElementById(config.id);
        const statText = element?.querySelector('.stat-p');
        if (!statText) return;

        statText.textContent = `${config.label}: ${formatFieldValue(config, data[key])}`;
    });

    const eddiesText = dom.eddies?.querySelector('.stat-p');
    if (eddiesText) {
        eddiesText.textContent = `₿ ${formatNumber(data.eddies)} EDDIES`;
    }

    const tier = ACCOUNT_TIERS[data.account_tier] || ACCOUNT_TIERS[0];
    if (!dom.tierValue) return;
    dom.tierValue.textContent = tier.name.toUpperCase();
    dom.tierValue.style.color = tier.color;
    dom.tierValue.style.borderColor = tier.color;
}

function formatFieldValue(config, value) {
    if (config.type === 'score') return formatScore(value);
    if (config.type === 'date') return formatDate(value, config.id === 'last_Login_Date');
    if (config.type === 'number') return formatNumber(value);
    return value ?? NO_DATA;
}

window.profileFriendship = {
    getState: getFriendshipState,
    setState: setFriendshipState,
    addOutgoingRequest,
    addIncomingRequest,
    addFriend,
    setFriendStatus,
    removeIncomingRequest,
    removeOutgoingRequest,
    removeFriend,
    acceptIncomingRequest,
    declineIncomingRequest,
    cancelOutgoingRequest,
    markFriendForRemoval,
    render: renderFriendshipSystem
};

document.addEventListener('profileDataUpdate', event => {
    if (!dom.syncOverlay) return;
    dom.syncOverlay.classList.add('sync-active');

    setTimeout(() => {
        updateProfile(event.detail);
        dom.syncOverlay.classList.remove('sync-active');
        if (dom.systemStatus) {
            dom.systemStatus.removeAttribute('pending');
            dom.systemStatus.textContent = '● CONNECTION VERIFIED';
        }
    }, 350);
});




document.querySelector('.back-btn').addEventListener('click', () => {
    window.location.href = '/';
});