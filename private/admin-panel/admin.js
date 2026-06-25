const LOCATIONS = {
    Overview: [
        "Dashboard",
        "Monitor"],

    Players: [
        "All users",
        "Banlist"],

    Single_Player: [
        "Active Backends",
        "Logs",
        "Server config",
        "Server Controls"],

    Multi_Player: [
        "Active Backends",
        "Logs",
        "Server config",
        "Server Controls"],

    System: [
        "Database",
        "Terminal",
        "Logs",
        "Controls"
    ]
}


const example_location = {
    group: "Players",
    item: "All users"
}

class PanelFrame {

    constructor() {
        this.focusMode = true;  
        this.windows = []; //focusMode: only one window, otherwise multiple windows
        this.defaultWindowWidth = window.innerWidth / 1.5;
        this.defaultWindowHeight = window.innerHeight / 1.75;
        this.pixelOffset = (window.innerWidth - this.defaultWindowWidth) / Object.values(LOCATIONS).flat().length; //window staircase gap

        document.documentElement.style.setProperty('--default-window-width', `${this.defaultWindowWidth}px`);
        document.documentElement.style.setProperty('--default-window-height', `${this.defaultWindowHeight}px`);
    }

    addWindow(location) {
        if (this.focusMode) {
            this.windows = [new panel_window(location)];
        } else {
            //no duplicates allowed
            const potentialExistingWindow = this.windows.findIndex(win => win.location.group === location.group && win.location.item === location.item)
            const existingWindow = potentialExistingWindow !== -1 ? potentialExistingWindow : false;
            if (existingWindow) {
                //move to top(array.length)instead of adding a new window
                const window_obj = this.windows.splice(existingWindow, 1);
                this.windows.push(window_obj[0]);
            } else {
                this.windows.push(new panel_window(location));
            }
        }
        this.renderWindows();
    }

    removeWindow(location) {
        if (this.focusMode) {
            this.windows = [];
        } else {
            this.windows = this.windows.filter(win => win.location.group !== location.group || win.location.item !== location.item);
        }
        this.renderWindows();
    }


    focusWindow(location) {
        this.focusMode = true;
        //remove all other windows except the one with this location
        this.windows = [new panel_window(location)];
        this.renderWindows();
    }

    renderWindows() {
        //unrender all windows first
        document.querySelectorAll('.window').forEach(window_obj => {
            window_obj.style.zIndex = -1;
            document.getElementById('window-container').appendChild(window_obj); //move to inactive storage
        })

        for (let i = 0; i < this.windows.length; i++) {
            const window_obj = this.windows[i];
            //render the window with the location and z_index
            //z_index is the index in the array, so the last window will be on top
            window_obj.render(i);
        }
    }

    resetWindowPositions() {
        const windows_arr = document.querySelectorAll('.window');
        for (let i = 0; i < windows_arr.length; i++) {
            const windowElement = windows_arr[i];
            const PIXEL_OFFSET = Frame.pixelOffset; // window staircase gap
            if (windowElement) {
                const offset = i * PIXEL_OFFSET;
                const total = (windows_arr.length-1) * PIXEL_OFFSET;
                windowElement.style.left = (window.innerWidth-total) / 3 + offset + 'px';
                windowElement.style.top = (window.innerHeight-total) / 3 + offset + 'px';
            } 
        }
    }
}


class panel_window {
    //plan:

    // whenever a dropdown item is clicked
    // 1. if focusMode, then replace the focused window location with this new location
    //2 if not focusMode, open a new window instance with this new location
    constructor(location) {
        this.location = location;
    }

    render(index) {
        const windowElement = document.querySelector(`.window[location_group=\"${this.location.group}\"][location_item=\"${this.location.item}\"]`);
        if (!windowElement) {
            console.error(`Window element not found for location: ${this.location.group} - ${this.location.item}`);
            return;
        }
        //show window for that location
        windowElement.style.zIndex = index + 1; //set z-index based on index
        document.body.appendChild(windowElement); //move to end of body to ensure it's on top
        //no need to set display, since the hide effect comes from its parent container for inactive storage.
    }

    unrender() {
        const windowElement = document.querySelector(`.window[location_group=\"${this.location.group}\"][location_item=\"${this.location.item}\"]`);
        if (!windowElement) {
            console.error(`Window element not found for location: ${this.location.group} - ${this.location.item}`);
            return;
        }
        //hide window for that location
        windowElement.style.zIndex = -1;
        document.getElementById('window-container').appendChild(windowElement); //move to inactive storage
    }
}


const Frame = new PanelFrame(); //only one necessary
Frame.resetWindowPositions();
createDropdownItems();

document.getElementById('dropdown-logo-top').addEventListener('click', (event) => {
    const dropdown = document.getElementById('admin-dropdown-box');
    if (!dropdown) return;
    const dropdown_attr = dropdown.getAttribute('closed')
    if (dropdown_attr != null) {
        dropdown.removeAttribute('closed')
        //open it
        openDropdown()
    } else {
        //close it
        dropdown.setAttribute('closed', '')
        closeDropdown()
    }
})


document.querySelectorAll('.window').forEach(window_obj => {



    window_obj.addEventListener('pointerdown', (event) => {

        //bring this window to the front by setting its z-index to the highest value
        const windows = document.querySelectorAll('.window');

        //remove the window being dragged
        Frame.windows = Frame.windows.filter(win => !(win.location.group === window_obj.getAttribute('location_group') && win.location.item === window_obj.getAttribute('location_item')))

        //add it to the end of the array
        Frame.windows.push(new panel_window({ group: window_obj.getAttribute('location_group'), item: window_obj.getAttribute('location_item') }))

        //re-render all windows
        Frame.renderWindows()
    })

    const window_nav = window_obj.querySelector('.window-nav');

    let dragging = false;
    let original_x = 0;
    let original_y = 0;


    window_nav.addEventListener('pointerdown', (e) => { //drag only applies if user is clicking on the nav bar of the window, not the entire window
        dragging = true;
        original_x = e.clientX
        original_y = e.clientY
        e.preventDefault();

    });
    document.addEventListener('pointermove', (e) => {
        if (dragging) {
            const dx = e.clientX - original_x;
            const dy = e.clientY - original_y;
            const current_left = parseInt(window_obj.style.left || 0, 10);
            const current_top = parseInt(window_obj.style.top || 0, 10);
            window_obj.style.left = `${current_left + dx}px`;
            window_obj.style.top = `${current_top + dy}px`;
            original_x = e.clientX;
            original_y = e.clientY;
        }
    });

    document.addEventListener('pointerup', () => {
        dragging = false;
    });
})


function closeDropdown() {
    const dropdown = document.getElementById('admin-dropdown-box');
    if (dropdown) {
        const TIMEOUT_DURATION = 300;
        dropdown.style.transition = `transform 0.3s ease`;
        dropdown.style.transformOrigin = 'center top'
        dropdown.style.transform = 'scaleY(0)';
    }
}

function openDropdown() {
    const dropdown = document.getElementById('admin-dropdown-box');
    if (dropdown) {
        const TIMEOUT_DURATION = 300;
        dropdown.style.transition = `transform 0.3s ease`;
        dropdown.style.transformOrigin = 'center top'
        dropdown.style.transform = 'scaleY(1)'
    }
}


document.querySelectorAll('.admin-dropdown-item').forEach(item => {


    item.addEventListener('click', (event) => {
        if (event.target.classList.contains('admin-dropdown-item-popup-menu-option')) { return; }
        item.setAttribute('focused', '')
        if (Frame.focusMode) {
            document.querySelectorAll('.admin-dropdown-item').forEach(i => {
                if (i !== item) {
                    i.removeAttribute('focused')
                }
            })
            Frame.focusWindow({ group: item.getAttribute('location_group'), item: item.getAttribute('location_item') })
        } else {
            Frame.addWindow({ group: item.getAttribute('location_group'), item: item.getAttribute('location_item') })
        }
    })

    item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        // pop up a menu with 3 options:
        // 1. focus window
        // 2. open new window
        // 3. close window (only if its open)
        createItemPopupMenu({ group: item.getAttribute('location_group'), item: item.getAttribute('location_item') }, item)

    })
})

function createItemPopupMenu(location, item_element) {

    //delete any existing popup menus
    const existingMenus = document.querySelectorAll('#admin-dropdown-item-popup-menu');
    existingMenus.forEach(menu => menu.remove());

    // check if its already open
    const alreadyExists = Frame.windows.some(win => win.location.group === location.group && win.location.item === location.item)

    // create a popup menu with 3 options

    const popupMenu = document.createElement('div');
    popupMenu.id = 'admin-dropdown-item-popup-menu';

    const focusWindowOption = document.createElement('div');
    focusWindowOption.classList.add('admin-dropdown-item-popup-menu-option');
    focusWindowOption.textContent = 'Focus Window';
    focusWindowOption.addEventListener('click', () => {
        // focus the window with this location
        item_element.setAttribute('focused', '')
        document.querySelectorAll('.admin-dropdown-item').forEach(i => {
            if (i !== item_element) {
                i.removeAttribute('focused')
            }
        })//clear all other focused items
        Frame.focusWindow(location); //handles the rest of the logic
        popupMenu.remove();
    });

    const openNewWindowOption = document.createElement('div');
    openNewWindowOption.classList.add('admin-dropdown-item-popup-menu-option');
    openNewWindowOption.textContent = 'Open New Window';
    openNewWindowOption.addEventListener('click', () => {
        if (Frame.focusMode) {
            //check if this is the one thats currently open, if so do nothing
            const currentWindow = Frame.windows[0];
            if (currentWindow && currentWindow.location.group === location.group && currentWindow.location.item === location.item) {
                popupMenu.remove();
                return;
            }
        }
        item_element.setAttribute('focused', '')
        Frame.focusMode = false;
        Frame.addWindow(location);
        // open a new window with this location
        popupMenu.remove();
    });

    const closeWindowOption = document.createElement('div');
    closeWindowOption.classList.add('admin-dropdown-item-popup-menu-option');
    closeWindowOption.textContent = 'Close Window';
    closeWindowOption.addEventListener('click', () => {
        // close the window with this location
        item_element.removeAttribute('focused')
        Frame.removeWindow(location);
        popupMenu.remove();
    });

    popupMenu.appendChild(focusWindowOption);
    popupMenu.appendChild(openNewWindowOption);

    if (alreadyExists) {
        popupMenu.appendChild(closeWindowOption);
    }

    // append popup menu to the item that was right clicked
    item_element.appendChild(popupMenu);
}


function deleteAllItemPopupMenus() {
    const existingMenus = document.querySelectorAll('#admin-dropdown-item-popup-menu');
    existingMenus.forEach(menu => menu.remove());
}

document.addEventListener('click', (event) => {
    // if the click is not on a dropdown item, delete all popup menus
    if (!event.target.closest('.admin-dropdown-item')) {
        deleteAllItemPopupMenus();
    }
})


function createDropdownItems() {
    const container_box = document.getElementById('admin-dropdown-box');
    for (const [group, items] of Object.entries(LOCATIONS)) {
        const group_div = document.createElement('div');
        group_div.classList.add('admin-dropdown-group');

        const h2 = document.createElement('h2');
        h2.textContent = group;
        h2.classList.add('admin-dropdown-group-header');
        group_div.appendChild(h2);

        for (const item of Object.values(items)) {
            const dropdown_item = document.createElement('div');
            dropdown_item.classList.add('admin-dropdown-item');
            dropdown_item.setAttribute('location_group', group);
            dropdown_item.setAttribute('location_item', item);

            const text_span = document.createElement('span');
            text_span.textContent = item;
            dropdown_item.appendChild(text_span);

            group_div.appendChild(dropdown_item);
        };
        container_box.appendChild(group_div);
    };
};




