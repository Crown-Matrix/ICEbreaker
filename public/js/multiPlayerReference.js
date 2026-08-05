import *  as audioModule from '/js/audio.js';
await audioModule.initAudio();
audioModule.startCover();

function attachImageCursor(imgSrc, size = 32) {
    const cursor = document.createElement('img');
    cursor.src = imgSrc;
    cursor.id = 'image-cursor';
    cursor.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 99999;
            transform: translate(-50%, -50%);
            display: none;
            width: ${size}px;
            height: ${size}px;
        `;
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
        cursor.style.display = 'block';
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
    });

    return cursor; // return ref to be able to remove/resize it later
}

document.body.style.cssText += `cursor: none !important;`;
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {

    const style = document.createElement('style');
    style.textContent = '* { cursor: none !important; }';
    document.head.appendChild(style);

    attachImageCursor('/imgs/blueSquare.png', 32);
}

if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    document.body.style.cursor = 'default';
    removeImageCursor();
}

function removeImageCursor() {
    const cursor = document.getElementById('image-cursor');
    cursor?.remove();
}
const noise = document.getElementById('noise');
const count = 30;
for (let i = 0; i < count; i++) {
    const col = document.createElement('div');
    col.className = 'noise-col';
    col.style.left = Math.random() * 100 + '%';
    col.style.animationDuration = (6 + Math.random() * 12) + 's';
    col.style.animationDelay = (Math.random() * 10) + 's';
    const spanCount = Math.floor(4 + Math.random() * 10);
    for (let j = 0; j < spanCount; j++) {
        const s = document.createElement('span');
        s.style.height = Math.floor(4 + Math.random() * 20) + 'px';
        col.appendChild(s);
    }
    noise.appendChild(col);
}


function goToPage(url) {
    fetch(url)
        .then(res => {
            if (res.ok) return res.text();
            throw new Error('Network response was not ok');
        })
        .then(html => {
            history.pushState({}, "", url);

            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            document.head.replaceWith(newDoc.head);
            document.body.replaceWith(newDoc.body);

            // Run scripts sequentially
            const scripts = [...document.body.querySelectorAll('script')];
            return scripts.reduce((chain, oldScript) => {
                return chain.then(() => new Promise((resolve, reject) => {
                    const newScript = document.createElement('script');

                    [...oldScript.attributes].forEach(attr =>
                        newScript.setAttribute(attr.name, attr.value)
                    );
                    newScript.textContent = oldScript.textContent;

                    if (oldScript.src) {
                        newScript.onload = resolve;
                        newScript.onerror = reject;
                    } else {
                        resolve();
                    }
                    oldScript.replaceWith(newScript);
                }));
            }, Promise.resolve());
        }).then(() => {
            document.body.style.visibility = 'visible';
        })
        .catch(err => {
            console.error('Failed to load page:', err);
            window.location.replace(url);
        });
}
function handleKeydown(event) {
    if (event.type === 'keydown' && (['Control', 'Shift', 'Alt', 'Meta', 'Escape', 'CapsLock', 'Tab'].includes(event.key) || event.key[0] === 'F')) {
        return; // Ignore modifier keys, Escape, Tab, and function keys
    }

    // distinction of pointer events for mobile users compatibility
    if (event.type === 'pointerdown' && event.pointerType === 'mouse') {
        return; // Ignore mouse clicks, computer users should use keyboard  
    }
    // 'touch' and 'pen' pointer types are for mobile users, so we allow them to proceed
    // cuz they dont have a keyboard lmao

    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('pointerdown', handleKeydown);

    function openFullscreen() {
        const elem = document.documentElement; // Targets the whole page    
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        } else {
            console.warn("FullScreen Request - Failed");
        }
    }

    (function () {
        let frontEndHandlerStorage = sessionStorage.getItem('frontEndHandler')
        if (!frontEndHandlerStorage || frontEndHandlerStorage === 'undefined') return;//for some reason sessionStorage returns the string 'undefined' instead of just undefined or null...
        let fullScreenStatus = JSON.parse(frontEndHandlerStorage).fullScreen;
        if (!fullScreenStatus || fullScreenStatus === 'undefined') return;

        if (fullScreenStatus === true) {
            openFullscreen();
        }
    })();
    goToPage('/multiPlayer/multiPlayerIndex.html');
}
document.addEventListener('keydown', handleKeydown);
document.addEventListener('pointerdown', handleKeydown); //for mobile users;