import { describe, expect, it } from "vitest";
import { ITEM_ORDER, SHOP_ITEMS } from "@contract";
import { BASE, GRID, ITEM_ART, LAYER_ORDER, PALETTE } from "./items";
import { avatarLayers, composeGrid, toRuns } from "./pixels";

const layers = [["base", BASE], ...Object.entries(ITEM_ART)] as const;

describe("pixel maps", () => {
  it("every shop item has art", () => {
    expect(Object.keys(ITEM_ART).sort()).toEqual([...ITEM_ORDER].sort());
  });

  it.each(layers)("%s fits the 32×32 grid with even rows and known colors", (_name, layer) => {
    const width = layer.rows[0].length;
    expect(layer.rows.every((r) => r.length === width)).toBe(true);
    expect(layer.x + width).toBeLessThanOrEqual(GRID);
    expect(layer.y + layer.rows.length).toBeLessThanOrEqual(GRID);
    const used = new Set(layer.rows.join("").replaceAll(".", ""));
    expect([...used].filter((ch) => !(ch in PALETTE))).toEqual([]);
  });

  it("every slot has a draw position", () => {
    expect(new Set(ITEM_ORDER.map((id) => SHOP_ITEMS[id].slot))).toEqual(new Set(LAYER_ORDER));
  });
});

describe("composing", () => {
  it("draws the base plus one layer per equipped slot, in order", () => {
    expect(avatarLayers({ hat: "straw-hat", glasses: "sunglasses" })).toEqual([BASE, ITEM_ART.sunglasses, ITEM_ART["straw-hat"]]);
    expect(avatarLayers({})).toEqual([BASE]);
  });

  it("later layers cover earlier ones", () => {
    const grid = composeGrid([
      { x: 0, y: 0, rows: ["oo"] },
      { x: 1, y: 0, rows: ["Y."] },
    ]);
    expect(grid[0].slice(0, 3)).toEqual([PALETTE.o, PALETTE.Y, null]);
  });

  it("merges same-colored pixels in a row into one rect", () => {
    const runs = toRuns(composeGrid([{ x: 2, y: 1, rows: ["ooY"] }]));
    expect(runs).toEqual([
      { x: 2, y: 1, width: 2, color: PALETTE.o },
      { x: 4, y: 1, width: 1, color: PALETTE.Y },
    ]);
  });
});
