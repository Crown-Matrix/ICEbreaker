//multiplayerFrontend.js
import * as audioHandler from "/js/audio.js";
audioHandler.initAudio();
placeFullScreenButton();



class multiPlayerFrontend {
    constructor() {
        this.rowMode = true; // true for row mode, false for column mode
        this.currentRow = null;
        this.currentBuffer = []; //[str,str...]
        this.currentCol = null;
        this.maxBufferSize = null; //set by the server on init, to prevent client tampering
        this.selectedTimeFrame = 60; //60 by default, can be changed through the servers permission(to prevent illegal client tampering) this is used to display the selected time frame in the UI and also for the game timer
        this.matrix = null;
        this.solutions = null;
        this.totalSequencesUploaded = 0; //kept track of by server and updates sent to client on end round
        this.gameState = "init"; // can be "init" "active", "ending", "won", "lost"
        this.score = 0;
        this.sequence = [];
        this.difficultyValues = null; //set by server on init, this is used to determine the point values for each difficulty level when the round ends, also sent to server on end round for score calculation
        //the following are client only properties, they are neglected by the server on frontendhandler transmissions
        this.FXVolume = 1;
        this.BGVolume = 0.6;
        this.muted = false;
        this.graphics = 'normal'; // can be 'normal' or 'low'
        this.savedMatrixHtml = null; //used to store the original HTML of the matrix header before the lose animation removes it, this allows us to restore it properly when un-animating the lose state. mainMatrixCol looses all children for animation
        this.savedMainColWidth = '58%';
        this.animating = false;
        this.url = null; //set by goToPage`
        this.isGuest = true; // by default unless set to false by server on init
        this.fullScreen = false; //client only property to track if the user is currently in fullscreen mode, used to automatically place user back in full screen mode after moving to different pages using goToPage()
        this.timerWaiting = false;
        this.scoreToEddies = function (score) {
            // formula: eddies = ((3/100) * score) + 25: y = mx + b, where m = 3/100 (3 eddies per multiple of 100) and b = 25 (base eddies for participating in the round)
            // designed to ensure integer output since score is always a multiple of 100
            eddies = Math.floor((3 * score) / 100) + 25;
            return eddies;
        }
        this.opponent = null; // used to store either username or 'guest'
        this.matchEndTime = null;   // NEW — authoritative deadline from server
        this.matchWon = null;       // NEW
        this.matchDraw = null;      // NEW
        this.finalScore = null;     // NEW
        this.opponentFinalScore = null; // NEW
        this.matchResultReceived = false; // client only — true once server pushes the authoritative match_result
        this.awaitingMatchResult = false; // client only — true once our own round-end animation has finished and we're just waiting on match_result
        this.navigatingToResult = false;  // client only — guards against double-navigating
    }

    updateBackendHandler() {
        socket.emit('frontEndHandler_update', { frontEndHandler: this });
        return this;
    }

    rowModeUpdate(rowIndex) {
        removeAllCellHighlights();
        this.rowMode = true;
        this.currentRow = rowIndex;
        this.currentCol = null;
        highlightRow(rowIndex);
    }

    colModeUpdate(colIndex) {
        removeAllCellHighlights();
        this.rowMode = false;
        this.currentCol = colIndex;
        this.currentRow = null;
        highlightCol(colIndex);
    }

    selectCell(rowIndex, colIndex) {
        if (this.currentBuffer.length >= this.maxBufferSize) {
            console.warn("Buffer is full. Cannot select more cells until buffer is processed.");
            return false;
        }
        if (this.rowMode) {
            if (rowIndex !== this.currentRow) return false;
            this.currentBuffer.push(this.matrix[rowIndex][colIndex]);
            this.colModeUpdate(colIndex);
            return true;
        } else {
            if (colIndex !== this.currentCol) return false;
            this.currentBuffer.push(this.matrix[rowIndex][colIndex]);
            this.rowModeUpdate(rowIndex);
            return true;
        }
    }

    frontEndRenderMatrix() {
        document.documentElement.style.setProperty('--matrixSize', String(this.matrix.length));

        document.querySelectorAll(".matrix-cell").forEach(cell => cell.remove()); //remove old highlights
        function renderMatrix(matrix) {
            const header = document.getElementById('code-matrix-header');
            header.innerHTML = ''; // Clear existing content

            for (let i = 0; i < matrix.length; i++) {
                //row loop
                const row = document.createElement('div');
                row.classList.add('row', "matrix-row");
                row.setAttribute('data-row-div', i);

                for (let j = 0; j < matrix[0].length; j++) {
                    //column loop
                    const cell = document.createElement('div');
                    cell.classList.add("col-2", "matrix-cell");
                    cell.textContent = matrix[i][j];
                    cell.setAttribute('data-row', i);
                    cell.setAttribute('data-col', j);

                    row.appendChild(cell);
                }
                header.appendChild(row);
            }

            //insert side-col cells for extra highlight offset
            const base = document.querySelector('[data-row="0"]:not(.extra-highlight)');
            const height_var = base ? base.getBoundingClientRect().height : 0;
            for (let i = 0; i < matrix.length; i++) {
                document.querySelectorAll('.side-matrix-col').forEach(col => {
                    const cell = document.createElement('div');
                    cell.classList.add("matrix-cell", "extra-highlight");
                    cell.textContent = '';
                    cell.setAttribute('data-row', i);
                    cell.style.cssText = `width: 100% !important; height: ${height_var}px !important;`;
                    col.appendChild(cell);
                });
            }
        }
        renderMatrix(this.matrix); //generates new matrix in DOM based on front end handler's matrix data, also removes old one
        removeAllCellHighlights();
        addCellClickListeners();
        buildSequenceLists(frontEndHandler.solutions);
        frontEndHandler.updateBufferProgress(); //initial
        removeAllCellHighlights(); //remove any old ones
        addCellHighlightListeners();
        populateBuffer(); //also clears old ones
        frontEndHandler.rowModeUpdate(0); //initial highlight of first row
    }

    updateBufferGUI() {
        //does full update for all cells, not efficient but buffer is too small for it to rlly matter, readibility prioritized
        for (let i = 0; i < this.currentBuffer.length; i++) {
            const bufferCell = document.querySelector(`.buffer-cell[data-index="${i}"]`);
            if (bufferCell) {
                bufferCell.textContent = this.currentBuffer[i];
                bufferCell.setAttribute('filled', ''); // add filled attribute to update outline style
            }
        }
    }

    placeGhostBuffer(textContent) {
        //remove any existing
        document.querySelectorAll('.buffer-cell.ghost').forEach(cell => {
            cell.classList.remove('ghost');
        });

        const bufferCell = document.querySelector(`.buffer-cell[data-index="${this.currentBuffer.length}"]`);
        if (bufferCell) {
            bufferCell.textContent = textContent;
            bufferCell.classList.add('ghost'); // add ghost class to apply ghost styling
        }
    }

    removeGhostBuffer() {
        document.querySelectorAll('.buffer-cell.ghost').forEach(cell => {
            cell.classList.remove('ghost');
            cell.textContent = ""; // clear the ghost text content when removing ghost state
        });
    }

    goToPage(url) {
    fetch(url)
        .then(res => {
                if (res.ok) return res.text();
                throw new Error('Network response was not ok');
            })
            .then(html => {
                this.url = url;
                sessionStorage.setItem('frontEndHandler', JSON.stringify(this)); //save the current front end handler state to session storage before navigating, this allows the new page to access it and restore the state, effectively allowing us to persist the front end handler across page navigations which is necessary for the result page after the game endsb
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

    updateBufferProgress() {
        let complete_solution_progress = checkForSolutions(this.currentBuffer.join(' '), this.solutions);
        //example_complete_solution_progress = {"easy": true,"medium": false,"hard": false}
        let all_solved = true;
        for (let difficulty in complete_solution_progress) {
            const progressBar = document.querySelector(`.sequence-list-row[data-difficulty="${difficulty}"]`);
            if (progressBar) {
                if (complete_solution_progress[difficulty]) {
                    if (progressBar.hasAttribute('installed')) continue; //already installed, skip
                    progressBar.setAttribute('installed', '');
                    audioHandler.playSound('win', frontEndHandler.FXVolume);
                } else {
                    sequenceProgressHandler(this.solutions[difficulty], this.currentBuffer, progressBar);
                    all_solved = false;
                    progressBar.removeAttribute('installed'); /*this shouldnt have to make a difference but just in case*/
                }
            }
        }
        if (all_solved || this.currentBuffer.length >= this.maxBufferSize) {
            this.endRound();
        }
    }

    endRound() {
        if (this.gameState !== 'active') {
            console.debug('endRound ignored: round is already ending or complete');
            return;
        }
        this.gameState = 'ending'; // prevent re-entry before server responds

        //add failed attribute to any unsolved solutions
        document.querySelectorAll('.sequence-list-row:not([installed])').forEach(row => {
            row.setAttribute('failed', '');
        });

        socket.emit('end_game', { sequence: this.sequence }); //send sequence for verification and scoring, also triggers backend to prepare for next round
        socket.once('end_game_response', (data) => {
            this.score += data.scoreGained;
            this.gameState = data.roundResult === 'won' ? 'won' : 'lost';
            this.totalSequencesUploaded += data.sequencesUploaded || 0; //if last round, this ensures front end sync, this is still validated by the server for anti-cheat purposes. //if not last round, this number will be overwrittne by newRound anyway.
            removeAllCellHighlights(); //need to be removed before either round end animation
            if (data.roundResult === 'won') {
                this.winRound(data.resultType);
                return true;
            } else {
                this.loseRound(data.resultType);
            }
        });
        setTimeout(() => {
            if (this.gameState === 'ending') {
                this.gameState = 'lost';
                this.loseRound('timeout');
            }
        }, 4000);
    }

    async winRound(resultType) {
        removeAllCellHighlights();
        audioHandler.playSound('win', this.FXVolume, () => {
            audioHandler.playSound('close', this.FXVolume);
        });
        await animateRoundEnd('won', resultType);
        setTimeout(async () => {
            await unAnimateRoundEnd();
            if (Date.now() < sessionEndTime) {
                this.newRound();
            } else {
                if (this.timerWaiting) {
                    socket.emit('database_write');
                }
                console.log('Session has ended. Not starting new round.');
                this.finishMatch();
            }
        }, 1000);
    }

    async loseRound(resultType) {
        removeAllCellHighlights();
        audioHandler.playSound('lose', this.FXVolume, () => {
            audioHandler.playSound('close', this.FXVolume);
        });
        await animateRoundEnd('lost', resultType);
        setTimeout(async () => {
            await unAnimateRoundEnd();
            if (Date.now() < sessionEndTime) {
                this.newRound();
            } else {
                if (this.timerWaiting) {
                    socket.emit('database_write');
                }
                console.log('Session has ended. Not starting new round.');
                this.finishMatch();
            }
        }, 1000);
    }

    // Our own round-end animation has fully played out and match time is up. Navigate
    // immediately if the server's authoritative result already arrived; otherwise wait
    // for it — match_result's handler picks this up rather than racing ahead of us.
    finishMatch() {
        if (this.matchResultReceived) {
            this.navigateToResult();
        } else {
            this.awaitingMatchResult = true;
        }
    }

    navigateToResult() {
        if (this.navigatingToResult) return;
        this.navigatingToResult = true;
        this.goToPage('/multiPlayer/result');
    }

    async newRound() {
        const firstRound = this.gameState === "init";

        if (firstRound) {
            document.getElementById('pre-game-menu').style.display = 'none'
        }
        this.updateBackendHandler(); // serve frontend handler

        socket.emit('start_game', { message: 'Requesting new round start.' });

        let accepted = true;
        let error_msg;

        // wait for backend response
        await new Promise((resolve) => {
            socket.once('start_game_response', (data) => {
                console.log('start game response received:', data);
                Object.assign(this, data.frontEndHandler);
                if (data.matchEndTime) this.matchEndTime = data.matchEndTime; // NEW
                accepted = data.accepted;
                error_msg = data.message;
                resolve();
            });
        });

        if (!accepted) {
            console.warn("New Round Request Rejected: ", error_msg);
            return;
        }

        this.frontEndRenderMatrix();
        await animateNewRound();


        if (firstRound) {
            audioHandler.stopMusic();
            audioHandler.startMusic(this.BGVolume);


            initTimer();
            setTimeout(() => {
                startTimer();
            }, 505) //wait for the newRound animation
            //if updating this number, update the delay in multiPlayerServer.cjs too
        }
    }
}
const frontEndHandler = new multiPlayerFrontend();

function resetClient() {
    frontEndHandler.gameState = "init";
    frontEndHandler.newRound();
}


function initTimer() {
    const timerElement = document.getElementById('breach-time-value');
    timerElement.textContent = parseFloat(frontEndHandler.selectedTimeFrame).toFixed(2); // Display initial time frame with one decimal place
}

let sessionEndTime = null; // exposed so winRound/loseRound can check if time remains

function startTimer() {
    const timerElement = document.getElementById('breach-time-value');
    // matchEndTime is the authoritative, server-shared deadline (fixed for the whole
    // match at matchmaking time) so both players' clocks run out at the same real-world
    // moment. Fallback only covers the case where it's somehow missing.
    sessionEndTime = frontEndHandler.matchEndTime || (Date.now() + frontEndHandler.selectedTimeFrame * 1000);

    const updateTimer = () => {
        // Derive the displayed value from sessionEndTime directly so the countdown
        // reaches exactly 0.00 at the same instant the loop below actually stops —
        // setup latency before this loop starts no longer eats into displayed time.
        const remaining = Math.max((sessionEndTime - Date.now()) / 1000, 0);
        timerElement.textContent = remaining.toFixed(2);

        if (Date.now() < sessionEndTime) {
            requestAnimationFrame(updateTimer);
        } else {
            if (frontEndHandler.gameState === 'active') {
                frontEndHandler.endRound();
            } else {
                console.log('Timer ended while animation was in progress.');
                frontEndHandler.timerWaiting = true;
            }
        }
    };

    updateTimer();
}

function animateNewRound() {
    frontEndHandler.animating = true;
    let matrixWindow = document.querySelector('#window-outside');
    matrixWindow.removeAttribute('data-state');
    matrixWindow.setAttribute('data-state', 'active');

    return new Promise((resolve) => {

        for (const elem of ['buffer-text', 'matrixEffectImage', 'sequence-bottom-decoration', 'nettech-logo', 'cyberpunk-header']) {
            const el = document.getElementById(elem);
            if (!el) continue;
            el.style.transformOrigin = 'center left';
            el.style.transform = 'scaleX(1)';
        }
        // Phase 1+2: all width animations simultaneously
        for (const element_id of ['breach-time-container', 'window-outside', 'buffer-container', 'breach-time-bar','opponent-info']) {
            const el = document.getElementById(element_id);
            el.style.cssText = `transform: scaleX(0); transform-origin: left center;`;
            setTimeout(() => {
                el.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                el.style.transform = 'scaleX(1)';
            }, 100);
        }

        const sw = document.getElementById('sequences-wrapper');
        setTimeout(() => {
            sw.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            sw.style.transform = 'scaleX(1) scaleY(1)'; // wrapper just does width, rows do height
        }, 100);

        const seqHeader = document.getElementById('sequence-header-div');
        setTimeout(() => {
            seqHeader.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            seqHeader.style.transform = 'scaleX(1)';
        }, 100);

        for (const cell of document.querySelectorAll('.buffer-cell')) {
            setTimeout(() => {
                cell.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                cell.style.transform = 'scaleX(1)';
            }, 100);
        }

        setTimeout(() => {
            const rowsContainer = document.getElementById('sequence-rows-container');
            rowsContainer.style.transition = 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            rowsContainer.style.maxHeight = '500px';

            setTimeout(() => {
                frontEndHandler.animating = false;
                resolve();
            }, 300);
        }, 400);
    });
}

function animateRoundEnd(roundResult, resultType) {
    let glowColor, darkerColor, darkColor, mainColor;
    if (roundResult === 'won') {
        [glowColor, darkerColor, darkColor, mainColor] = ['var(--cy-green-glow)', 'var(--cy-green-darker)', 'var(--cy-green-dark)', 'var(--cy-green)'];
    } else if (roundResult === 'lost') {
        [glowColor, darkerColor, darkColor, mainColor] = ['var(--cy-red-glow)', 'var(--cy-red-darker)', 'var(--cy-red-dark)', 'var(--cy-red)'];
    } else {
        console.warn('Unknown round result for animation: ', roundResult);
    }

    frontEndHandler.animating = true;
    return new Promise((resolve) => {
        let matrixWindow = document.querySelector('#window-outside');
        matrixWindow.removeAttribute('data-state');
        matrixWindow.setAttribute('data-state', roundResult);

        let mainMatrixCol = document.querySelector('.main-matrix-col');
        let header = matrixWindow.querySelector('#window-header');
        header.style.paddingLeft = "2px";

        let headerText = header.querySelector('#window-header-h2');
        headerText.style.display = "none";
        let headerButtons = header.querySelector('#button-container');
        headerButtons.style.display = "none";
        let matrix = matrixWindow.querySelector('#code-matrix-header');

        if (window.innerWidth > 992) {
            mainMatrixCol.style.fontSize = '10px';
        }

        mainMatrixCol.style.containerType = 'inline-size';
        if (window.innerWidth <= 992) {
            mainMatrixCol.style.minHeight = '4.5rem';
            mainMatrixCol.style.fontSize = '2cqi'
        }

        matrix.style.display = "none";
        matrixWindow.style.border = 'none';
        mainMatrixCol.style.transition = 'opacity 1s ease';
        mainMatrixCol.style.opacity = '0';
        header.style.transition = 'opacity 1s ease';
        header.style.opacity = '0';
        mainMatrixCol.style.opacity = '1';
        let vertical_padding = 2.5; //in px
        header.style.paddingTop = `${vertical_padding}px`;
        header.style.paddingBottom = `${vertical_padding}px`;
        header.style.opacity = '1';
        header.style.width = `calc(${header.clientHeight - vertical_padding * 2}px + 10px)`; //for square
        header.style.margin = '0 auto';
        header.style.transition = 'width 0.5s ease';

        let terminal = document.getElementById('cy-terminal');
        let terminal_height = terminal.getBoundingClientRect().height;
        terminal.style.height = `${terminal_height}px`;
        let max_height = matrixWindow.getBoundingClientRect().height;
        if (window.innerWidth <= 992) {
            if (roundResult === 'won') {
                matrixWindow.style.minHeight = (max_height * 0.75) + 'px';
            } else if (roundResult === 'lost') {
                matrixWindow.style.minHeight = max_height + 'px';
            }
        }
        matrixWindow.style.height = "0px";
        matrixWindow.getBoundingClientRect();

        setTimeout(() => {
            header.style.width = '100%';
            matrixWindow.querySelector('#window-header-logo').style.transition = 'opacity 0.5s ease';
            matrixWindow.querySelector('#window-header-logo').style.opacity = '0';

            setTimeout(() => {
                matrixWindow.style.removeProperty('border');
                matrixWindow.style.transition = 'height 1s ease';
                matrixWindow.style.backgroundColor = darkColor;
                matrixWindow.style.transition += ', background-color 0.5s ease';

                setTimeout(() => {
                    matrixWindow.querySelectorAll('.matrix-row').forEach((row) => { row.style.display = 'none'; });
                    matrixWindow.style.height = `${max_height}px`;
                    matrixWindow.querySelectorAll('.side-matrix-col').forEach(col => col.style.display = 'none');
                    frontEndHandler.savedMainColWidth = mainMatrixCol.style.width;
                    mainMatrixCol.style.width = '100%';
                    matrixWindow.style.backgroundColor = mainColor;

                    setTimeout(() => {
                        document.querySelector('#matrix-window').style.height = '100%';
                        document.querySelector('#matrix-window > .container-fluid').style.height = '100%';
                        document.querySelector('#matrix-window > .container-fluid > .row').style.height = '100%';
                        mainMatrixCol.style.height = '75%';

                        let footer = document.createElement('div');
                        footer.id = 'matrix-animation-footer';
                        footer.style.cssText = `
                                height: 25%;
                                background-color: ${mainColor};
                                color: ${darkerColor};
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                font-weight: bolder;
                                text-transform: uppercase;
                            `;
                        mainMatrixCol.style.transition += ', background-color 0.5s ease';
                        mainMatrixCol.parentElement.appendChild(footer);
                        mainMatrixCol.style.backgroundColor = darkerColor;

                        const dots = "................";
                        frontEndHandler.savedMatrixHtml = mainMatrixCol.querySelector('#code-matrix-header').outerHTML; //save to global
                        mainMatrixCol.textContent = '' //clear the previous matrix //this also destroys the header so we need to save it to restore later in unAnimateRoundEnd, this is because the round end animation involves printing text in the main matrix column which is where the header is located, so we have to remove the header to print the text, but we want to be able to restore it later when un-animating the round end state
                        let codeText;
                        if (roundResult === 'won') {

                            codeText =
                                `
                                //ROOT
                                //ACCESS_REQUEST
                                //ACCESS_REQUEST_SUCCESS
                                //COLLECTING PACKET_1${dots}COMPLETE
                                //COLLECTING PACKET_2${dots}COMPLETE
                                //COLLECTING PACKET_3${dots}COMPLETE
                                //COLLECTING PACKET_4${dots}COMPLETE
                                //LOGIN
                                //LOGIN_SUCCESS
                                //UPLOAD_IN_PROGRESS
                                //UPLOAD_COMPLETE!`;
                        } else if (roundResult === 'lost') {
                            codeText = `
                                //ROOT_ATTEMPT_1
                                //ROOT_ATTEMPT_2
                                //ROOT_FAILED
                                //ROOT_REBOOT
                                //ACCESSING${dots}FAILED
                                //ACCESSING${dots}FAILED
                                //ACCESSING${dots}FAILED
                                //ACCESSING${dots}FAILED
                                //ACCESSING${dots}FAILED`;
                        }

                        mainMatrixCol.style.whiteSpace = 'pre';
                        mainMatrixCol.style.paddingLeft = '10px';
                        mainMatrixCol.classList.remove('pt-3');
                        mainMatrixCol.style.color = glowColor;
                        mainMatrixCol.style.textShadow = `0 0 10px ${glowColor}`;
                        mainMatrixCol.style.textAlign = 'left';
                        const lines = codeText.split('\n').map(line => line.trimStart()); //trimstart is there just cuz i dont wanna floor the text to the left in this code cuz its ugly
                        let i = 0;
                        const interval = setInterval(() => {
                            if (i < lines.length) {
                                mainMatrixCol.textContent += lines[i] + '\n';
                                i++;
                            } else {
                                clearInterval(interval);
                            }
                        }, 100);
                        setTimeout(() => { //blink effect
                            mainMatrixCol.style.transition = 'color 0.125s linear, text-shadow 0.125s linear';
                            //prepare footer for display
                            footer.style.color = mainColor;
                            footer.style.transition = 'color 0.125s linear';
                            mainMatrixCol.style.color = darkerColor;
                            mainMatrixCol.style.textShadow = 'none';
                            setTimeout(() => {
                                if (roundResult === 'lost') {
                                    if (resultType === 'buffer_full') {
                                        footer.textContent = 'Buffer Full';
                                    } else if (resultType === 'timeout') {
                                        footer.textContent = 'Timed Out';
                                    } else {
                                        //this is a fallback in case the parameter didnt make sense
                                        footer.textContent = 'Access Denied';
                                        console.warn('Unknown lose result type: ', resultType);
                                    }
                                }

                                if (roundResult === 'won') {
                                    if (resultType === 'all_uploaded') {
                                        footer.textContent = 'All Daemons Uploaded';
                                    } else {
                                        //this is a fallback in case the parameter didnt make sense
                                        footer.textContent = 'Daemons Uploaded';
                                        console.warn('Unknown win result type: ', resultType);
                                    }
                                }
                                footer.style.color = darkerColor;
                                mainMatrixCol.style.color = glowColor;
                                mainMatrixCol.style.textShadow = `0 0 10px ${glowColor}`;
                                setTimeout(() => {
                                    mainMatrixCol.style.color = darkerColor;
                                    mainMatrixCol.style.textShadow = 'none';
                                    footer.style.color = mainColor;
                                    setTimeout(() => {
                                        mainMatrixCol.style.color = glowColor;
                                        mainMatrixCol.style.textShadow = `0 0 10px ${glowColor}`;
                                        footer.style.color = darkerColor;
                                        resolve(); //resolve the promise after the animation is done, this allows the new round to start after the win animation finishes
                                    }, 200)
                                }, 200)
                            }, 200)
                        }, 1000)
                    }, 500);
                }, 500);
            }, 500);
        }, 1000);
    });

}


function unAnimateRoundEnd(instant = false) {
    return new Promise((resolve) => {
        let secondsWait = String(instant ? 0 : 0.3) + 's'; // if instant is true, skip the animation and resolve immediately, otherwise wait for the animation to finish

        // collapse everything simultaneously
        for (const element_id of ['breach-time-container', 'window-outside', 'breach-time-bar', 'buffer-text','opponent-info']) {
            const el = document.getElementById(element_id);
            el.getBoundingClientRect() //force reflow
            el.style.transformOrigin = 'left center';
            el.style.transition = 'transform ' + secondsWait + 'cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = 'scaleX(0)';
        }

        for (const element_id of ['sequences-wrapper', 'buffer-container', 'matrixEffectImage', 'sequence-bottom-decoration', 'nettech-logo', 'cyberpunk-header']) {
            const el = document.getElementById(element_id);
            if (!el) continue;
            el.getBoundingClientRect() //force reflow
            el.style.transition = 'transform ' + secondsWait + 'cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = 'scaleX(0)';
        }



        for (const cell of document.querySelectorAll('.buffer-cell')) {
            cell.getBoundingClientRect() //force reflow
            cell.style.transition = 'transform ' + secondsWait + 'cubic-bezier(0.4, 0, 0.2, 1)';
            cell.style.transform = 'scaleX(0)';
        }
        for (const elem of ['buffer-text', 'matrixEffectImage', 'sequence-bottom-decoration', 'nettech-logo', 'cyberpunk-header']) {
            const el = document.getElementById(elem);
            el.getBoundingClientRect() //force reflow
            el.style.transformOrigin = 'center left'
            el.style.transform = 'scaleX(0)'
        }

        setTimeout(() => {

            let matrixWindow = document.querySelector('#window-outside');
            let terminal = document.getElementById('cy-terminal');
            let mainMatrixCol = document.querySelector('.main-matrix-col');
            Array.from(mainMatrixCol.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
            mainMatrixCol.classList.add('pt-3');

            if (frontEndHandler.savedMatrixHtml) {
                mainMatrixCol.innerHTML = frontEndHandler.savedMatrixHtml;
            }
            document.getElementById('code-matrix-header').innerHTML = '';
            let header = matrixWindow.querySelector('#window-header');

            function instantFixes() {
                matrixWindow.removeAttribute('data-state');
                matrixWindow.setAttribute('data-state', 'active');
                matrixWindow.style.removeProperty('height');
                matrixWindow.style.removeProperty('background-color');
                matrixWindow.style.removeProperty('transition');
                matrixWindow.style.removeProperty('border');
                matrixWindow.style.removeProperty('min-height');
                terminal.style.removeProperty('height');
                header.style.cssText = '';
                header.querySelector('#window-header-h2').style.removeProperty('display');
                header.querySelector('#button-container').style.removeProperty('display');
                matrixWindow.querySelector('#window-header-logo').style.opacity = '1';
                matrixWindow.querySelector('#window-header-logo').style.removeProperty('transition');
                matrixWindow.querySelector('#code-matrix-header')?.style.removeProperty('display');
                matrixWindow.querySelectorAll('.matrix-row').forEach(row => row.style.removeProperty('display'));
                matrixWindow.querySelectorAll('.side-matrix-col').forEach(col => col.style.removeProperty('display'));
                document.querySelector('#matrix-window').style.removeProperty('height');
                document.querySelector('#matrix-window > .container-fluid').style.removeProperty('height');
                document.querySelector('#matrix-window > .container-fluid > .row').style.removeProperty('height');
                mainMatrixCol.style.cssText = `width: ${frontEndHandler.savedMainColWidth};`;
                document.getElementById('matrix-animation-footer')?.remove();
                // reset all animated elements back to full width
            }

            for (const element_id of ['breach-time-container', 'window-outside', 'sequences-wrapper', 'buffer-container', 'breach-time-bar','opponent-info']) {
                const el = document.getElementById(element_id);
                if (!el) continue;
                el.style.transition = 'none';
                el.style.transform = 'scaleX(0)';
                el.style.transformOrigin = 'left center';
            }

            document.querySelectorAll('.buffer-cell').forEach(cell => {
                cell.style.transition = 'none';
                cell.style.transform = 'scaleX(0)';
                cell.style.transformOrigin = 'left center';
            });


            instantFixes();
            frontEndHandler.animating = false;
            resolve();

        }, instant ? 0 : 1500); // if instant is true, skip the animation and resolve immediately, otherwise wait for the animation to finish
    });
}

document.querySelectorAll('.icb-pre__tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.icb-pre__tf-btn').forEach(b => b.classList.remove('icb-pre__tf-active'));
        btn.classList.add('icb-pre__tf-active');
        //selectedSeconds = selectedTimeFrame; // update the selectedSeconds variable with the new time frame value when a button is clicked, this ensures that if the user changes the time frame mid-game, the timer will use the new value for subsequent rounds
    });
});

document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('icb-pre__tf-btn')) { return }

    const selectedTimeFrame = parseInt(event.target.getAttribute('data-seconds'), 10);
    frontEndHandler.selectedTimeFrame = selectedTimeFrame; //update the front end handler's selected time frame to reflect the successful update, this will ensure the UI and timer use the new time frame value
    initTimer(); // re-initialize timer with new time frame

});
window.addEventListener('resize', () => {
    if (frontEndHandler.animating || (frontEndHandler.url == '/multiPlayer/result')) return;
    if (window.innerWidth <= 992) {
        resizeMatrixCol(100);
        document.getElementById('sizeUp-btn').style.display = 'none';
        document.getElementById('sizeDown-btn').style.display = 'none';
        document.getElementById('sizeReset-btn').style.display = 'none';
    } else {
        resizeMatrixCol(58);
        document.getElementById('sizeUp-btn').style.display = 'block';
        document.getElementById('sizeDown-btn').style.display = 'block';
        document.getElementById('sizeReset-btn').style.display = 'block';
    }
});

window.addEventListener('load', () => {
    if (frontEndHandler.animating || (frontEndHandler.url == '/multiPlayer/result')) return;
    if (window.innerWidth <= 992) {
        resizeMatrixCol(100);
        document.getElementById('sizeUp-btn').style.display = 'none';
        document.getElementById('sizeDown-btn').style.display = 'none';
        document.getElementById('sizeReset-btn').style.display = 'none';
    } else {
        resizeMatrixCol(58);
        document.getElementById('sizeUp-btn').style.display = 'block';
        document.getElementById('sizeDown-btn').style.display = 'block';
        document.getElementById('sizeReset-btn').style.display = 'block';
    }
});

function getSelectedOption() {
    return document.querySelector('.timeframe-option[selected]');
}


async function resizeMatrixCol(percentage = "58", offset = 0) {
    const main = document.querySelector('.main-matrix-col');
    const side = document.querySelectorAll('.side-matrix-col');
    if (!main || side.length === 0) return;

    main.style.width = `${percentage}%`;
    side.forEach(s => s.style.width = `${(100 - percentage) / side.length}%`);

    const height_var = await getStableCellHeight();
    if (frontEndHandler.animating) return; //extra cell highlights are not necessary during animation
    document.querySelectorAll('.extra-highlight').forEach(cell => {
        const referenceCell = document.querySelector('[data-row="0"]:not(.extra-highlight)');
        if (!referenceCell) return; //likely inbetween rounds
        cell.style.cssText = `width: 100% !important; height: ${referenceCell.getBoundingClientRect().height + offset}px !important;`;
        cell.style.display = 'block';
    });
}

document.getElementById('sizeUp-btn').addEventListener('click', () => {
    const main = document.querySelector('.main-matrix-col');
    if (!main) return;
    if (window.innerWidth <= 992) return;

    const currentWidth = parseFloat(main.style.width) || parseFloat(getComputedStyle(main).width) / main.parentElement.offsetWidth * 100;
    if (isNaN(currentWidth) || currentWidth >= 80) return;

    resizeMatrixCol(currentWidth + 5);
});

document.getElementById('sizeDown-btn').addEventListener('click', () => {
    const main = document.querySelector('.main-matrix-col');
    if (!main) return;
    if (window.innerWidth <= 992) return;
    let offset = 0;

    let currentWidth = parseFloat(main.style.width) || parseFloat(getComputedStyle(main).width) / main.parentElement.offsetWidth * 100;
    if ((isNaN(currentWidth) || currentWidth <= 50) && window.innerWidth > 1261) {
        offset = 0.2;
    }
    if (isNaN(currentWidth) || currentWidth <= 45) return;
    resizeMatrixCol(currentWidth - 5, offset);
});



document.getElementById('sizeReset-btn').addEventListener('click', () => {
    const main = document.querySelector('.main-matrix-col');
    if (!main) return;
    if (window.innerWidth <= 992) return;

    resizeMatrixCol(58);
});

window.addEventListener('resize', () => {
    if (frontEndHandler.animating) return;
    const highlights = document.querySelectorAll('.extra-highlight');
    if (window.innerWidth <= 992) {
        highlights.forEach(cell => {
            cell.style.display = 'none';
        });
    } else {
        highlights.forEach(cell => {
            const referenceCell = document.querySelector('[data-row="0"]:not(.extra-highlight)');
            if (!referenceCell) return; //likely inbetween rounds
            cell.style.cssText = `width: 100% !important; height: ${referenceCell.clientHeight + 0.5}px !important;`;
            cell.style.display = 'block';
        });
    }
});

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



function getStableCellHeight() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = document.querySelector('[data-row="0"]:not(.extra-highlight)');
                resolve(el ? el.getBoundingClientRect().height : 0);
            });
        });
    });
}


function highlightRow(rowIndex) {
    const row = document.querySelector(`[data-row-div="${rowIndex}"]`);
    if (!row) return;

    row.classList.add("potential-row");

    const highlightCells = document.querySelectorAll(`.extra-highlight[data-row="${rowIndex}"]`);
    highlightCells.forEach(cell => {
        cell.classList.add("potential-cell");
    });
}


function highlightCol(colIndex) {
    const cells = document.querySelectorAll(`[data-col="${colIndex}"]`);
    cells.forEach(cell => {
        cell.classList.add("potential-col");
    });
}

function highlightCounter(Index, isRow = frontEndHandler.rowMode) {
    if (isRow) {
        const cols = document.querySelectorAll(`[data-col="${Index}"]:not([data-row="${frontEndHandler.currentRow}"])`);
        cols.forEach(col => {
            col.classList.add("counter-highlight");
        });
    } else {
        const rows = document.querySelectorAll(`[data-row="${Index}"]:not([data-col="${frontEndHandler.currentCol}"])`);
        rows.forEach(row => {
            row.classList.add("counter-highlight");
        });
    }
}

//initial setup based on screen size if user reloads or switches monitors
if (window.innerWidth <= 992) {
    resizeMatrixCol(100);
    document.getElementById('sizeUp-btn').style.display = 'none';
    document.getElementById('sizeDown-btn').style.display = 'none';
    document.getElementById('sizeReset-btn').style.display = 'none';
} else {
    resizeMatrixCol(58);
    document.getElementById('sizeUp-btn').style.display = 'block';
    document.getElementById('sizeDown-btn').style.display = 'block';
    document.getElementById('sizeReset-btn').style.display = 'block';
}


setTimeout(() => { //fallback initial setup
    if (window.innerWidth <= 992) {
        resizeMatrixCol(100);
        document.getElementById('sizeUp-btn').style.display = 'none';
        document.getElementById('sizeDown-btn').style.display = 'none';
        document.getElementById('sizeReset-btn').style.display = 'none';
    } else {
        resizeMatrixCol(58);
        document.getElementById('sizeUp-btn').style.display = 'block';
        document.getElementById('sizeDown-btn').style.display = 'block';
        document.getElementById('sizeReset-btn').style.display = 'block';
    }
}, 50);


function addCellHighlightListeners() {
    document.querySelectorAll('.matrix-cell').forEach(cell => {

        cell.addEventListener('mouseenter', (event) => {
            const rowIndex = cell.getAttribute('data-row');
            const colIndex = cell.getAttribute('data-col');

            if (colIndex === null || rowIndex === null) return;

            if (frontEndHandler.rowMode) {
                if (rowIndex == frontEndHandler.currentRow && !cell.classList.contains('expired-cell')) {
                    event.target.classList.add('selectable-cell');
                    highlightCounter(parseInt(colIndex), true);
                }
            } else {
                if (colIndex == frontEndHandler.currentCol && !cell.classList.contains('expired-cell')) {
                    event.target.classList.add('selectable-cell');
                    highlightCounter(parseInt(rowIndex), false);
                }
            }

            const isSelectableRow = frontEndHandler.rowMode && rowIndex == frontEndHandler.currentRow && !cell.classList.contains('expired-cell');
            const isSelectableCol = !frontEndHandler.rowMode && colIndex == frontEndHandler.currentCol && !cell.classList.contains('expired-cell');
            if (isSelectableRow || isSelectableCol) {
                document.querySelectorAll('.current-node').forEach(currentNode => {
                    const currentNodeText = currentNode.querySelector('.score-card-node-text-span')?.textContent || currentNode.textContent;
                    if (currentNodeText.trim() === cell.innerText.trim()) {
                        currentNode.classList.add('hovered-current-node');
                    }
                    audioHandler.playSound('hover', frontEndHandler.FXVolume);
                    frontEndHandler.placeGhostBuffer(cell.innerText.trim());
                });
            }
        });

        cell.addEventListener('mouseleave', () => {
            removeSelectableHighlights();
            document.querySelectorAll('.current-node').forEach(currentNode => {
                currentNode.classList.remove('hovered-current-node');
            });
            document.querySelectorAll('.hovered-current-node').forEach(node => {
                node.classList.remove('hovered-current-node');
            });

            frontEndHandler.removeGhostBuffer();
        });

    });
}

function addCellClickListeners() {
    const cells = document.querySelectorAll('.matrix-cell:not(.extra-highlight)');
    cells.forEach(cell => {
        cell.addEventListener('click', (event) => {
            const rowIndex = cell.getAttribute('data-row');
            const colIndex = cell.getAttribute('data-col');
            if (colIndex === null || rowIndex === null) return;
            if (colIndex != frontEndHandler.currentCol && rowIndex != frontEndHandler.currentRow) return; // prevent clicking on cells that are not in the current highlighted row or column
            if (frontEndHandler.currentBuffer.length >= frontEndHandler.maxBufferSize) return; // prevent clicking on cells when buffer is full

            if (cell.classList.contains('expired-cell')) return; // prevent clicking on already expired cells
            event.target.classList.add('expired-cell'); // add expired class to visually indicate the cell has been selected and is no longer selectable
            event.target.classList.remove('selectable-cell'); // remove selectable highlight immediately on click to avoid confusion, the expired class will visually indicate the cell is no longer selectable
            event.target.textContent = "[ ]"; // clear the cell content to further indicate it has been selected, this also prevents the same cell from being selected multiple times in a row by rapidly clicking, which could cause issues with the current buffer and game logic.
            audioHandler.playSound('click', frontEndHandler.FXVolume);
            const success = frontEndHandler.selectCell(parseInt(rowIndex), parseInt(colIndex));

            if (success) {
                frontEndHandler.sequence.push({ row: parseInt(rowIndex), col: parseInt(colIndex) }); //add to sequence for end of round verification and scoring
                document.querySelectorAll('.ghost').forEach(cell => {
                    cell.classList.remove('ghost');
                });
                frontEndHandler.updateBufferGUI();
                frontEndHandler.updateBufferProgress();
            }

        });
    });
}


function removeSelectableHighlights() {
    document.querySelectorAll('.selectable-cell').forEach(el => el.classList.remove('selectable-cell'));
    document.querySelectorAll('.counter-highlight').forEach(el => el.classList.remove('counter-highlight'));
}


function removeAllCellHighlights() {
    document.querySelectorAll('.selectable-cell').forEach(el => el.classList.remove('selectable-cell'));
    document.querySelectorAll('.potential-row').forEach(el => el.classList.remove('potential-row'));
    document.querySelectorAll('.potential-col').forEach(el => el.classList.remove('potential-col'));
    document.querySelectorAll('.potential-cell').forEach(el => el.classList.remove('potential-cell'));
    document.querySelectorAll('.counter-highlight').forEach(el => el.classList.remove('counter-highlight'));
}


function populateBuffer() {
    //delete old children:
    let children = document.querySelectorAll('.buffer-row > *');
    children.forEach(child => child.remove());

    const bufferRow = document.querySelector(`.buffer-row`);

    for (let i = 0; i < frontEndHandler.maxBufferSize; i++) {
        const cell = document.createElement('div');
        cell.classList.add('buffer-cell');
        cell.setAttribute('data-index', i);
        // pre-animation setup
        cell.style.transform = 'scaleX(0)'; // pre-collapsed
        cell.style.transformOrigin = 'left center';
        //
        bufferRow.appendChild(cell);
    }
}

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



function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
    } else {
        console.warn("FullScreen Exit - Failed");
    }
}

function toggleFullscreen() {
    if (document.fullscreenElement !== null) {
        if (exitFullscreen()) {
            frontEndHandler.fullScreen = false;
        };
    } else {
        if (openFullscreen()) {
            frontEndHandler.fullScreen = true;
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    frontEndHandler.fullScreen = !!document.fullscreenElement;
});

function placeFullScreenButton() {
    const button = document.createElement('i');
    button.classList.add('bi', 'bi-arrows-fullscreen');
    button.id = "fullScreenButton"; //for styling
    button.title = "Toggle Fullscreen";
    button.addEventListener('click', () => {
        toggleFullscreen();
    });
    document.body.appendChild(button);
}


document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("The tab is active.");
    } else {
        console.log("The tab is hidden.");
    }
});

function checkForSolution(input_string, solution) {
    if (Array.isArray(solution)) {
        solution = solution.join(' ');
    } else if (typeof solution !== 'number') {
        solution = String(solution);
    } else if (typeof solution !== 'string') {
        throw new Error("Invalid solution format. Please provide a string or an array of strings.");
    }
    return input_string.includes(String(solution));
}

// solution is of form: {easy: [str,str...], medium: [str,str...], hard: [str,str...]}

function checkForSolutions(input_string, solutions) {
    let results = {};
    for (let difficulty in solutions) {
        results[difficulty] = checkForSolution(input_string, solutions[difficulty]);
    }
    return results;
}


function buildSequenceList(node_list, difficulty) {


    const difficultyNames = {
        easy: "ICEPICK",
        medium: "MALWARE INJECTION",
        hard: "COMPUTER BREACH"
    }
    try {
        if (!["easy", "medium", "hard"].includes(difficulty)) {
            throw new Error("Invalid difficulty level. Please choose from 'easy', 'medium', or 'hard'.");
        }
        const score = frontEndHandler.difficultyValues[difficulty];
        const name = difficultyNames[difficulty];


        const sequenceListContainer = document.getElementById('sequence-rows-inner');
        const row = document.createElement('div');
        row.classList.add('row', 'sequence-list-row');
        row.setAttribute('data-difficulty', difficulty);


        const col5 = document.createElement('div');
        col5.classList.add('col-5');
        col5.style.cssText += `padding: 0 0 0 0.5rem;container-type: inline-size;display: flex;`;

        const scoreCardPattern = document.createElement('div');
        scoreCardPattern.classList.add('score-card-pattern');
        let index = 0;
        for (let node of node_list) {
            const nodeElement = document.createElement('div');
            nodeElement.classList.add('score-card-node');
            nodeElement.setAttribute('data-index', index);

            const span = document.createElement('span');
            span.textContent = node;
            span.classList.add('score-card-node-text-span');
            nodeElement.appendChild(span);
            scoreCardPattern.appendChild(nodeElement);
            index++;
        }
        col5.appendChild(scoreCardPattern);

        const installedDiv = document.createElement('div');
        installedDiv.classList.add('installed-div');

        const installedSpan = document.createElement('span');
        installedSpan.textContent = "Installed";
        installedDiv.appendChild(installedSpan);
        installedDiv.style.display = 'none'; // initially hidden, will be shown if the solution is found
        col5.appendChild(installedDiv);

        const failedDiv = document.createElement('div');
        failedDiv.classList.add('failed-div');

        const failedSpan = document.createElement('span');
        failedSpan.textContent = "Failed";
        failedDiv.style.display = 'none'; // initially hidden, will be shown if the solution is failed
        failedDiv.appendChild(failedSpan);
        col5.appendChild(failedDiv);

        const col7 = document.createElement('div');
        col7.classList.add('col-7');
        col7.classList.add('ps-0');
        col7.classList.add('ps-sm-1');
        col7.classList.add('pe-0');
        col7.classList.add('pe-sm-2');
        col7.classList.add('pe-md-1');
        col7.classList.add('justify-content-center');
        col7.classList.add('align-items-center');
        col7.classList.add('d-flex');
        col7.classList.add('d-sm-block');

        const scoreCard = document.createElement('div');
        scoreCard.classList.add('score-card');

        const img = document.createElement('img');
        img.src = `/imgs/${difficulty}-cell-decoration.png`;
        img.classList.add('score-card-img');

        const scoreText = document.createElement('div');
        scoreText.classList.add('score-text-div');

        const div1 = document.createElement('div');
        div1.classList.add('cy-text-white', 'score-card-text', 'score-card-text-header');
        const h6_1 = document.createElement('h6');
        h6_1.textContent = name;
        div1.appendChild(h6_1);
        scoreText.appendChild(div1);

        const div2 = document.createElement('div');
        div2.classList.add('cy-text-yellow', 'score-card-text', 'score-card-text-body');
        const h6_2 = document.createElement('h6');
        h6_2.textContent = `${score} Points`;
        div2.appendChild(h6_2);
        scoreText.appendChild(div2);

        scoreCard.appendChild(img);
        scoreCard.appendChild(scoreText);
        col7.appendChild(scoreCard);

        row.appendChild(col5);
        row.appendChild(col7);
        sequenceListContainer.appendChild(row);
        return row;
    } catch (error) {
        console.error("Error in buildSequenceList:", error);
        return document.createElement('div'); // Return an empty div in case of error to avoid breaking the layout
    }

}

function buildSequenceLists(solutions) {
    const wrapper = document.getElementById('sequences-wrapper');
    wrapper.style.transition = 'none';
    wrapper.style.transformOrigin = 'left top';
    wrapper.style.transform = 'scaleX(0) scaleY(1)';

    const rowsContainer = document.getElementById('sequence-rows-container');
    rowsContainer.style.transition = 'none';
    rowsContainer.style.transformOrigin = 'top center';
    rowsContainer.style.maxHeight = '0px';
    rowsContainer.style.overflow = 'hidden';
    document.getElementById('sequence-rows-inner').querySelectorAll('.sequence-list-row').forEach(row => row.remove());

    for (let difficulty in solutions) {
        buildSequenceList(solutions[difficulty], difficulty);
    }
}

function highlightCardNodeIndex(index) {
    const bufferCell = document.querySelectorAll(`.score-card-node[data-index="${index}"]`);
    bufferCell.forEach(cell => {
        cell.setAttribute('filled', '');
    });
}

function unhighlightCardNodeIndex(index = null) {
    let cells;
    if (index === null) {
        cells = document.querySelectorAll('.score-card-node[filled]');
    } else {
        cells = document.querySelectorAll(`.score-card-node[data-index="${index}"]`);
    }
    cells.forEach(cell => {
        cell.removeAttribute('filled');
    });
}


function hideNodesTillIndex(index, rowElement) {
    const bufferCells = rowElement.querySelectorAll('.score-card-node');
    bufferCells.forEach(cell => {
        const cellIndex = parseInt(cell.getAttribute('data-index'));
        if (cellIndex < index) {
            cell.style.visibility = 'hidden';
        } else {
            cell.style.visibility = 'visible';
        }
    });
}

function decorateCurrentNodeAtIndex(index, rowElement) {
    const bufferCells = rowElement.querySelectorAll('.score-card-node');
    bufferCells.forEach(cell => {
        const cellIndex = parseInt(cell.getAttribute('data-index'));
        if (cellIndex === index) {
            cell.classList.add('current-node');
        } else {
            cell.classList.remove('current-node');
        }
    });
}

function showAllNodes(rowElement = null) {
    if (rowElement === null) {
        const bufferCells = document.querySelectorAll('.score-card-node');
        bufferCells.forEach(cell => {
            cell.style.visibility = 'visible';
        });
        return;
    }
    const bufferCells = rowElement.querySelectorAll('.score-card-node');
    bufferCells.forEach(cell => {
        cell.style.visibility = 'visible';
    });
}


function matchSequence(solution, testSubject) {
    //example usage
    //sol = ['1C', 'BD', 'CD']
    //testSubject = ['BD', '55', '1C']
    //matchSequence(sol,testSubject) expected output -> ["1C"]

    //to detect how far the user is to achieving a solution
    let matchIndex = 0;

    for (const node of testSubject) {
        if (matchIndex === 0) {
            if (node === solution[0]) {
                matchIndex = 1;
            }
        } else {
            if (node === solution[matchIndex]) {
                matchIndex++;
            } else {
                // reset and re-evaluate current node from scratch
                matchIndex = 0;
                if (node === solution[0]) {
                    matchIndex = 1;
                }
            }
        }

        if (matchIndex === solution.length) {
            return solution;
        }
    }

    return solution.slice(0, matchIndex);
}

function sequenceProgressHandler(solution, testSubject, rowElement) {
    unhighlightCardNodeIndex();
    const matchedNodes = matchSequence(solution, testSubject);
    if (matchedNodes.length > 0) {
        highlightCardNodeIndex(matchedNodes.length - 1);
        hideNodesTillIndex(matchedNodes.length, rowElement);
    } else {
        showAllNodes(rowElement);
    }
    decorateCurrentNodeAtIndex(matchedNodes.length, rowElement);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'F11') {
        event.preventDefault(); // Prevent the default F11 behavior
        toggleFullscreen();
    }
});

//web socket
const socket = io(window.location.origin, {
    path: "/multiPlayer/socket"
}); // Connecting to the Socket.IO server at the path

socket.on('connect', () => {
    console.log('Connected to server with socket ID:', socket.id);
    socket.emit('initialize_data', { frontEndHandler: frontEndHandler });
});

socket.on('message', (data) => {
    console.log('Message from server:', data);
});

socket.on('initialization_error', (data) => {
    console.warn('Initialization error from server:', data.message);
    alert(`Initialization error: ${data.message}`);
});

socket.on('initialization_success', (data) => {
    console.log('Initialization success from server:', data.message);

    //check for a pre-existing defaultTimeFrame in SessionStorage:
    (function () {
        let frontEndHandlerStorage = sessionStorage.getItem('frontEndHandler')
        if (!frontEndHandlerStorage || frontEndHandlerStorage === 'undefined') return;//for some reason sessionStorage returns the string 'undefined' instead of just undefined or null...
        let previouslySelectedTimeFrame = JSON.parse(frontEndHandlerStorage).selectedTimeFrame
        if (!previouslySelectedTimeFrame || previouslySelectedTimeFrame === 'undefined' || isNaN(previouslySelectedTimeFrame)) return;

        document.querySelector('.icb-pre__tf-active').classList.remove('icb-pre__tf-active')
        let activeBtn = document.querySelector(`.icb-pre__tf-btn[data-seconds='${String(previouslySelectedTimeFrame)}']`)
        if (activeBtn) {
            activeBtn.classList.add('icb-pre__tf-active')
        }
        socket.emit('timeframe_update', { timeframe: Number(previouslySelectedTimeFrame) });
        socket.once('timeframe_update_response', (data) => {
            console.log('Time frame update response received for socket ID:', data);
            if (data.accepted) {
                frontEndHandler.selectedTimeFrame = Number(previouslySelectedTimeFrame); //update the front end handler's selected time frame to reflect the successful update, this will ensure the UI and timer use the new time frame value
                initTimer(); // re-initialize timer with new time frame
            } else {
                console.warn('Time frame update rejected for socket ID:', socket.id, 'Reason:', data.message);
            }
        });
    })();
    const preGameMenu = document.getElementById('pre-game-menu');
    if (preGameMenu) {//guard against loosing connection during result page view
        preGameMenu.style.display = 'block';
    }
});

socket.once('isGuestStatus', (data) => {
    frontEndHandler.isGuest = data.isGuest;
});

socket.on('banned', (data) => {
    if (data.message === 'banned') {
        window.location.href = '/banned';
    }
    localStorage.setItem('latest_ban_reason', data.reason);
});

socket.on('disconnect', (reason) => {
    console.warn('Disconnected from server. Reason:', reason);
});

function initialGameGUI() {
    unAnimateRoundEnd(/*instant = */true); //to clear gui
    requestAnimationFrame(() => { //unAnimateRoundEnd is async and this keeps its style resets from overriding the intial GUI setup below
        document.body.style.backgroundColor = 'var(--cy-dark-1)'; //initial black to match the pre game menu
        document.getElementById('terminal-content-row').style.padding = '0';
        document.getElementById('window-outside').style.height = '0';
        document.getElementById('sequences-wrapper').style.height = '0';
        document.getElementById('document-header').style.height = '1rem';
        document.getElementById('cy-terminal').style.border = 'none';
        document.getElementById('cy-terminal').style.width = '100%';
        (function () {
            const style = document.createElement('style');
            style.id = 'hide-terminal-pseudo';
            style.textContent = `#cy-terminal::before, #cy-terminal::after { display: none !important; }`;
            document.head.appendChild(style);
        })();
        document.querySelector('.cy-hud-frame__br').style.display = 'none';
        document.querySelector('.cy-hud-frame__bl').style.display = 'none';
        document.querySelector('#terminal-content-row').style.backgroundColor = 'transparent';
        document.querySelector('#terminal-content-row').style.borderColor = 'transparent';
        document.querySelector('#terminal-content-row').classList.add('glitch-static');
    });
}

initialGameGUI(); // set up the initial GUI state for the game, this is necessary in case the player starts a new game after finishing a previous one, to reset the GUI back to the initial state without any lingering styles or elements from the end of round animation.

function undoInitialGameGUI() {
    document.body.style.removeProperty('background-color'); //remove the black background set for the pre game menu to allow the normal background to show through during gameplay
    document.getElementById('terminal-content-row').style.removeProperty('padding');
    document.getElementById('window-outside').style.removeProperty('height');
    document.getElementById('sequences-wrapper').style.removeProperty('height');
    document.getElementById('document-header').style.removeProperty('height');
    document.getElementById('cy-terminal').style.removeProperty('border');
    document.getElementById('cy-terminal').style.removeProperty('width');
    document.getElementById('hide-terminal-pseudo').remove();
    document.querySelector('.cy-hud-frame__br').style.removeProperty('display');
    document.querySelector('.cy-hud-frame__bl').style.removeProperty('display');
    document.querySelector('#terminal-content-row').style.removeProperty('background-color');
    document.querySelector('#terminal-content-row').style.removeProperty('border-color');
    document.querySelector('#terminal-content-row').classList.remove('glitch-static');
}

document.getElementById('icb-pre-start-btn').addEventListener('click', () => {
    //start round — the actual GUI transition happens once a match is found (see 'matchmake_found' below),
    //since there's a "searching for a match..." waiting period before gameplay actually begins.
    socket.emit('matchmake', { selectedTimeFrame: frontEndHandler.selectedTimeFrame });
});







socket.on('matchmake_queued', (data) => {
    document.querySelector('.icb-pre__rule-text').innerText = "Searching for a match..."
    document.getElementById('icb-pre-start-btn').style.display = 'none';
    document.getElementById('timeframe-buttons-div').style.cssText += 'display: none !important;';

    // show cancel button (create once, reuse on re-queue)
    let cancelBtn = document.getElementById('icb-cancel-matchmaking-btn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'icb-cancel-matchmaking-btn';
        cancelBtn.style.cssText = [
            'margin-top:12px',
            'margin-bottom:12px',
            'padding:6px 20px',
            'background:transparent',
            'border:1px solid var(--cy-magenta)',
            'color:var(--cy-magenta)',
            'font-family:var(--font-mono,"Share Tech Mono",monospace)',
            'font-size:11px',
            'letter-spacing:2px',
            'text-transform:uppercase',
            'cursor:pointer',
        ].join(';');
        cancelBtn.textContent = 'Cancel Search';
        cancelBtn.addEventListener('click', () => {
            socket.emit('cancel_matchmaking');
        });
        document.getElementById('icb-pre-start-btn').parentElement.appendChild(cancelBtn);
    }
    cancelBtn.style.display = '';
});

socket.on('matchmake_cancelled', () => {
    document.querySelector('.icb-pre__rule-text').innerText = "Find your match.";
    document.getElementById('icb-pre-start-btn').style.display = '';
    document.getElementById('timeframe-buttons-div').style.removeProperty('display');
    const cancelBtn = document.getElementById('icb-cancel-matchmaking-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
});

socket.on('matchmake_found', (data) => {
    // always hide cancel button — match either found or failed, queue is gone either way
    const cancelBtn = document.getElementById('icb-cancel-matchmaking-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    if (data.success) {
        frontEndHandler.matchEndTime = data.matchEndTime;
        frontEndHandler.opponent = data.opponent;
        document.querySelector('.icb-pre__rule-text').innerText = "Match found! Starting game..."
        console.log('opponent name:', data.opponent);

        //this is the actual pre-game -> gameplay transition, so this is where the initial
        //black/collapsed GUI (set up by initialGameGUI() on page load) needs to be undone.
        //singlePlayerFrontend.js does this immediately on start-button click since it has no
        //waiting period; multiplayer has to wait until a match actually exists.
        undoInitialGameGUI();
        audioHandler.stopCover();

        frontEndHandler.newRound();
        initializeOpponentInfo();
    } else {
        document.querySelector('.icb-pre__rule-text').innerText = "Matchmaking failed..."
        //let the player retry instead of getting stuck on a dead screen
        document.getElementById('icb-pre-start-btn').style.display = '';
        document.getElementById('timeframe-buttons-div').style.removeProperty('display');
    }
});

// server-authoritative match end. Only stores the result — navigation is driven
// solely by finishMatch(), called once our own round-end animation has actually
// finished. Never navigate from here directly, or we risk swapping out the DOM
// mid-animation (which also breaks the sessionStorage.setItem in goToPage's
// fetch success path, silently falling into the hard-reload .catch instead).
socket.on('match_result', (data) => {
    if (frontEndHandler.matchResultReceived) return; // server should only emit once
    frontEndHandler.matchWon = data.won;
    frontEndHandler.matchDraw = data.draw;
    frontEndHandler.finalScore = data.yourScore;
    frontEndHandler.score = data.yourScore; // authoritative final score for result page
    frontEndHandler.opponentFinalScore = data.opponentScore;
    frontEndHandler.opponent = data.opponentName;
    frontEndHandler.matchEndReason = data.reason || null;
    frontEndHandler.matchEndMessage = data.message || null;
    frontEndHandler.matchResultReceived = true;

    if (data.reason === 'opponent_disconnected' || data.reason === 'opponent_cheating') {
        frontEndHandler.awaitingMatchResult = false;
        frontEndHandler.navigateToResult();
    } else if (frontEndHandler.awaitingMatchResult) {
        frontEndHandler.awaitingMatchResult = false;
        frontEndHandler.navigateToResult();
    }
    //waits for animation automatically
});

// Live opponent score: update HUD element whenever opponent finishes a round.
socket.on('opponent_score_update', (data) => {
    updateOpponentScore(data);
});

function updateOpponentScore(data) {
    let oppNameEl = document.getElementById('opponent-name');
    let oppScoreEl = document.getElementById('opponent-score');
    let oppEl = document.getElementById('opponent-info');
    oppEl.style.removeProperty('display'); //show the opponent info div if it was hidden

    const label = frontEndHandler.opponent ? frontEndHandler.opponent.substring(0, 10) : 'OPP';
    oppNameEl.textContent = label;
    oppScoreEl.textContent = `Score: ${data.score || 0}`;
}

function initializeOpponentInfo() {
    let oppNameEl = document.getElementById('opponent-name');
    let oppScoreEl = document.getElementById('opponent-score');
    let oppEl = document.getElementById('opponent-info');
    oppEl.style.removeProperty('display'); //show the opponent info div if it was hidden

    const label = frontEndHandler.opponent ? frontEndHandler.opponent.substring(0, 10) : 'OPP';
    oppNameEl.textContent = label;
    oppScoreEl.textContent = `Score: 0`;
}


// winning-player-disconnected void path
socket.on('match_cancelled', (data) => {
    frontEndHandler.matchCancelled = true;
    frontEndHandler.matchEndReason = data.reason || 'opponent_disconnected';
    frontEndHandler.matchEndMessage = data.message || 'Opponent disconnected. Match voided.';
    frontEndHandler.finalScore = data.yourScore || 0;
    frontEndHandler.score = data.yourScore || 0;
    frontEndHandler.opponentFinalScore = data.opponentScore || 0;
    frontEndHandler.matchCancelReason = frontEndHandler.matchEndMessage;
    frontEndHandler.opponent = data.opponentName || frontEndHandler.opponent;
    frontEndHandler.matchResultReceived = true;
    frontEndHandler.navigateToResult();
});

socket.on('disconnect', () => {
    if (!frontEndHandler.navigatingToResult) {
        window.location.reload();
    }
})







//settings menu
const default_settings = {
    FXVolume: 1,
    BGVolume: 0.6,
    muted: false,
    graphics: 'normal'
};

const SERVER_SETTINGS_TIMEOUT_MS = 3000;

let serverSavedSettings = undefined;

// Resolves once we know whatever the server has to tell us (or we give up waiting).
// Guests resolve immediately since there's nothing to fetch.
const serverSettingsReady = new Promise((resolve) => {
    socket.once('isGuestStatus', (data) => {
        if (data.isGuest) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            console.warn('Timed out waiting for saved settings from server; using local/default values.');
            resolve();
        }, SERVER_SETTINGS_TIMEOUT_MS);

        socket.once('saved_settings_response', (respData) => {
            clearTimeout(timeout);
            if (respData.accepted) {
                serverSavedSettings = respData.settings;
            } else {
                console.warn('Failed to retrieve saved settings from server:', respData.message);
            }
            resolve();
        });

        socket.emit('request_saved_settings');
    });
});

function getServerSavedSetting(settingName) {
    return serverSavedSettings?.[settingName] ?? null;
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

function saveSettingToServer(settingName, newValue) {

    const payload = {};
    //prepare the json payload
    for (let key in default_settings) {
        if (key === settingName) {
            // send the new value for the changed setting
            payload[key] = newValue;
        } else {
            // send the current value for other settings
            payload[key] = frontEndHandler[key];
        }
    }
    socket.emit('settings_update', payload);
}

socket.on('settings_update_response', (data) => {
    if (data.accepted) {
        console.log('Settings update accepted by server.');
    } else {
        console.warn('Settings update rejected by server:', data.message);
    }
});

function editSetting(settingName, newValue = null, initial = false, persist = true) {
    if (newValue === null) {
        if (!initial) {
            newValue = default_settings[settingName];
        } else {
            let saved = {};
            try {
                saved = JSON.parse(localStorage.getItem('settings')) ?? {};
            } catch {
                saved = {};
            }

            newValue =
                saved?.[settingName] ??
                getServerSavedSetting(settingName) ??
                default_settings[settingName];
        }
    }

    if (typeof newValue === 'number') {
        newValue = Math.max(0, Math.min(1, newValue));
        newValue = parseFloat(newValue.toFixed(2));
    }
    frontEndHandler[settingName] = newValue;

    if (!initial && persist) {
        try {
            localStorage.setItem('settings', JSON.stringify({
                FXVolume: frontEndHandler.FXVolume,
                BGVolume: frontEndHandler.BGVolume,
                muted: frontEndHandler.muted,
                graphics: frontEndHandler.graphics
            }));
        } catch (err) {
            console.warn('Could not save settings to localStorage:', err);
        }
        saveSettingToServer(settingName, newValue);
    }

    // DOM updates always run, regardless of persist — this is what makes it feel live
    if (settingName === 'FXVolume') {
        document.documentElement.style.setProperty('--fx-volume', `"${Math.round(frontEndHandler.FXVolume * 100)}%"`);
        document.getElementById('fx-volume-slider').value = newValue;
        audioHandler.setFXVolume(frontEndHandler.FXVolume); // live volume change while dragging
    } else if (settingName === 'BGVolume') {
        document.documentElement.style.setProperty('--bg-volume', `"${Math.round(frontEndHandler.BGVolume * 100)}%"`);
        document.getElementById('bg-volume-slider').value = newValue;
        audioHandler.setBGVolume(frontEndHandler.BGVolume); // live volume change while dragging
    } else if (settingName === 'muted') {
        if (frontEndHandler.muted) {
            audioHandler.muteAudio();
        } else {
            audioHandler.unmuteAudio();
        }
    } else if (settingName === 'graphics') {
        document.getElementById('graphics-value').textContent = newValue;
    }
}

(function () {
    const mute_options = {
        unmuted: '<i class="bi bi-volume-up cy-text-magenta"></i>',
        muted: '<i class="bi bi-volume-mute cy-text-magenta"></i>'
    };

    const mute_icon = document.getElementById('mute-icon');
    const syncMuteIcon = () => {
        mute_icon.innerHTML = frontEndHandler.muted ? mute_options.muted : mute_options.unmuted;
    };

    // Wait for server data (or the timeout) before applying settings once, so
    // editSetting(..., true) only ever runs a single time per setting.
    serverSettingsReady.then(() => {
        for (let setting in default_settings) {
            editSetting(setting, null, true);
        }
        syncMuteIcon();
    });

    const mute_btn = document.getElementById('mute-button');
    mute_btn.addEventListener('click', () => {
        editSetting('muted', !frontEndHandler.muted);
        syncMuteIcon();
    });

    const defaults_btn = document.getElementById('defaults-button');
    defaults_btn.addEventListener('click', () => {
        for (let setting in default_settings) {
            editSetting(setting, null, false);
        }
        syncMuteIcon();
    });

    const graphics_btn = document.getElementById('graphics-button');
    const graphics_options = ['low', 'normal'];
    graphics_btn.addEventListener('click', () => {
        const nextValue = frontEndHandler.graphics === graphics_options[0]
            ? graphics_options[1]
            : graphics_options[0];
        editSetting('graphics', nextValue);
    });

    const fx_volume_slider = document.getElementById('fx-volume-slider');
    fx_volume_slider.addEventListener('input', (event) => {
        editSetting('FXVolume', parseFloat(event.target.value), false, false); // visual only, no persist
    });
    fx_volume_slider.addEventListener('change', (event) => {
        editSetting('FXVolume', parseFloat(event.target.value)); // persist=true (default), fires once on release
    });

    const bg_volume_slider = document.getElementById('bg-volume-slider');
    bg_volume_slider.addEventListener('input', (event) => {
        editSetting('BGVolume', parseFloat(event.target.value), false, false);
    });
    bg_volume_slider.addEventListener('change', (event) => {
        editSetting('BGVolume', parseFloat(event.target.value));
    });

    const close_btn = document.getElementById('close-button');
    close_btn.addEventListener('click', () => {
        document.getElementById('settings-div').style.display = 'none';
    });

    const settings_btn = document.getElementById('settings-button');
    settings_btn.addEventListener('click', () => {
        document.getElementById('settings-div').style.removeProperty('display');
    });
})();

document.getElementById('profile').addEventListener('click', () => {
    window.location.href = '/profile';
});