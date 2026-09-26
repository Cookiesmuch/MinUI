#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-container-screen.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// FIFTH ATTEMPT. What earlier attempts got wrong, in order:
//   1. Hand-placed standalone common.container_item cells (one per slot,
//      each given its own collection_index) rendered correctly but
//      crashed the client the instant an item was placed - later found to
//      be a missing "$item_collection_name" variable (required by the
//      game's Bundle-interaction system), NOT a layout or size problem
//      (confirmed via Content Log: "Expected variable not found in
//      ancestor tree: '$item_collection_name'"). This also explained why
//      even AC's own already-shipped horse-type character crashed too -
//      this file's unconditional replacement governs every container_type
//      "horse" entity in the game once loaded, AC's included.
//   2. After adding that variable, hand-placed cells stopped crashing but
//      EVERY cell read/wrote the SAME underlying slot, confirmed live
//      (placing one item filled every cell; taking one emptied all of
//      them) - tried moving collection_index onto a wrapping panel
//      instead of the container_item control itself, matching this
//      project's own compile.js indexed()/gated() pattern - same bug,
//      unchanged.
//   3. Conclusion, re-reading the Bedrock Wiki's own wording on
//      collection_index more carefully ("this ALSO allows to modify
//      specific grid items of a HARDCODED grid"): collection_index is for
//      PATCHING a cell that already exists inside a real, engine-generated
//      grid - not for freely sampling an arbitrary index into a
//      standalone control. There's no working way to hand-place several
//      independently-indexed cells outside a real type:"grid" at all.
//
// So this drops the "three differently-shaped blocks" idea (unreachable
// without an unsafe technique) in favor of exactly ONE real, native
// type:"grid" - the same mechanism vanilla's own chest/horse screens
// already use safely - covering the whole inventory contiguously, with
// $item_collection_name correctly set this time, and decorative dividers/
// labels layered behind it for visual organization instead of literally
// splitting the collection.
//
// Two other hard constraints from earlier attempts still apply and are
// unchanged: container_type is a fixed 7-value enum with no "use my own
// screen" option, and per-instance content swapping is confirmed
// impossible (a "requires: true" test applied identically to every real
// chest) - so this still replaces horse_screen.json unconditionally, for
// every container_type "horse" entity including real horses/donkeys/
// mules/llamas. equip_panel and horse_renderer are kept at their real
// original offsets for the same reason as before.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const COLS = 9;
const ROWS = 10; // 9x10 = 90, matching container_wide's inventory_size
const QUICK_ACCESS_ROWS = 2; // purely a decorative split point - not a real boundary in the collection

const START_X = 79; // clears equip_panel/horse_renderer to the left
const LABEL_H = 11; // space reserved above the grid for the "Quick Access" label
const START_Y = 18 + LABEL_H;

const gridWidth = COLS * CELL, gridHeight = ROWS * CELL;
const panelWidth = START_X + gridWidth + 7;
const dividerY = START_Y + QUICK_ACCESS_ROWS * CELL;
const bottomHalfY = START_Y + gridHeight + 12;
const rootHeight = bottomHalfY + 90 + 40; // grid + player inv block + hotbar/margin

const doc = {
    namespace: "horse",

    // The exact same template every real slot cell in vanilla's own grids
    // already is, with the one required variable those always carry and
    // our earlier attempts were missing.
    "oc_grid_item@common.container_item": { "$item_collection_name": "container_items" },

    oc_grid: {
        type: "grid",
        size: [gridWidth, gridHeight],
        anchor_from: "top_left",
        anchor_to: "top_left",
        grid_dimensions: [COLS, ROWS],
        grid_item_template: "horse.oc_grid_item",
        collection_name: "container_items",
    },

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
                        {
                            quick_access_label: {
                                type: "label", layer: 2, size: [gridWidth, 9],
                                anchor_from: "top_left", anchor_to: "top_left", offset: [START_X, START_Y - LABEL_H],
                                text: "Quick Access", color: [0.78, 0.8, 0.93], font_size: "small", shadow: true,
                            },
                        },
                        {
                            storage_label: {
                                type: "label", layer: 2, size: [gridWidth, 9],
                                anchor_from: "top_left", anchor_to: "top_left", offset: [START_X, dividerY + 3],
                                text: "Storage", color: [0.78, 0.8, 0.93], font_size: "small", shadow: true,
                            },
                        },
                        {
                            section_divider: {
                                type: "image", layer: 2, size: [gridWidth, 1],
                                anchor_from: "top_left", anchor_to: "top_left", offset: [START_X, dividerY - 1],
                                texture: "textures/ui/White", color: [0.55, 0.55, 0.6],
                            },
                        },
                        { "main_grid@horse.oc_grid": { offset: [START_X, START_Y] } },
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
console.log(`Real single grid: ${COLS}x${ROWS} = ${COLS * ROWS} slots (must match container_wide's inventory_size)`);
console.log(`Panel size: ${panelWidth}x${rootHeight}`);
