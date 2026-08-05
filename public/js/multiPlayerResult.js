// This script runs when multiPlayerResult.html is loaded directly (e.g. page
// refresh or direct URL access). When navigating via goToPage(), the frontend
// class handles result rendering itself via _initResultPage() — this file is
// not loaded or injected in that path.

document.querySelector('.play-btn').addEventListener('click', () => {
    console.log('Play Again clicked');
    window.location.assign('/multiPlayer');
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
    const score = frontEndHandler.score || 0;

    // ── Base stats (always shown) ──
    document.getElementById('stat-val-left').textContent = score;
    document.getElementById('sequence-counter').textContent = frontEndHandler.totalSequencesUploaded || '0';

    const draw = frontEndHandler.matchDraw;
    const won = frontEndHandler.matchWon;
    let eddiesModifier = 1;
    if (!draw && !won) {
        //lost or cancelled
        eddiesModifier = 1;
    } else if (draw) {
        eddiesModifier = 1.25; //im aware ive pasted this logic like 2-3 times but this is never going to change and also this code is run at a local small scale so the performance impact is negligible
    } else if (won) {
        eddiesModifier = 1.5;
    }

    const eddies = Math.round(scoreToEddies(score) * eddiesModifier);

    if (!frontEndHandler.isGuest) {
        document.querySelector('#eddies-counter').textContent = eddies;
        document.querySelector('#eddies-msg').textContent = 'Eddies Mined';
        document.querySelector('.account-name').textContent = localStorage.getItem('x-userdata-username') || 'Unknown Operative';
        document.querySelector('.account-tag').textContent = '// User Identified';
    } else {
        document.querySelector('#eddies-counter').innerHTML = 'Sign-in to have<br>earned ' + eddies + ' eddies!';
        document.querySelector('#eddies-msg').textContent = 'Guest Account';
        document.querySelector('.account-name').textContent = 'Ghost Operative';
        document.querySelector('.account-tag').textContent = '// Guest Session';
    }

    // ── Multiplayer head-to-head mode ──
    const isMP = frontEndHandler.matchCancelled
        || (frontEndHandler.matchWon !== null && frontEndHandler.matchWon !== undefined)
        || (frontEndHandler.matchDraw !== null && frontEndHandler.matchDraw !== undefined);

    if (isMP) {
        // Score section: your score vs opponent score
        document.getElementById('stat-label-left').textContent = 'Your Score';
        document.getElementById('stat-label-right').textContent = 'Opp Score';
        document.getElementById('stat-val-right').textContent = String(frontEndHandler.opponentFinalScore || 0);
        document.getElementById('stat-unit-right').textContent = 'pts';

        // Match outcome row
        const won = frontEndHandler.matchWon;
        const draw = frontEndHandler.matchDraw;
        const endReason = frontEndHandler.matchEndReason;
        let eddiesModifier = 1;
        if (!draw && !won) {
            //lost or cancelled
            eddiesModifier = 1; //im aware ive pasted this logic like 2-3 times but this is never going to change and also this code is run at a local small scale so the performance impact is negligible
        } else if (draw) {
            eddiesModifier = 1.25;
        } else if (won) {
            eddiesModifier = 1.5;
        }
        const outcomeLabel = frontEndHandler.matchCancelled

            ? 'MATCH VOIDED'
            : endReason === 'opponent_cheating'
                ? 'OPPONENT DISQUALIFIED'
                : (draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT'));
        document.getElementById('status-text-outcome').textContent = outcomeLabel + ' (x' + eddiesModifier + ' eddies)';

        const iconOutcome = document.getElementById('status-icon-outcome');
        if (won || endReason === 'opponent_cheating') {
            iconOutcome.classList.add('cyan');
            iconOutcome.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke-width="1.8"><path d="M2 6l3 3 5-5" stroke="#00CCDD" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        } else if (draw) {
            iconOutcome.style.borderColor = 'rgba(255,215,0,0.4)';
            iconOutcome.style.background = 'rgba(255,215,0,0.06)';
            iconOutcome.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke-width="1.8"><path d="M2 6h8" stroke="#FFD700" stroke-linecap="round"/></svg>';
        }
        // defeat keeps the default red X

        // Opponent name row
        const oppName = frontEndHandler.opponent || 'Unknown';
        const opponentSubtitle = endReason === 'opponent_disconnected'
            ? 'Opponent disconnected'
            : endReason === 'opponent_cheating'
                ? 'Opponent disqualified'
                : 'vs  ' + oppName;
        document.getElementById('status-text-opponent').textContent = opponentSubtitle;

        // Score lead metric (replace Co-Op Bonus)
        const scoreDiff = (frontEndHandler.finalScore || 0) - (frontEndHandler.opponentFinalScore || 0);
        const metricCells = document.querySelectorAll('.metric-cell');
        if (metricCells[2]) {
            const valEl = metricCells[2].querySelector('.metric-val');
            const lblEl = metricCells[2].querySelector('.metric-lbl');
            valEl.textContent = (scoreDiff >= 0 ? '+' : '') + scoreDiff;
            lblEl.textContent = 'Score Lead';
            valEl.classList.remove('muted');
            if (scoreDiff > 0) valEl.classList.add('green');
            else if (scoreDiff < 0) valEl.classList.add('muted');
        }

        // Subtitle
        const titleSub = document.querySelector('.title-sub');
        if (titleSub) titleSub.textContent = 'Match Complete';

    } else {
        // ── Single-player / legacy mode ──
        document.getElementById('stat-label-right').textContent = 'Timeframe';
        document.getElementById('stat-val-right').textContent = frontEndHandler.selectedTimeFrame ? String(frontEndHandler.selectedTimeFrame) : '60';
        document.getElementById('stat-unit-right').textContent = '/ seconds';
    }

} else {
    console.warn('No frontEndHandler data found in sessionStorage');
    window.location.assign('/multiPlayer');
}


document.querySelector('.cy-close').addEventListener('click', () => {
    frontEndHandler.selectedTimeFrame = undefined
    sessionStorage.setItem('frontEndHandler', JSON.stringify(frontEndHandler))
    window.location.replace('/');
}, { once: true });
