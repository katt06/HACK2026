import { DEFAULT_AVATAR, type EquippedAvatar } from "@contract";
import { BASE, GRID, ITEM_ART, LAYER_ORDER, PALETTE, type PixelLayer } from "./items";

export interface PixelRun {
  x: number;
  y: number;
  width: number;
  color: string;
}

// The layers to draw for an avatar, bottom to top.
export function avatarLayers(avatar: EquippedAvatar = DEFAULT_AVATAR): PixelLayer[] {
  return [BASE, ...LAYER_ORDER.flatMap((slot) => (avatar[slot] ? [ITEM_ART[avatar[slot]!]] : []))];
}

// Paints the layers onto a 32×32 grid of colors (null = transparent). Later layers cover earlier ones.
export function composeGrid(layers: PixelLayer[]): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: GRID }, () => Array<string | null>(GRID).fill(null));
  for (const layer of layers) {
    layer.rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const x = layer.x + dx;
        const y = layer.y + dy;
        if (ch !== "." && x >= 0 && x < GRID && y >= 0 && y < GRID) grid[y][x] = PALETTE[ch];
      });
    });
  }
  return grid;
}

// Same-colored neighbors in a row become one rect: ~150 rects instead of ~1,000.
export function toRuns(grid: (string | null)[][]): PixelRun[] {
  const runs: PixelRun[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === color) end++;
      if (color) runs.push({ x, y, width: end - x, color });
      x = end;
    }
  });
  return runs;
}
