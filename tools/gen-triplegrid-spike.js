#!/usr/bin/env node
// DIAGNOSTIC SPIKE generator - produces rp/ui/chest_screen.json's three-grid
// test layout. Not part of the normal build; run by hand
// (`node tools/gen-triplegrid-spike.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// Why generated rather than hand-written: a real vanilla `type:"grid"`
// always numbers its own cells starting at index 0 of whatever
// collection_name it's bound to - it has no "start at index N" property
// (confirmed against the Bedrock Wiki's own Grid property list). So three
// grids sharing one container's "container_items" collection can't use
// three native <grid> elements; each cell has to be placed by hand as its
// own common.container_item instance with an explicit collection_index,
// laid out in a normal row/column pattern ourselves. That's exactly the
// single-button trick from the earlier container-button spike, just
// repeated for every slot instead of once - hence generating it instead
// of authoring 84 near-identical entries by hand.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three sections
const START_X = 7, START_Y = 9; // matches vanilla's own grid offset convention

// [label, columns, slotCount]
const SECTIONS = [
    ["A", 1, 4],   // 1x4 vertical strip
    ["B", 9, 54],  // double chest
    ["C", 9, 26],  // a plain 26-slot block
];

function sectionCells(section, startIndex, offsetX) {
    const [label, cols, count] = section;
    const cells = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols), col = i % cols;
        // A direct extend of common.container_item, exactly like the
        // earlier single-button spike's widget - not container_item
        // wrapped inside another input_panel, which would just add a
        // redundant, possibly click-intercepting layer on top of a
        // control that's already a real input_panel itself.
        cells.push({
            [`oc_cell_${label}_${i}@common.container_item`]: {
                anchor_from: "top_left",
                anchor_to: "top_left",
                collection_name: "container_items",
                collection_index: startIndex + i,
                offset: [offsetX + col * CELL, START_Y + row * CELL],
            },
        });
    }
    return cells;
}

let index = 0, x = START_X;
const allCells = [];
let widths = [];
for (const section of SECTIONS) {
    const [, cols, count] = section;
    allCells.push(...sectionCells(section, index, x));
    index += count;
    const w = cols * CELL;
    widths.push(w);
    x += w + GAP;
}
const totalSlots = index;
const panelWidth = x - GAP + START_X;
const gridHeight = Math.max(...SECTIONS.map(([, cols, count]) => Math.ceil(count / cols) * CELL));
const topHalfHeight = START_Y + gridHeight + 10;
const rootHeight = topHalfHeight + 12 + 90 + 40; // top half + label offset + player inv block + hotbar/margin

const doc = {
    namespace: "chest",

    oc_triplegrid_top_half: {
        type: "panel",
        size: ["100%", topHalfHeight],
        offset: [0, 12],
        anchor_to: "top_left",
        anchor_from: "top_left",
        controls: [
            { "chest_label@chest.chest_label": {} },
            ...allCells,
        ],
    },

    "oc_triplegrid_root_panel@common.root_panel": {
        size: [panelWidth, rootHeight],
        layer: 1,
        controls: [
            { "common_panel@common.common_panel": { size: [panelWidth, rootHeight] } },
            {
                chest_panel: {
                    type: "panel",
                    layer: 5,
                    controls: [
                        { "small_chest_panel_top_half@chest.oc_triplegrid_top_half": {} },
                        { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": { offset: [0, topHalfHeight + 12] } },
                        { "hotbar_grid@common.hotbar_grid_template": {} },
                        { "inventory_take_progress_icon_button@common.inventory_take_progress_icon_button": {} },
                        { "flying_item_renderer@common.flying_item_renderer": { layer: 15 } },
                    ],
                },
            },
            { "inventory_selected_icon_button@common.inventory_selected_icon_button": {} },
            { "gamepad_cursor@common.gamepad_cursor_button": {} },
        ],
    },

    oc_triplegrid_panel: {
        type: "panel",
        controls: [
            { "container_gamepad_helpers@common.container_gamepad_helpers": {} },
            { "selected_item_details_factory@common.selected_item_details_factory": {} },
            { "item_lock_notification_factory@common.item_lock_notification_factory": {} },
            { "root_panel@chest.oc_triplegrid_root_panel": {} },
        ],
    },

    // Patched on BOTH small_chest_screen and large_chest_screen: the first
    // attempt only patched small_chest_screen and it silently never
    // applied (no error anywhere - Content Log was completely clean) for
    // a 90-slot container. The working theory is a container past the
    // small chest's native 27-slot range routes through large_chest_screen
    // instead, so patching only one of the two is a real bug, not a
    // one-off fluke - covering both means the swap fires regardless of
    // which one actually governs a given inventory_size.
    small_chest_screen: {
        modifications: [
            {
                array_name: "variables",
                operation: "insert_front",
                value: [
                    {
                        requires: "($container_title = 'oc_triplegrid')",
                        "$screen_content": "chest.oc_triplegrid_panel",
                    },
                ],
            },
        ],
    },
    large_chest_screen: {
        modifications: [
            {
                array_name: "variables",
                operation: "insert_front",
                value: [
                    {
                        requires: "($container_title = 'oc_triplegrid')",
                        "$screen_content": "chest.oc_triplegrid_panel",
                    },
                ],
            },
        ],
    },
};

const outPath = path.join(__dirname, "..", "rp", "ui", "chest_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`Sections: ${SECTIONS.map(([l, c, n]) => `${l}=${n} slots (${c} wide)`).join(", ")}`);
console.log(`Total slots used: ${totalSlots} (container entity must have inventory_size >= ${totalSlots})`);
console.log(`Panel size: ${panelWidth}x${rootHeight}`);
