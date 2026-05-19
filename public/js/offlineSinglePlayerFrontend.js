import * as codeMatrix from "/js/codeMatrix.js";
import * as audioHandler from "/js/audio.js";
audioHandler.initAudio();
placeFullScreenButton();
generateSelectedBar(); //for timeframe

class SinglePlayerFrontend {
    constructor() {
        this.rowMode = true; // true for row mode, false for column mode
        this.currentRow = null;
        this.currentCol = null;
        this.currentBuffer = []; //[str,str...]
        this.maxBufferSize = 9;
        this.matrix = null;
        this.solutions = null;
        this.gameState = "active"; // can be "active", "won", "lost"
        this.score = 0;
        this.audioHandler = audioHandler;
        this.FXVolume = 1;
        this.BGVolume = 0.75;
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
    generateAndRenderMatrix() {
        const matrixSize = 7; // You can adjust this size, safeguards are in place to handle different sizes but the UI is optimized for 6 or 7 :)
        [this.matrix, this.solutions] = codeMatrix.buildMatrix(matrixSize,matrixSize,5)
        document.documentElement.style.setProperty('--matrixSize', String(matrixSize));

        document.querySelectorAll(".matrix-cell").forEach(cell => cell.remove());//remove old highlights

        codeMatrix.renderMatrix(this.matrix) //generates new highlights
        removeAllCellHighlights();
        
        addCellClickListeners();
        buildSequenceLists(frontEndHandler.solutions);
        frontEndHandler.updateBufferProgress(); //initial
        removeAllCellHighlights(); //remove any old ones
        addCellHighlightListeners();
        populateBuffer(); //also clears old ones
        frontEndHandler.rowModeUpdate(0); //initial highlight of first row
    }

    updateBufferGUI () {
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
                    frontEndHandler.audioHandler.playSound('win',frontEndHandler.FXVolume);
                } else {
                    sequenceProgressHandler(this.solutions[difficulty], this.currentBuffer, progressBar);
                    all_solved = false;
                    progressBar.removeAttribute('installed'); /*this shouldnt have to make a difference but just in case*/
                }
            }
        }
        if (all_solved || this.currentBuffer.length >= this.maxBufferSize) {
            //TODO
            console.log("All solutions solved! Implement win condition here.");
            this.endRound();
        }
    }

    endRound() {

        //add failed attribute to any unsolved solutions
        document.querySelectorAll('.sequence-list-row:not([installed])').forEach(row => {
            row.setAttribute('failed', '');
        });


        //check if player won or lost, which is if they got all solutions or not
        let complete_solution_progress = checkForSolutions(this.currentBuffer.join(' '), this.solutions);
        let allSolved = true;
        for (let difficulty in complete_solution_progress) {
            if (!complete_solution_progress[difficulty]) {
                allSolved = false;
                break;
            }
        }
        if (allSolved) {
            this.winRound();
        } else {
            this.looseRound();
        }
        return allSolved;
    }

    winRound() {
        this.gameState = "won";
        let matrixWindow = document.querySelector('#window-outside');
        matrixWindow.setAttribute('data-state', 'won');
    }

    looseRound() {
        this.gameState = "lost";
        let matrixWindow = document.querySelector('#window-outside');
        matrixWindow.setAttribute('data-state', 'lost');
        this.audioHandler.playSound('lose', this.FXVolume);
    }

    newRound() {
        this.audioHandler.stopMusic(); //old ones
        this.audioHandler.startMusic(this.BGVolume); //new one
        this.gameState = "active"; // can be "active", "won", "lost"
        let matrixWindow = document.querySelector('#window-outside');
        matrixWindow.setAttribute('data-state', 'active');

        this.rowMode = true; // true for row mode, false for column mode
        this.currentRow = null;
        this.currentCol = null;
        this.currentBuffer = []; //[str,str...]
        this.matrix = null;
        this.solutions = null;
        //DONT reset score, score carries over rounds
        
        this.generateAndRenderMatrix();
    }
}
const frontEndHandler = new SinglePlayerFrontend();
frontEndHandler.generateAndRenderMatrix();





document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('timeframe-option')) return;

    document.querySelectorAll('.timeframe-option').forEach(opt => {
        opt.removeAttribute('selected');
    });
    event.target.setAttribute('selected', '');

    moveSelectedBar(true);
});

window.addEventListener('resize', () => moveSelectedBar(false));
window.addEventListener('resize', () => {
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

function generateSelectedBar() {
    const selected = getSelectedOption();
    if (!selected) return;

    const bar = document.createElement('div');
    bar.classList.add('selected-bar');
    const parent = document.getElementById('timeframe-options');
    parent.appendChild(bar);

    positionBarUnder(bar, selected, false);
}

function moveSelectedBar(animate = false) {
    const bar = document.querySelector('.selected-bar');
    const selected = getSelectedOption();
    if (!bar || !selected) return;

    positionBarUnder(bar, selected, animate);
}



function positionBarUnder(bar, element, animate) {
    const parentRect = bar.offsetParent.getBoundingClientRect();
    const rect = element.getBoundingClientRect();

    bar.style.transition = animate ? 'left 0.3s ease, width 0.3s ease' : 'none';
    bar.style.top = `${rect.top - parentRect.top}px`;
    bar.style.height = `${rect.height}px`;
    if (window.innerWidth > 576) { 
        bar.style.width = `${rect.width}px`;
        bar.style.left = `${rect.left - parentRect.left}px`
    } else { //add horizontal_offset for mobile to make it look better, on desktop its already there naturally.
        const horizontalOffset = 12.5
        bar.style.width = `${rect.width + horizontalOffset*2}px`;
        bar.style.left = `${rect.left - parentRect.left - horizontalOffset}px`;
    }
}



async function resizeMatrixCol(percentage = "58", offset = 0) {
    const main = document.querySelector('.main-matrix-col');
    const side = document.querySelectorAll('.side-matrix-col');
    if (!main || side.length === 0) return;

    main.style.width = `${percentage}%`;
    side.forEach(s => s.style.width = `${(100 - percentage) / side.length}%`);

    const height_var = await getStableCellHeight();

    document.querySelectorAll('.extra-highlight').forEach(cell => {
        cell.style.cssText = `width: 100% !important; height: ${document.querySelector('[data-row="0"]:not(.extra-highlight)').getBoundingClientRect().height + offset}px !important;`
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
        offset = 0.2
    };
    if (isNaN(currentWidth) || currentWidth <= 45) return;
    resizeMatrixCol(currentWidth - 5, offset);
});



document.getElementById('sizeReset-btn').addEventListener('click', () => {
    const main = document.querySelector('.main-matrix-col');
    if (!main) return;
    if (window.innerWidth <= 992) return;

    resizeMatrixCol(58);
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


    return cursor; // return ref in case you need to remove/resize it later
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

function highlightCounter(Index, isRow=frontEndHandler.rowMode) {
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

            // current-node indicator
            
            //loop through all document.querySelectorAll('.current-node')
            //if any of them have an inner text equal to the currently hovered cell, add the hovered-current-node class to the .current-node cell
            //this is where you write
            const isSelectableRow = frontEndHandler.rowMode && rowIndex == frontEndHandler.currentRow && !cell.classList.contains('expired-cell');
            const isSelectableCol = !frontEndHandler.rowMode && colIndex == frontEndHandler.currentCol && !cell.classList.contains('expired-cell');
            if (isSelectableRow || isSelectableCol) {
                document.querySelectorAll('.current-node').forEach(currentNode => {
                    const currentNodeText = currentNode.querySelector('.score-card-node-text-span')?.textContent || currentNode.textContent;
                    if (currentNodeText.trim() === cell.innerText.trim()) {
                        currentNode.classList.add('hovered-current-node');
                    }
                    frontEndHandler.audioHandler.playSound('hover',frontEndHandler.FXVolume);
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
            frontEndHandler.audioHandler.playSound('click',frontEndHandler.FXVolume);
            const success = frontEndHandler.selectCell(parseInt(rowIndex), parseInt(colIndex));

            if (success) {
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


    for (let i = 0; i < frontEndHandler.maxBufferSize; i++ ) {
        const cell = document.createElement('div');
        cell.classList.add('buffer-cell');
        cell.setAttribute('data-index', i);
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
    console.warn("FullScreen Request - Failed")
    return
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
        console.warn("FullScreen Exit - Failed")
        return
    }
}

function toggleFullscreen() {
    if (document.fullscreenElement !== null) {
            exitFullscreen();
        } else {
            openFullscreen();
        }
}

function placeFullScreenButton() {
    const button = document.createElement('i');
    button.classList.add('bi', 'bi-arrows-fullscreen');
    button.id = "fullScreenButton"; //for styling
    button.title = "Toggle Fullscreen";
    button.addEventListener('click', () => {
        toggleFullscreen();
    });
    document.body.appendChild(button);
};


//document.addEventListener('fullscreenchange', () => {
//  if (document.fullscreenElement) {
//    console.log('Entered fullscreen mode');
//  } else {
//    console.log('Exited fullscreen mode');
//  }
//});





document.addEventListener("visibilitychange", () => {

  if (document.visibilityState === "visible") {
    console.log("The tab is active.");
  } else {
    
    console.log("The tab is hidden.");
  }


});

function checkForSolution(input_string,solution) {
    if (Array.isArray(solution)) {
        solution = solution.join(' ')
    } else if (typeof solution !== 'number') {
        solution = String(solution);
    } else if (typeof solution !== 'string') {
        throw new Error("Invalid solution format. Please provide a string or an array of strings.")
    }
    return input_string.includes(String(solution))
}

// solution is of form: {easy: [str,str...], medium: [str,str...], hard: [str,str...]}

function checkForSolutions(input_string,solutions) {
    let results = {}
    for (let difficulty in solutions) {
        results[difficulty] = checkForSolution(input_string,solutions[difficulty])
    }
    return results
}


function buildSequenceList(node_list,difficulty) {
    
    let difficulty_index;
    if (typeof(difficulty) == 'number') {
        try {

            difficulty = ["easy","medium","hard"][difficulty]
            difficulty_index = difficulty;
        } catch (error) {
            throw new Error("Invalid difficulty index. Please provide a number (0 for easy, 1 for medium, 2 for hard).")
        }
    } else if (typeof(difficulty) == 'string') {
        difficulty_index = ["easy","medium","hard"].indexOf(difficulty)
    } else {
        throw new Error("Invalid difficulty format. Please provide a string ('easy', 'medium', 'hard') or a number (0, 1, 2).")
    }
    const names = ["ICEPICK","MALWARE_INJECTION","COMPUTER_BREACH"]
    const scores = [200, 300, 500]
    try {        if (!["easy","medium","hard"].includes(difficulty)) {
            throw new Error("Invalid difficulty level. Please choose from 'easy', 'medium', or 'hard'.");
        }
    const score = scores[difficulty_index]
    const name = names[difficulty_index]


    const sequenceListContainer = document.querySelector("#sequences-wrapper .container-fluid")
    const row = document.createElement('div');
    row.classList.add('row', 'sequence-list-row');
    row.setAttribute('data-difficulty', difficulty);

    const col5 = document.createElement('div');
    //col5.classList.add('col-sm-5');
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
    //col7.classList.add('col-5');
    col7.classList.add('ps-0')  
    col7.classList.add('ps-sm-1')
    col7.classList.add('pe-0')
    col7.classList.add('pe-sm-2')
    col7.classList.add('pe-md-1')
    col7.classList.add('justify-content-center');
    col7.classList.add('align-items-center');
    col7.classList.add('d-flex');
    col7.classList.add('d-sm-block');
    
    const scoreCard = document.createElement('div');
    scoreCard.classList.add('score-card');


    const img = document.createElement('img');
    img.src = `/imgs/${difficulty}-cell-decoration.png`;
    img.classList.add('score-card-img')

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
    let container = document.querySelector("#sequences-wrapper");
    container.querySelectorAll(".sequence-list-row").forEach(row => row.remove()); // Clear existing content
    for (let difficulty in solutions) {
        buildSequenceList(solutions[difficulty], difficulty);
    }
}

function highlightCardNodeIndex(index) {
    const bufferCell = document.querySelectorAll(`.score-card-node[data-index="${index}"]`);
    bufferCell.forEach(cell => {
        cell.setAttribute('filled','')
    });
}

function unhighlightCardNodeIndex(index=null) {
    let cells;
    if (index === null) {
        cells = document.querySelectorAll('.score-card-node[filled]');
    } else {
        cells = document.querySelectorAll(`.score-card-node[data-index="${index}"]`);
    }
    cells.forEach(cell => {
        cell.removeAttribute('filled')
    });
}


function hideNodesTillIndex(index,rowElement) {
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

function decorateCurrentNodeAtIndex(index,rowElement) {
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

function showAllNodes(rowElement=null) {
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
    //sol = ['1C', 'BD', 'CD']
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

const testing_exports = {
    frontEndHandler,
    resizeMatrixCol,
    highlightRow,
    highlightCol,
    addCellClickListeners,
    addCellHighlightListeners,
    removeSelectableHighlights,
    removeAllCellHighlights,
    checkForSolution,
    checkForSolutions,
    buildSequenceList,
    highlightCounter,
    buildSequenceLists,
    highlightCardNodeIndex,
    unhighlightCardNodeIndex,
    hideNodesTillIndex,
    decorateCurrentNodeAtIndex,
    matchSequence,
    sequenceProgressHandler,
    showAllNodes,
    socket,

    //any testing objeects that need to be accessed in the console can be added here as properties of testing_exports, and they will be attached to the window object for easy access.
};
Object.assign(window, testing_exports);