
if (localStorage.getItem('x-userdata-username') == null) {
    window.location.href = '/login'
}

// After cardReveal finishes, lock opacity:1 as an inline style so that any
// later animation overriding the `animation` property cannot cause the card
// to revert to the CSS opacity:0 and disappear.
document.querySelector('.cy-card').addEventListener('animationend', function (e) {
    if (e.animationName === 'cardReveal') this.style.opacity = '1';
}, { once: true });

document.getElementById('guest-access-btn').addEventListener('click', () => {
    window.location.replace('/');
});

document.getElementById('log-in-btn').addEventListener('click', () => {
    window.location.replace('/log-in');
});

fetch('/log-out', {
    method: 'POST',
    credentials: 'same-origin',
}).catch((err) => {
    console.error('Logout failed:', err);
}).then(() => {
    localStorage.removeItem('icebreaker.profile.friendship');
    localStorage.removeItem('latest_ban_reason');
    //intentionally leaving out the removal of 'settings' because it can apply for guest accounts as well
});



// Terminal animation
const lines = [
    { text: '> INITIATING SESSION TERMINATION...', cls: '', delay: 200 },
    { text: '> REVOKING SESSION TOKEN...........OK', cls: 'cyan', delay: 600 },
    { text: '> CLEARING LOCAL CREDENTIALS.......OK', cls: 'cyan', delay: 1000 },
    { text: '> PURGING MEMORY CACHE.............OK', cls: 'cyan', delay: 1400 },
    { text: '> SESSION TERMINATED SUCCESSFULLY', cls: 'green', delay: 1900 },
];

const terminal = document.getElementById('terminal');

lines.forEach(({ text, cls, delay }) => {
    setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'line' + (cls ? ' ' + cls : '');
        line.textContent = text;
        line.style.animationDelay = '0s';
        terminal.insertBefore(line, terminal.querySelector('.cursor'));
    }, delay);
});