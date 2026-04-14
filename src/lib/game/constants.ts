// ── Tile & Map ──

export const TILE = 16;

// Viewport: 30 tiles wide × 20 tiles tall
export const CANVAS_W = 480;
export const CANVAS_H = 320;

// ── Player ──

export const PLAYER_SPEED = 1.5; // pixels per tick
export const PLAYER_W = 12; // collision hitbox width
export const PLAYER_H = 12; // collision hitbox height
export const PLAYER_OFFSET_X = 2; // hitbox offset from sprite left
export const PLAYER_OFFSET_Y = 4; // hitbox offset from sprite top

// ── Animation ──

export const ANIM_FRAME_TICKS = 10; // ticks per walk frame

// ── Timing ──

export const TICK_RATE = 1000 / 60; // ~16.67ms per tick
export const MAX_ACCUMULATOR = 200; // prevents spiral of death

// ── Fade ──

export const FADE_SPEED = 0.04; // per tick, ~625ms total fade

// ── Directions ──

export const DIR = {
  DOWN: 0,
  UP: 1,
  LEFT: 2,
  RIGHT: 3,
} as const;

export type Direction = (typeof DIR)[keyof typeof DIR];

// ── Palette ──

// Sourced from fantasy.pal (32-color JASC palette)
export const PAL = {
  // Base
  darkest: "#353540",
  dark: "#636167",
  mid: "#918d8d",
  light: "#bfb8b4",
  lightest: "#eeb551",
  white: "#ede4da",

  // Nature
  grass1: "#557d55",
  grass2: "#446350",
  grassDark: "#8b9150",
  path: "#bdaa97",
  pathEdge: "#bda351",
  dirt: "#86735b",

  // Water
  water1: "#668da9",
  water2: "#769fa6",
  waterLight: "#8bb0ad",

  // Trees
  treeTrunk: "#735b42",
  treeTop1: "#446350",
  treeTop2: "#3e554c",

  // Buildings
  wall: "#d4c2b6",
  wallDark: "#bdaa97",
  roof: "#ca5954",
  roofDark: "#a94949",
  door: "#735b42",
  doorFrame: "#7e674c",
  window: "#8bb0ad",
  windowFrame: "#5a5888",

  // UI
  textBg: "#353540",
  textColor: "#ede4da",
  textBorder: "#5a5888",

  // Player
  skin: "#d9a6a6",
  hair: "#604b3d",
  shirt: "#5c699f",
  pants: "#353540",
  shoes: "#4d3f38",

  // Fence
  fence: "#86735b",
  fencePost: "#604b3d",

  // Brick (pedestrian mall)
  brick1: "#a94949",
  brick2: "#ca5954",
  brickGap: "#86735b",

  // Bridge
  bridgeDeck: "#bdaa97",
  bridgeRail: "#86735b",
  bridgeRailPost: "#604b3d",

  // Capital building
  capitalRoof: "#5a5888",
  capitalRoofDark: "#353540",
} as const;
