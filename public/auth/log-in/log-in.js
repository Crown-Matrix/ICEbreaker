
if (localStorage.getItem('x-userdata-username') != null) {
    window.location.href = '/profile'
}

// After cardReveal finishes, lock opacity:1 as an inline style so that any
// later animation (e.g. shake) overriding the `animation` property cannot
// cause the card to revert to the CSS opacity:0 and disappear.
document.querySelector('.cy-card').addEventListener('animationend', function (e) {
    if (e.animationName === 'cardReveal') this.style.opacity = '1';
}, { once: true });

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const guestBtn = document.getElementById('guest-btn');

document.querySelector('.cy-close').addEventListener('click', () => {
    window.location.href = '/';
});

function showToast(msg, isErr = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'cy-toast show' + (isErr ? ' err' : '');
    setTimeout(() => { t.className = 'cy-toast' + (isErr ? ' err' : ''); }, 3000);
}

function shakeCard() {
    const card = document.querySelector('.cy-card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
}

// allow enter key
[usernameInput, passwordInput].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') submitBtn.click(); });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = usernameInput.value.trim();
    const p = passwordInput.value;

    if (u.length > 20) { usernameInput.classList.add('error'); document.getElementById('username-hint').textContent = 'Handle too long.'; document.getElementById('username-hint').className = 'field-hint err'; return; }
    if (u.length < 1) { usernameInput.classList.add('error'); document.getElementById('username-hint').textContent = 'Handle too short.'; document.getElementById('username-hint').className = 'field-hint err'; return; }
    if (p.length > 64) { passwordInput.classList.add('error'); document.getElementById('password-hint').textContent = 'Access code too long.'; document.getElementById('password-hint').className = 'field-hint err'; return; }
    if (p.length < 8) { passwordInput.classList.add('error'); document.getElementById('password-hint').textContent = 'Access code too short.'; document.getElementById('password-hint').className = 'field-hint err'; return; }
    if (!/^[a-zA-Z0-9_-]{1,19}$/.test(u)) { usernameInput.classList.add('error'); document.getElementById('username-hint').textContent = 'Invalid handle characters.'; document.getElementById('username-hint').className = 'field-hint err'; return; }
    if (!/^[A-Za-z0-9!`@#\$%\^&\*\(\)-_=\+\[\]\{\}\\|;:'",<\.>\/\? ]{8,63}$/.test(p)) { passwordInput.classList.add('error'); document.getElementById('password-hint').textContent = 'Invalid access code characters.'; document.getElementById('password-hint').className = 'field-hint err'; return; }

    if (!u) { usernameInput.classList.add('error'); document.getElementById('username-hint').textContent = 'Handle required.'; document.getElementById('username-hint').className = 'field-hint err'; return; }
    if (!p) { passwordInput.classList.add('error'); document.getElementById('password-hint').textContent = 'Access code required.'; document.getElementById('password-hint').className = 'field-hint err'; return; }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const res = await fetch('/log-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Access granted. Initializing...');
            res.headers.forEach((value, key) => {
                if (key.startsWith('x-userdata-')) {
                    localStorage.setItem(key, decodeURIComponent(value));
                }
            });
            setTimeout(() => window.location.replace('/'), 1200);
        } else {
            shakeCard();
            showToast(data.message || 'Authentication failed.', true);
            usernameInput.classList.add('error');
            passwordInput.classList.add('error');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    } catch (e) {
        showToast('Network error.', true);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

guestBtn.addEventListener('click', () => {
    window.location.replace('/');
});

// clear error state on type
usernameInput.addEventListener('input', () => { usernameInput.classList.remove('error'); document.getElementById('username-hint').className = 'field-hint'; document.getElementById('username-hint').textContent = ''; });
passwordInput.addEventListener('input', () => { passwordInput.classList.remove('error'); document.getElementById('password-hint').className = 'field-hint'; document.getElementById('password-hint').textContent = ''; });