// This script runs when singlePlayerResult.html is loaded directly (e.g. page
// refresh or direct URL access). When navigating via goToPage(), the frontend
// class handles result rendering itself via _initResultPage() — this file is
// not loaded or injected in that path.

function scoreToEddies(score) {
    // formula: eddies = ((3/100) * score) + 25: y = mx + b, where m = 3/100 (3 eddies per multiple of 100) and b = 25 (base eddies for participating in the round)
    // designed to ensure integer output since score is always a multiple of 100
    const eddies = Math.floor((3 * score) / 100) + 25;
    return eddies;
}

document.querySelector('.play-btn').addEventListener('click', () => {
    console.log('Play Again clicked');
    window.location.assign('/singlePlayer');
}, { once: true });


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
    window.location.assign('/singlePlayer');
}


document.querySelector('.cy-close').addEventListener('click', () => {
    frontEndHandler.selectedTimeFrame = undefined
    sessionStorage.setItem('frontEndHandler', JSON.stringify(frontEndHandler))
    window.location.replace('/');
}, { once: true });
