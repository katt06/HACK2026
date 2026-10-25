import type { AvatarSlot, ItemId } from "@contract";

// Pixel art for the 32×32 capybara avatar. Each layer is a small map placed at (x, y) on the grid:
// "." is transparent and every other character is a PALETTE key. A new shop item is just a new entry here
// (plus its price in SHOP_ITEMS in contract.ts).

export const GRID = 32;

export interface PixelLayer {
  x: number;
  y: number;
  rows: string[];
}

export const PALETTE: Record<string, string> = {
  "o": "#5a3a24", // outline
  "b": "#c8834f", // fur
  "l": "#e2a877", // light fur
  "d": "#8b5a3c", // dark fur
  "e": "#2a1a10", // eye
  "w": "#ffffff", // white
  "p": "#f2998a", // blush
  "n": "#3b2414", // nose
  "m": "#a8693f", // muzzle
  "k": "#1b1f24", // frame
  "g": "#2f3b47", // lens
  "s": "#8fa3b3", // lens shine
  "Y": "#f5c93d", // yellow
  "y": "#d9a520", // yellow shade
  "W": "#ffffff", // white
  "L": "#4e9b6e", // leaf
  "T": "#e8c27a", // straw
  "t": "#c99a4a", // straw shade
  "R": "#d9534f", // red
  "c": "#f6f1e7", // cream
  "C": "#e8f4f8", // cup
  "q": "#6b7b80", // cup edge
  "M": "#8cbf5a", // matcha
  "F": "#d8ecb8", // foam
  "Z": "#4e9b6e", // green straw
  "B": "#c99a6b", // milk tea
  "P": "#3b2414", // pearl
  "X": "#f2998a", // pink straw
  "f": "#f2998a", // pink
  "G": "#f5b82e", // gold
  "H": "#c98f12", // gold edge
  "J": "#d9534f", // ruby
};

// Drawn bottom to top over the base: a scarf goes under the face, a drink in front of everything.
export const LAYER_ORDER: readonly AvatarSlot[] = ["outfit", "glasses", "hat", "held"];

export const BASE: PixelLayer = {
  x: 5,
  y: 3,
  rows: [
    "....oo..........oo....",
    "...oddo........oddo...",
    "..odddoooooooooodddo..",
    "..odoobbbbbbbbbboodo..",
    "...obllllbbbbbbbbbo...",
    "...obbbbbbbbbbbbbbo...",
    "..obbbwebbbbbbwebbbo..",
    "..obbbeebbbbbbeebbbo..",
    "..obbbbbmmmmmmbbbbbo..",
    "..obpbmmmmmmmmmmbpbo..",
    "..obbbmmnmmmmnmmbbbo..",
    "..obbmmmmmmmmmmmmbbo..",
    "...obbmmmmnnmmmmbbo...",
    "...obbmmmmmmmmmmbbo...",
    "....oobbmmmmmmbboo....",
    "...obboooooooooobbo...",
    "..obbbbbbbbbbbbbbbbo..",
    ".obbbbbbbbbbbbbbbbbbo.",
    ".obbbbbbllllllbbbbbbo.",
    "obbbbddllllllllddbbbbo",
    "obbbbbllllllllllbbbbbo",
    "obbbbbllllllllllbbbbbo",
    "obbbbbllllllllllbbbbbo",
    ".obbbbllllllllllbbbbo.",
    ".obbbbbllllllllbbbbbo.",
    "..obbbbbllllllbbbbbo..",
    "...oooobbbbbbbboooo...",
    "...odddobbbbbbodddo...",
    "....oooooooooooooo....",
  ],
};

export const ITEM_ART: Record<ItemId, PixelLayer> = {
  "sunglasses": {
    x: 8,
    y: 8,
    rows: [
      ".kkkkkk..kkkkkk.",
      "kkgsggkkkkgsggkk",
      ".kggggk..kggggk.",
      "..kkkk....kkkk..",
    ],
  },
  "yuzu-hat": {
    x: 12,
    y: 0,
    rows: [
      "...ooLLL",
      ".ooYYLo.",
      "oYWYYYYo",
      "oYWYYYYo",
      "oYYYYYYy",
      "oYYYYYyo",
      ".ooYyyo.",
      "...oo...",
    ],
  },
  "straw-hat": {
    x: 3,
    y: 0,
    rows: [
      ".........oooooooo.........",
      "........otTTTTTTto........",
      ".......oTTtTTTTtTTo.......",
      ".......oTTTTTTTTTTo.......",
      ".......oRRRRRRRRRRo.......",
      ".oooooooRRRRRRRRRRooooooo.",
      "oTtTTTTTTooooooooTTTTTTTto",
      ".ooootooTTTTTTTTTToootooo.",
      "........oooooooooo........",
    ],
  },
  "scarf": {
    x: 7,
    y: 16,
    rows: [
      ".oooooooooooooooo.",
      "ocRRRcccRRRcccRRRo",
      "ocRRRcccRRRcoooRRo",
      ".oooooooooooRRRoo.",
      "...........oRRRo..",
      "...........occco..",
      "...........occco..",
      "...........occco..",
      "...........oRRRo..",
      "...........oRRRo..",
      "............ooo...",
    ],
  },
  "matcha": {
    x: 20,
    y: 11,
    rows: [
      ".....ZZ...",
      ".....ZZ...",
      ".....ZZ...",
      ".....ZZ...",
      ".....ZZ...",
      ".....ZZ...",
      "qqqqqZZqqq",
      ".qFFFFFFq.",
      ".qMMMMMMq.",
      ".qCMMMMMq.",
      ".qCMMMMMq.",
      ".qCMMMMMq.",
      "..qMMMMq..",
      "..qMMMMq..",
      "..qMMMMq..",
      "..qMMMMq..",
      "..qMMMMq..",
      "..qqqqqq..",
    ],
  },
  "bubble-tea": {
    x: 20,
    y: 11,
    rows: [
      ".....XX...",
      ".....XX...",
      ".....XX...",
      ".....XX...",
      ".....XX...",
      ".....XX...",
      "qqqqqXXqqq",
      ".qBBBBBBq.",
      ".qBBBBBBq.",
      ".qCBBBBBq.",
      ".qCBBBBBq.",
      ".qCBBBBBq.",
      "..qBBBBq..",
      "..qBBBBq..",
      "..qBPBPq..",
      "..qPBPBq..",
      "..qBPBPq..",
      "..qqqqqq..",
    ],
  },
  "flower-crown": {
    x: 8,
    y: 1,
    rows: [
      ".f...W....f...W.",
      "fYf.WYW..fYf.WYW",
      ".f.L.W.LL.f.L.W.",
      "..LLLLLLLLLLLL..",
      "LLLLLLLLLLLLLLLL",
    ],
  },
  "tiny-crown": {
    x: 12,
    y: 0,
    rows: [
      "H..GG..H",
      "G..GG..G",
      "G..GG..G",
      "HHHHHHHH",
      "HWGJJGGH",
      "HJGGGGJH",
      "HHHHHHHH",
    ],
  },
};
