const extension = imports.misc.extensionUtils.getCurrentExtension();
const enums = extension.imports.enums;
const windowing = extension.imports.windowing;

/* Tilegroup class
    Every window has a tilegroup.
    Windows in a tilegroup can only travel horizontally, and every window has a child tilegroup.
    The algorithm will run through them all recursively to determine the best place for a window.
*/

class Tilegroup {
    constructor(max_width, max_height, root, x, y, id) {
        this.windows = [];
        this.x = x;
        this.y = y;
        this.width = 0;
        this.height = 0;
        this.max_width = max_width;
        this.max_height = max_height;
        this.root = root;
        if(!this.root)
            this.root = this;
        this.id = id + 1;
    }
    check_fit(window) {
        if(this.width + enums.window_spacing + window.width > this.max_width ||
            window.height > this.max_height)
            return false;
        return true
    }
    get_new_area(window) {
        return Math.max(this.x + enums.window_spacing + window.width, this.root.width) * Math.max(this.y + enums.window_spacing + window.height, this.root.height);
    }
    get_optimal(window) {
        let minimum_area = this.get_new_area(window);
        if(!this.check_fit(window)) // If the window will exceed tilegroup bounds, force it to go to a subgroup
            minimum_area = Infinity;
        let target_window = null;
        for(let _window of this.windows) {
            if(!_window.subgroup.check_fit(window))
                continue;
            // See if placing the window under is better
            let area = _window.subgroup.get_new_area(window);
            let optimal = _window.subgroup.get_optimal(window).area; // Check if it is better to use the subgroup
            if(optimal && optimal < area && optimal !== Infinity)
                area = optimal;
            if(area < minimum_area) {
                minimum_area = area;
                target_window = _window;
            }
        }
        return {
            area: minimum_area,
            window: target_window
        }
    }
    add_window(window) {
        let optimal = this.get_optimal(window);
        if(optimal.area === Infinity) {
            // If window cannot fit at all, return null
            return null;
        }
        if(optimal.window === null) {
            // Add window to the side
            window.subgroup = new Tilegroup(window.width, window.height, this.root, this.x + this.width + enums.window_spacing, this.y + window.height + enums.window_spacing, this.id);
            this.windows.push(window);
            this.width += window.width;
            this.height = Math.max(this.height, window.height);
            this.root.width = Math.max(this.root.width, this.x + window.width);
            this.root.height = Math.max(this.root.height, this.y + window.height);
            return;
        }
        optimal.window.subgroup.add_window(window);
    }
    get_width() {
        let width = 0;
        for(let window of this.windows)
            width += window.width;
        return width;
    }
    get_height(window) {
        // Get total window height
        let height = window.height;
        let max_height = 0;
        for(let _window of window.subgroup.windows) {
            let _height = this.get_height(_window);
            max_height = Math.max(_height, max_height);
        }
        height += max_height;
        return height;
    }
    draw_windows(meta_windows, offset, x_offset) {
        let x = 0;
        for(let window of this.windows) {
            let _offset = offset;
            if(!offset)
                _offset = (this.max_height / 2) - (this.get_height(window) / 2);
            windowing.move_window(meta_windows[window.index], false, Math.round(this.x + x + x_offset), Math.round(this.y + _offset), window.width, window.height); // Draw initial window
            window.subgroup.draw_windows(meta_windows, _offset, x_offset);
            x += window.width + enums.window_spacing;
        }
    }
    get_center_offset(x, y) {
        return {
            x: ((this.max_width) / 2) - (this.width / 2) + x,
            y: ((this.max_height) / 2) - (this.height / 2) + y,
        }
    }
}

function window_descriptor(window, index) {
    let frame = window.get_frame_rect();

    this.index = index;
    this.x = frame.x;
    this.y = frame.y;
    this.width = frame.width;
    this.height = frame.height;
    this.total_height = frame.height;
    this.total_width = frame.width;
    this.maximized_horizontally = window.maximized_horizontally;
    this.maximized_vertically = window.maximized_vertically;
    this.vertical_children = true;
}

function add_windows(tilegroup, windows, meta_windows, new_window) {
    for(let window of windows) {
        let status = tilegroup.add_window(window);
        if(status === null && get_all_workspace_windows().length > 1) {
            if(new_window) {
                /* For windows that cannot fit, we move the new window (if applicable) to a new workspace
                    and focus it.
                */
                let workspace = windowing.win_to_new_workspace(new_window, false);
                let new_windows = windows;
                for(let i = 0; i < new_windows.length; i++) {
                    if(meta_windows[new_windows[i].index].get_id() === new_window.get_id()) {
                        new_windows.splice(i, 1);
                        break;
                    }
                }
                new_windows.sort((a, b) => b.width - a.width);
                tilegroup.windows = [];
                add_windows(tilegroup, new_windows, meta_windows, false);
                workspace.activate(0);
            } else {
                // TODO: Define behavior for windows that are resized but cannot fit
            }
        }
    }
}

function sort_workspace_windows(workspace, move_maximized_windows) {
    let meta_windows = workspace.list_windows();

    // Put needed window info into an enum so it can be transferred between arrays
    let window_descriptors = [];
    for(let i = 0; i < meta_windows.length; i++) {
        let window = meta_windows[i];
        // Check if the window is maximized, and move it over if it is
        if((window.maximized_horizontally === true && window.maximized_vertically === true) && get_all_workspace_windows().length !== 1) {
            if(move_maximized_windows) // If we are wanting to deal with maximized windows, move them to a new workspace.
                win_to_new_workspace(window, false);
            continue; // Skip windows that are maximized otherwise. They will be dealt with by the size-changed listener.
        }
        window_descriptors.push(new window_descriptor(window, i));
    }
    // Advanced sorter
    let windows = [];
    const advanced_sorter = false;
    if(advanced_sorter) {
        let vertical = false;
        while(window_descriptors.length > 0) {
            let window;
            let index;
            if(vertical) {
                // Get tallest unused window
                let max = 0;
                for(let i = 0; i < window_descriptors.length; i++) {
                    let _window = window_descriptors[i];
                    if(_window.height > max) {
                        max = _window.height;
                        index = i;
                        window = _window;
                    }
                }
                vertical = false;
            } else {
                // Get longest unused window
                let max = 0;
                for(let i = 0; i < window_descriptors.length; i++) {
                    let _window = window_descriptors[i];
                    if(_window.width > max) {
                        max = _window.width;
                        index = i;
                        window = _window;
                    }
                }
                vertical = true;
            }
            windows.push(window);
            window_descriptors.splice(index, 1);
        }
    } else {
        windows = window_descriptors.sort((a, b) => b.width - a.width);
    }

    let n_displays = global.display.get_n_monitors(); // Sort on all monitors
    for(let i = 0; i < n_displays; i++) {
        let work_area = workspace.get_work_area_for_monitor(i);
        // Check for snap tiled windows and adjust work area accordingly
        for(let i = 0; i < windows.length; i++) {
            let window = windows[i];
            if(window.maximized_horizontally === false && window.maximized_vertically === true && windows.length !== 1) {
                let spaced_width = window.width + enums.window_spacing;
                if(window.x + window.width === work_area.width)
                    work_area.width -= spaced_width;
                if(window.x === work_area.x) {
                    work_area.x += spaced_width;
                    work_area.width -= spaced_width;
                }
                windows.splice(i, 1);
                i--;
            }
        }
        let top_bar_height = global.display.get_monitor_geometry(i).height - work_area.height;
        let root_wingroup = new Tilegroup(work_area.width, work_area.height, false, 0, top_bar_height, -1);
        root_wingroup.add_windows(windows, meta_windows, workspace.index() === get_workspace().index());
        root_wingroup.draw_windows(meta_windows, false, root_wingroup.get_center_offset(work_area.x, work_area.y).x);
    }
}