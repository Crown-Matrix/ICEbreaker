// public/js/offlineResolver.js

const public_mappings = {
    "link-bootstrap": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css",
    "link-bootstrap-icons": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css",
    "script-bootstrap": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js",
    "script-socket": "https://cdn.socket.io/4.8.3/socket.io.min.js"
};

const private_mappings = {
    "link-bootstrap": "/css/bootstrap.min.css",
    "link-bootstrap-icons": "/css/bootstrap-icons.css",
    "script-bootstrap": "/js/bootstrap.bundle.min.js",
    "script-socket": "/js/socket.io.min.js"
};

window.addEventListener('DOMContentLoaded', () => {
    for (const key in public_mappings) {
        const el = document.getElementById(key);
        if (!el) continue;
        el.addEventListener('error', () => {
            console.warn(`Failed to load ${public_mappings[key]}, falling back to local file.`);
            if (el.tagName === 'LINK') {
                el.href = private_mappings[key];
            } else if (el.tagName === 'SCRIPT') {
                const newScript = document.createElement('script');
                newScript.src = private_mappings[key];
                newScript.id = key;
                el.replaceWith(newScript);
            }
        });
    }
});