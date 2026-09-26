#!/usr/bin/env node
// DIAGNOSTIC SPIKE generator - produces rp/ui/horse_screen.json's three-grid
// test layout. Not part of the normal build; run by hand
// (`node tools/gen-triplegrid-spike.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// SECOND ATTEMPT - the first one targeted chest_screen.json's
// small_chest_screen/large_chest_screen and silently never applied for a
// 90-slot container, with zero Content Log errors either time. Working
// theory, per real prior experience with this exact problem elsewhere:
// container_type "container" entities may not route through
// small_chest_screen/large_chest_screen at all - those may be reserved for
// real chest/ender-chest/shulker/barrel *blocks*. container_type "horse"
// entities have their own screen (horse_screen.json) with a genuinely
// different, size-agnostic mechanism: horse.inv_grid reads its own
// dimensions from a real binding (#inv_grid_dimensions) instead of a
// hardcoded grid_dimensions, so it isn't split into a small/large duality
// at all - confirmed by reading Mojang's own bedrock-samples horse_screen.json.
//
// Still generating the three hand-placed blocks rather than relying on
// inv_grid's own auto-sizing, since the actual ask is three visually
// separate sections sharing one collection, not one auto-sized grid -
// same "a real type:grid always numbers its own cells from index 0, so
// only one of several sections on one collection could ever use it"
// constraint as before.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three sections
const START_X = 7, START_Y = 18; // matches horse_panel's own inv_panel offset convention

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
for (const section of SECTIONS) {
    const [, cols, count] = section;
    allCells.push(...sectionCells(section, index, x));
    index += count;
    x += cols * CELL + GAP;
}
const totalSlots = index;
const panelWidth = x - GAP + START_X;
const gridHeight = Math.max(...SECTIONS.map(([, cols, count]) => Math.ceil(count / cols) * CELL));
const rootHeight = START_Y + gridHeight + 12 + 90 + 40; // grids + label offset + player inv block + hotbar/margin

const doc = {
    namespace: "horse",

    // Everything horse_panel's own siblings need (equip_panel, the horse
    // renderer) is dropped - our satchel entity is not a real horse and
    // has none of the components those read from. Only the pieces every
    // container screen needs (gamepad helpers, item details/lock
    // notifications, the player's own inventory + hotbar) are kept,
    // copied from horse_panel's real structure.
    oc_triplegrid_panel: {
        type: "panel",
        controls: [
            { "container_gamepad_helpers@common.container_gamepad_helpers": {} },
            { "selected_item_details_factory@common.selected_item_details_factory": {} },
            { "item_lock_notification_factory@common.item_lock_notification_factory": {} },
            {
                "root_panel@common.root_panel": {
                    size: [panelWidth, rootHeight],
                    layer: 1,
                    controls: [
                        { "common_panel@common.common_panel": { "$use_compact_close_button": true, size: [panelWidth, rootHeight] } },
                        { "horse_section_label@horse.horse_label": {} },
                        ...allCells,
                        { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": { offset: [0, START_Y + gridHeight + 12] } },
                        { "hotbar_grid_template@common.hotbar_grid_template": {} },
                        { "inventory_selected_icon_button@common.inventory_selected_icon_button": {} },
                        { "gamepad_cursor@common.gamepad_cursor_button": {} },
                    ],
                },
            },
            { "flying_item_renderer@common.flying_item_renderer": { layer: 10 } },
        ],
    },

    horse_screen: {
        modifications: [
            {
                array_name: "variables",
                operation: "insert_front",
                value: [
                    {
                        requires: "($container_title = 'oc_triplegrid')",
                        "$screen_content": "horse.oc_triplegrid_panel",
                    },
                ],
            },
        ],
    },
};

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`Sections: ${SECTIONS.map(([l, c, n]) => `${l}=${n} slots (${c} wide)`).join(", ")}`);
console.log(`Total slots used: ${totalSlots} (container entity must have inventory_size >= ${totalSlots})`);
console.log(`Panel size: ${panelWidth}x${rootHeight}`);
