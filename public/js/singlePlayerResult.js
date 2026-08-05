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
document.querySelector('.play-btn').addEventListener('click', () => {
    console.log('Play Again clicked');
    window.location.replace('/singlePlayer');
}, { once: true });


function scoreToEddies(score) {
    // formula: eddies = ((3/100) * score) + 25: y = mx + b, where m = 3/100 (3 eddies per multiple of 100) and b = 25 (base eddies for participating in the round)
    // designed to ensure integer output since score is always a multiple of 100
    const eddies = Math.floor((3 * score) / 100) + 25;
    return eddies;
}



// logic to fill text with sessionStorage data:

var frontEndHandler = sessionStorage.getItem('frontEndHandler');
if (frontEndHandler) {
    frontEndHandler = JSON.parse(frontEndHandler);
    let score = frontEndHandler.score || '0';
    document.querySelector('.stat-value').textContent = score;
    document.querySelector('.stat-value.red').textContent = frontEndHandler.selectedTimeFrame ? String(frontEndHandler.selectedTimeFrame) : '60';
    document.querySelector('#sequence-counter').textContent = frontEndHandler.totalSequencesUploaded || '0';
    if (!frontEndHandler.isGuest) {
        // user account
        document.querySelector('#eddies-counter').textContent = scoreToEddies(score);
        document.querySelector('#eddies-msg').textContent = "Eddies Mined"; //should be the default anyway, just in case
        document.querySelector('.account-name').textContent = localStorage.getItem('x-userdata-username') || 'Unknown Operative';
        document.querySelector('.account-tag').textContent = `// User Identified`
    } else {
        // guest account
        document.querySelector('#eddies-counter').innerHTML = `Sign-in to have` + '<br>' + `earned ${scoreToEddies(score)} eddies!`;
        document.querySelector('#eddies-msg').textContent = "Guest Account";
        document.querySelector('.account-name').textContent = 'Ghost Operative';
        document.querySelector('.account-tag').textContent = '// Guest Session';

    }

} else {
    console.warn('No frontEndHandler data found in sessionStorage');
    goToPage('/singlePlayer');
}


document.querySelector('.cy-close').addEventListener('click', () => {
    frontEndHandler.selectedTimeFrame = undefined
    sessionStorage.setItem('frontEndHandler', JSON.stringify(frontEndHandler))
    window.location.replace('/');
}, { once: true });

