#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-triplegrid-spike.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// THIRD ATTEMPT, and the one that's actually landing. Two real, hard
// constraints, both confirmed empirically rather than assumed:
//   - Bedrock's minecraft:inventory component has a fixed, closed
//     container_type enum (horse/minecart_chest/chest_boat/minecart_hopper/
//     inventory/container/hopper) with no "use my own screen" option -
//     confirmed against the complete, current Microsoft Learn property
//     list. Whichever one an entity uses picks one specific vanilla screen
//     file; there's no eighth option.
//   - $container_title (and every per-instance value tried) isn't
//     populated yet at the point common.inventory_screen_common decides
//     $screen_content, so a shared screen's content can't be conditionally
//     swapped per-entity at all - proven with a "requires: true" test that
//     DID render, applying identically to every real chest in the game.
//
// Conclusion: the only way to get a genuinely custom, multi-section layout
// is to replace horse_screen.json's content unconditionally. This also
// applies to every real horse/donkey/mule/llama - a real, accepted
// tradeoff, not an oversight. equip_panel and horse_renderer (real
// horses' saddle/armor slots and live 3D model) are kept, at their real
// original offsets, so real horses keep as much of their normal
// functionality as this layout allows; our own satchel entity just never
// populates those slots since it has none of the components they read
// from.
//
// THE ACTUAL ITEM-PLACEMENT CRASH, found via Content Log (not a layout or
// size problem - a real native "requires: true" grid crashed identically
// to hand-placed cells, and even AC's own already-shipped horse-type
// character inventory crashed too, since this file's unconditional
// replacement now governs every container_type "horse" entity in the
// game): "Expected variable not found in ancestor tree: '$item_collection_name'".
// Real vanilla always sets $item_collection_name alongside
// common.container_item (see chest_screen.json's own
// "chest_grid_item@common.container_item": {"$item_collection_name":
// "container_items"}) - it's required by the game's Bundle-interaction
// system (checking whether a selected item is a Bundle, to show its open/
// close icons), and omitting it faults instead of failing gracefully the
// moment a player actually selects an item. Every common.container_item
// extend below now sets it.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three sections
const START_X = 79, START_Y = 18; // matches horse_panel's own real inv_panel offset - clears equip_panel/horse_renderer to its left

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
        // collection_index establishes a scope that descendant BINDINGS
        // read from - setting it directly on the same control as
        // common.container_item doesn't work (every cell ends up reading
        // the same data, confirmed live). It has to sit on a plain
        // wrapping panel, with the actual item-rendering content nested
        // inside as a child, exactly like this project's own compiler
        // already does elsewhere (compile.js's indexed()/gated()) and like
        // a real type:"grid" does natively per-cell.
        cells.push({
            [`oc_cell_${label}_${i}`]: {
                type: "panel",
                anchor_from: "top_left",
                anchor_to: "top_left",
                offset: [offsetX + col * CELL, START_Y + row * CELL],
                collection_name: "container_items",
                collection_index: startIndex + i,
                controls: [
                    { [`item@common.container_item`]: { "$item_collection_name": "container_items" } },
                ],
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
const panelWidth = x - GAP + 7;
const gridHeight = Math.max(...SECTIONS.map(([, cols, count]) => Math.ceil(count / cols) * CELL));
const rootHeight = START_Y + gridHeight + 12 + 90 + 40; // grids + label offset + player inv block + hotbar/margin

const doc = {
    namespace: "horse",

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
                        { "common_panel@common.common_panel": { size: [panelWidth, rootHeight] } },
                        { "horse_section_label@horse.horse_label": {} },
                        { "equipment@horse.equip_panel": { offset: [7, 18] } },
                        { "renderer@horse.horse_renderer": { offset: [25, 18] } },
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

    // A full redefinition (not modifications) - the actual decision:
    // always show our own custom panel, on every container_type "horse"
    // entity, real horses included, since there's no way to swap content
    // per-instance. $close_on_player_hurt kept at horse_screen's own real
    // default (false) rather than chest's (true).
    "horse_screen@common.inventory_screen_common": {
        "$close_on_player_hurt|default": false,
        close_on_player_hurt: "$close_on_player_hurt",
        variables: [
            { requires: "true", "$screen_content": "horse.oc_triplegrid_panel" },
        ],
    },
};

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`Sections: ${SECTIONS.map(([l, c, n]) => `${l}=${n} slots (${c} wide)`).join(", ")}`);
console.log(`Total slots used: ${totalSlots} (container entity must have inventory_size >= ${totalSlots})`);
console.log(`Panel size: ${panelWidth}x${rootHeight}`);
