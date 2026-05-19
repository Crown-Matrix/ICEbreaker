const matrix_nodes = ['7A','1C','BD','55','E9','FF']

export function randomInteger(min, max,exclude=[]) {

    // Generate a random integer between min and max (inclusive), excluding any numbers in the exclude array
    let randomInt = null;
    do {
        randomInt = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (exclude.includes(randomInt));
    return randomInt;
}

export function nonRandomInteger(min,max) { //for testing rng
    return 0
}

export function randomNode() {
    return matrix_nodes[randomInteger(0, matrix_nodes.length - 1)];
}   



// Function to generate a random matrix (m x n)
export function generateMatrix(vertical,horizontal) {
    let matrix = [];
    for (let i = 0; i<vertical;i++) {
        matrix[i] = [];
        for (let j = 0;j<horizontal;j++) {
            matrix[i][j] = randomNode()
        }
    }
    return matrix;
}

export function injectSolution(matrix, solution,initial_offset=0) {
    if (solution.length === 0) {//base case no solution to inject
        return
    }
    if (matrix.length === 0 || matrix[0].length === 0) {//base case no matrix to inject into
        return
    }



    let maximum_solution_length = Math.min(matrix.length,matrix[0].length) + 1 //the maximum solution length is the number of nodes in the longest path from the top left to the bottom right, which is the number of rows + number of columns - 1 because we are counting the starting node twice
    let maximum_matrix_path_length = matrix.length + matrix[0].length - 1 // we dont need this just smth to keep in mind
    if (solution.length > maximum_solution_length) {
        console.log("Solution is too long to inject into the matrix, truncating solution to fit the matrix")
        solution = solution.slice(0,maximum_solution_length)
    }
    // solution is of the form [node1, node2, node3, ...]
    // no more than like 5 nodes in the solution, and they are not always unique or might not even be in the matrix, but we will try to inject them into the matrix at random positions
    let edited_nodes = new Set() //to keep track of which rows have been edited so we dont overwrite them which would make the solution unsolvable
    // 0 based indexing btw
    //edited_nodes.add([1,2]) this line means row 1 column 2 has been edited, so we should not overwrite it when we are trying to inject the solution, but we can still inject the solution into other positions in the matrix
    function isEdited(row,col) {
        return edited_nodes.has(`${row},${col}`)
    }
    
    function getAllEditedColsInRow(row) {
        let edited_cols = []
        for (let col = 0; col < matrix[0].length; col++) {
            if (isEdited(row,col)) {
                edited_cols.push(col)
            }
        }
        return edited_cols
    }
    

    function getAllEditedRowsInCol(col) {
        let edited_rows = []
        for (let row = 0; row < matrix.length; row++) {
            if (isEdited(row,col)) {
                edited_rows.push(row)
            }
        }
        return edited_rows
    }

    let current_row = 0+initial_offset
    let current_col = null //this value wont matter because it gets overridden by the first random int, its just init
    let row_mode = true //if false then its in column_mode instead
    //edited_nodes.add(`${current_row},${random_int}`)
    //adding to set AFTER is more efficient if we add it after so we dont have to search for it
    for (let i = 0; i < solution.length; i++) {
        if (row_mode) {
            let random_int = randomInteger(0,matrix[0].length-1,[current_col,...getAllEditedColsInRow(current_row)])
            matrix[current_row][random_int] = solution[i]
            current_col = random_int
            row_mode = false

        } else {//its column mode
            let random_int = randomInteger(0,matrix.length-1,[current_row,...getAllEditedRowsInCol(current_col)])
            matrix[random_int][current_col] = solution[i]
            current_row = random_int
            row_mode = true
            edited_nodes.add(`${random_int},${current_col}`) 
        }
    }   
}


export function generateSolutions(vertical,horizontal) {

    let random_offset = randomInteger(0,1)

    let max_length =  Math.min(vertical,horizontal) + 1

    let easy_length = Math.max(Math.floor(max_length * 0.3) - random_offset, 2);
    let medium_length = Math.floor((max_length+random_offset) * 0.4);
    let hard_length = medium_length + 1 + random_offset * Math.max(Math.floor((max_length- random_offset)/6),1);

    function generateRandomSolution(length) {
        let solution = [];
        for (let i = 0; i < length; i++) {
            solution.push(randomNode());
        }
        return solution;
    }
    let easy_solution = generateRandomSolution(easy_length)
    let medium_solution = generateRandomSolution(medium_length)
    let hard_solution = generateRandomSolution(hard_length)

    if (hard_solution.length == medium_solution.length + 2) {
        let boost_given = false
        if (randomInteger(0,5) != 5) {
            medium_solution[medium_solution.length - 1] = hard_solution[0]
            boost_given = true
        }
        if (randomInteger(0,1) == 0) {
            medium_solution[medium_solution.length - 2] = easy_solution[easy_solution.length - 1];
            boost_given = true
        }
        if (randomInteger(0,5) == 0) {
            //insert easy solution directly into hard solution, not at beginning because thats where medium solution is
            let random_index = randomInteger(1,hard_solution.length-(easy_solution.length-1))
            for (let i = 0; i < easy_solution.length; i++) {
                hard_solution[random_index + i] = easy_solution[i]
            }
            boost_given = true
        }
        if (!boost_given) {
            //subtle boosts to "connect" the solutions making room for some simpler multi-solution paths.
            easy_solution[1] = easy_solution[0]
            medium_solution[medium_solution.length -1] = medium_solution[medium_solution.length - 2]
            hard_solution[Math.floor(hard_solution.length/2)] = hard_solution[Math.floor(hard_solution.length/2) + 1]
            hard_solution[hard_solution.length - 1] = easy_solution[0]
        }

    }
    return {
        "easy": easy_solution,
        "medium": medium_solution,
        "hard": hard_solution
    }
}

// final function to add this all up
export function buildMatrix(vertical,horizontal,inflate=4) {
    //inflate controls how many times the solutions are injected, with a higher number making multiple solutions likely
    //however if the inflate is too high the matrix doesnt look random anymore
    if (inflate <= 0) {
        throw new Error("Invalid inflate value. Please choose a value over 0")
    }
     //just to make sure the random number generator is seeded before we generate the matrix and solutions, so that the solutions are different each time

    let matrix = generateMatrix(vertical,horizontal);
    let solutions = generateSolutions(vertical,horizontal);
    const part = Math.ceil(vertical/3)
    for (let _=0; _ < inflate; _++) {
        injectSolution(matrix,solutions.easy,0);
        injectSolution(matrix,solutions.easy,randomInteger(1,part));
        injectSolution(matrix,solutions.medium,randomInteger(Math.floor(randomInteger(0,2)/2),2*part));
        injectSolution(matrix,solutions.hard,randomInteger(randomInteger(0,1),vertical-1));
    }
    return [matrix,solutions]
}



export function checkForSolution(input_string,solution) {
    if (Array.isArray(solution)) {
        solution = solution.join('')
    } else if (typeof solution !== 'string') {
        throw new Error("Invalid solution format. Please provide a string or an array of strings.")
    }
    return input_string.includes(solution)
}


export function checkforSolutions(input_string,solutions) {
    let results = {}
    for (let difficulty in solutions) {
        results[difficulty] = checkForSolution(input_string,solutions[difficulty])
    }
    return results
}


export function renderMatrix(matrix) {
    const header = document.getElementById('code-matrix-header');
    header.innerHTML = ''; // Clear existing content

    for (let i = 0; i < matrix.length;i++) {
        //row loop
        const row = document.createElement('div')
        row.classList.add('row',"matrix-row")
        row.setAttribute('data-row-div',i)
        
        for (let j = 0; j < matrix[0].length;j++) {
            //column loop
            const cell = document.createElement('div')
            cell.classList.add("col-2","matrix-cell")
            cell.textContent = matrix[i][j]
            cell.setAttribute('data-row',i)
            cell.setAttribute('data-col',j)

            row.appendChild(cell)
        }
        header.appendChild(row)
    }

    //insert side-col cells for extra highlight offset
    const base = document.querySelector('[data-row="0"]:not(.extra-highlight)')
    const height_var = base ? base.getBoundingClientRect().height : 0
    for (let i = 0; i < matrix.length; i++) {
        document.querySelectorAll('.side-matrix-col').forEach(col => {
            const cell = document.createElement('div')
            cell.classList.add("matrix-cell","extra-highlight")
            cell.textContent = ''
            cell.setAttribute('data-row',i)
            cell.style.cssText = `width: 100% !important; height: ${height_var}px !important;`
                col.appendChild(cell)
        })
        
    }
}


