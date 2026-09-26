#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-container-screen.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// SEVENTH ATTEMPT. Findings so far, kept for the record:
//   1. Hand-placed standalone common.container_item cells crashed on
//      select - fixed by adding "$item_collection_name": "container_items"
//      (required by the game's Bundle-interaction system; every real
//      vanilla container_item extend sets it, ours didn't).
//   2. With that fixed, every hand-placed cell read/wrote the SAME
//      underlying slot regardless of its own collection_index (confirmed
//      live both with collection_index on the cell directly and on a
//      wrapping panel) - collection_index appears to only patch a cell
//      that already exists inside a real, engine-generated grid, not
//      freely sample an arbitrary index into a standalone control.
//   3. A single real native type:"grid" at 90 slots worked correctly for
//      exactly its first 30 slots and no more - container_type "horse"
//      has a real, undocumented client-side interaction ceiling there,
//      matching AC's own real production inventory_size (30) exactly.
//   4. Checked furnace_screen.json's real, individually-positioned
//      ingredient/fuel/output slots for a working non-grid precedent:
//      they use NO collection_index at all - each gets its own uniquely
//      named collection ($item_collection_name: "furnace_ingredient_items"
//      etc.), which only works because the engine natively exposes those
//      specific named single-item collections for a furnace. There's no
//      equivalent per-index naming for a generic numbered inventory - only
//      "container_items" exists for that.
//
// THIS ATTEMPT: three real, native type:"grid" elements (not hand-placed
// cells - actual grids are the one confirmed-safe interactive mechanism),
// each given its own distinct collection_name, testing directly whether
// that's the missing piece rather than assuming furnace's mechanism
// doesn't generalize. Real risk: a name other than "container_items" may
// not be populated by the engine at all for a generic inventory, in which
// case those sections render but stay empty - worth knowing either way.
//
// Two other hard constraints from earlier attempts still apply: container_type
// is a fixed 7-value enum with no "use my own screen" option, and
// per-instance content swapping is confirmed impossible - so this still
// replaces horse_screen.json unconditionally, for every container_type
// "horse" entity including real horses/donkeys/mules/llamas. equip_panel
// and horse_renderer are kept at their real original offsets.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three sections
const START_X = 79, START_Y = 18; // clears equip_panel/horse_renderer to the left

// [label, columns, rows, collectionName]
const SECTIONS = [
    ["A", 1, 4, "container_items"],        // the real, engine-populated collection
    ["B", 6, 5, "container_items_b"],      // experiment: a made-up second collection
    ["C", 5, 6, "container_items_c"],      // experiment: a made-up third collection
];

const allItemDefs = {};
let x = START_X;
for (const [label, cols, , collectionName] of SECTIONS) {
    allItemDefs[`oc_grid_item_${label}@common.container_item`] = { "$item_collection_name": collectionName };
    x += cols * CELL + GAP;
}
const panelWidth = x - GAP + 7;
const maxGridHeight = Math.max(...SECTIONS.map(([, , rows]) => rows * CELL));
const bottomHalfY = START_Y + maxGridHeight + 12;
const rootHeight = bottomHalfY + 90 + 40; // grids + player inv block + hotbar/margin

const doc = {
    namespace: "horse",

    ...allItemDefs,

    oc_panel: {
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
                        ...SECTIONS.map((section, i) => {
                            const [label, cols, rows, collectionName] = section;
                            const offsetX = START_X + SECTIONS.slice(0, i).reduce((acc, [, c]) => acc + c * CELL + GAP, 0);
                            return {
                                [`grid_${label}`]: {
                                    type: "grid",
                                    anchor_from: "top_left", anchor_to: "top_left",
                                    size: [cols * CELL, rows * CELL],
                                    offset: [offsetX, START_Y],
                                    grid_dimensions: [cols, rows],
                                    grid_item_template: `horse.oc_grid_item_${label}`,
                                    collection_name: collectionName,
                                },
                            };
                        }),
                        { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": { offset: [0, bottomHalfY] } },
                        { "hotbar_grid_template@common.hotbar_grid_template": {} },
                        { "inventory_selected_icon_button@common.inventory_selected_icon_button": {} },
                        { "gamepad_cursor@common.gamepad_cursor_button": {} },
                    ],
                },
            },
            { "flying_item_renderer@common.flying_item_renderer": { layer: 10 } },
        ],
    },

    "horse_screen@common.inventory_screen_common": {
        "$close_on_player_hurt|default": false,
        close_on_player_hurt: "$close_on_player_hurt",
        variables: [
            { requires: "true", "$screen_content": "horse.oc_panel" },
        ],
    },
};

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`Sections: ${SECTIONS.map(([l, c, r, n]) => `${l}=${c}x${r} (${n})`).join(", ")}`);
console.log(`Panel size: ${panelWidth}x${rootHeight}`);
