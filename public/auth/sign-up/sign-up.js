

if (localStorage.getItem('x-userdata-username') != null) {
    window.location.href = '/profile'
}

// After cardReveal finishes, lock opacity:1 as an inline style so that any
// later animation overriding the `animation` property cannot cause the card
// to revert to the CSS opacity:0 and disappear.
document.querySelector('.cy-card').addEventListener('animationend', function (e) {
    if (e.animationName === 'cardReveal') this.style.opacity = '1';
}, { once: true });

document.querySelector('.cy-close').addEventListener('click', () => {
    window.location.href = '/';
});


const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const submitBtn = document.getElementById('submit-btn');
const usernameHint = document.getElementById('username-hint');
const passwordHint = document.getElementById('password-hint');
const confirmHint = document.getElementById('confirm-hint');
const btnIdle = document.getElementById('btn-idle');
const btnBusy = document.getElementById('btn-busy');
const segs = [1, 2, 3, 4].map(i => document.getElementById('s' + i));

function scorePassword(pw) {
    let score = 0;
    if (pw.length < 8) return 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || /[0-9]/.test(pw)) score++;
    return score; // 0-4
}

function updateStrengthBar(score) {
    const levels = ['', 'weak', 'weak', 'medium', 'strong'];
    segs.forEach((s, i) => {
        s.className = 'strength-seg';
        if (i < score) s.classList.add(levels[score]);
    });
    const labels = ['', 'Weak', 'Weak', 'Moderate', 'Strong'];
    passwordHint.textContent = score === 0 ? 'Enter access code.' : `Strength: ${labels[score]}`;
    passwordHint.className = 'field-hint' + (score < 2 && passwordInput.value ? ' err' : score >= 3 ? ' ok' : '');
}

function debounce(fn, delay = 300) {
    let timer;

    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

let controller = null; //keeps duplicate requests from stacking if user types quickly, prevents race conditions as well.

async function validateUsername() {
    const v = usernameInput.value.trim();

    if (!v) {
        usernameHint.textContent = '3-64 characters. Letters, numbers, underscores.';
        usernameHint.className = 'field-hint';
        usernameInput.className = 'cy-input';
        return false;
    }

    if (v.length < 1) {
        usernameHint.textContent = 'Too short.';
        usernameHint.className = 'field-hint err';
        usernameInput.className = 'cy-input error';
        return false;
    }

    if (v.length > 20) {
        usernameHint.textContent = 'Too long.';
        usernameHint.className = 'field-hint err';
        usernameInput.className = 'cy-input error';
        return false;
    }

    if (!/^[a-zA-Z0-9_-]{1,19}$/.test(v)) {
        usernameHint.textContent = 'Invalid characters detected.';
        usernameHint.className = 'field-hint err';
        usernameInput.className = 'cy-input error';
        return false;
    }

    try {
        const req = await checkUsername(v)
        const data = await req.json();

        function checkUsername(username) {
            if (controller) controller.abort();

            controller = new AbortController();

            return fetch(`/auth/checkForUsername/${username}`, {
                signal: controller.signal,
            });
        }

        if (!req.ok) {
            usernameHint.textContent = 'Server error';
            usernameHint.className = 'field-hint err';
            usernameInput.className = 'cy-input error';
            return false;
        }

        if (data.available) {
            usernameHint.textContent = 'Handle available.';
            usernameHint.className = 'field-hint ok';
            usernameInput.className = 'cy-input success';
            return true;
        } else {
            usernameHint.textContent = 'Username taken.';
            usernameHint.className = 'field-hint err';
            usernameInput.className = 'cy-input error';
            return false;
        }
    } catch (err) {
        if (err.name === "AbortError") return null;
        console.error(err)
        usernameHint.textContent = 'Network error';
        usernameHint.className = 'field-hint err';
        usernameInput.className = 'cy-input error';
        return false;
    }
}

function validatePassword(password, score) {
    const minLength = 8;
    const maxLength = 63;
    const passwordRegex = /^[A-Za-z0-9!`@#\$%\^&\*\(\)-_=\+\[\]\{\}\\|;:'",<\.>\/\? ]{8,63}$/;

    return (
        score >= 1 &&
        password.length >= minLength &&
        password.length <= maxLength &&
        passwordRegex.test(password)
    );
}

function validateConfirm() {
    if (!confirmInput.value) { confirmHint.textContent = ''; confirmHint.className = 'field-hint'; confirmInput.className = 'cy-input'; return false; }
    if (confirmInput.value !== passwordInput.value) { confirmHint.textContent = 'Codes do not match.'; confirmHint.className = 'field-hint err'; confirmInput.className = 'cy-input error'; return false; }
    confirmHint.textContent = 'Codes match.'; confirmHint.className = 'field-hint ok'; confirmInput.className = 'cy-input success'; return true;
}


async function checkSubmit() {
    const uOk = await validateUsername();
    const pOk = scorePassword(passwordInput.value) >= 1 && passwordInput.value.length >= 8 && passwordInput.value.length < 64;
    const cOk = validateConfirm();
    submitBtn.disabled = !(uOk && pOk && cOk);
}
usernameInput.addEventListener('input', debounce(checkSubmit, 1000));
passwordInput.addEventListener('input', () => { const password = passwordInput.value; const score = scorePassword(password); updateStrengthBar(score); if (confirmInput.value) { validateConfirm(); } submitBtn.disabled = !validatePassword(password, score); });
confirmInput.addEventListener('input', () => { submitBtn.disabled = !(validateConfirm()) });

function showToast(msg, isErr = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'cy-toast show' + (isErr ? ' err' : '');
    setTimeout(() => { t.className = 'cy-toast' + (isErr ? ' err' : ''); }, 3000);
}
submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    btnIdle.style.opacity = '0';
    btnBusy.style.opacity = '1';
    try {
        const res = await fetch('/sign-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Account initialized. Redirecting...');
            res.headers.forEach((value, key) => {
                if (key.startsWith('x-userdata-')) {
                    localStorage.setItem(key, decodeURIComponent(value));
                }
            });
            setTimeout(() => window.location.replace('/'), 1600);
        } else {
            showToast(data.message || 'Registration failed.', true);
            submitBtn.disabled = false;
            btnIdle.style.opacity = '1';
            btnBusy.style.opacity = '0';
        }
    } catch (e) {
        showToast('Network error.', true);
        submitBtn.disabled = false;
        btnIdle.style.opacity = '1';
        btnBusy.style.opacity = '0';
    }
});