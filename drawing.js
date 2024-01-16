import st from 'gi://St';
import * as main from 'resource:///org/gnome/shell/ui/main.js';

var boxes = [];

export function rect(x, y, width, height) {
    const box = new st.BoxLayout({ style_class: "feedforward" });
    box.x = x;
    box.y = y;
    box.width = width;
    box.height = height;
    boxes.push(box);
}

export function remove_boxes() {
    boxes = [];
}

export function clear_actors() {
    remove_boxes();
}