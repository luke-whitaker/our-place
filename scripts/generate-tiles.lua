-- generate-tiles.lua
-- Generates 32x32 .aseprite template files for Our Place
-- Run via: File > Scripts > Run Script
--
-- Each file is a faithful 2x scale of the current procedural tile logic.
-- Open the output files in Aseprite and refine them with real pixel art.

local S = 32
local OUT = "/Users/lukewhitaker/Desktop/our-place/public/game/tiles/"

-- ── Palette (from src/lib/game/constants.ts) ──

local function hex(h)
  local r = tonumber(h:sub(2, 3), 16)
  local g = tonumber(h:sub(4, 5), 16)
  local b = tonumber(h:sub(6, 7), 16)
  return app.pixelColor.rgba(r, g, b, 255)
end

local P = {
  grass1      = hex("#557d55"),
  grass2      = hex("#446350"),
  path        = hex("#bdaa97"),
  pathEdge    = hex("#bda351"),
  dirt        = hex("#86735b"),
  water1      = hex("#668da9"),
  water2      = hex("#769fa6"),
  waterLight  = hex("#8bb0ad"),
  treeTrunk   = hex("#735b42"),
  treeTop1    = hex("#446350"),
  treeTop2    = hex("#3e554c"),
  wall        = hex("#d4c2b6"),
  wallDark    = hex("#bdaa97"),
  roof        = hex("#ca5954"),
  roofDark    = hex("#a94949"),
  door        = hex("#735b42"),
  doorFrame   = hex("#7e674c"),
  window      = hex("#8bb0ad"),
  windowFrame = hex("#5a5888"),
  lightest    = hex("#eeb551"),
  shirt       = hex("#5c699f"),
  fence       = hex("#86735b"),
  fencePost   = hex("#604b3d"),
  brick1      = hex("#a94949"),
  brick2      = hex("#ca5954"),
  brickGap    = hex("#86735b"),
  bridgeDeck      = hex("#bdaa97"),
  bridgeRail      = hex("#86735b"),
  bridgeRailPost  = hex("#604b3d"),
}

-- ── Helpers ──

local function fillRect(img, x, y, w, h, color)
  for py = y, y + h - 1 do
    for px = x, x + w - 1 do
      img:drawPixel(px, py, color)
    end
  end
end

local function makeTile(name, drawFn)
  local spr = Sprite(S, S)
  local img = spr.cels[1].image
  img:clear(app.pixelColor.rgba(0, 0, 0, 255))
  drawFn(img)
  spr.filename = OUT .. name .. ".aseprite"
  spr:save()
  spr:close()
end

-- ── Terrain ──

makeTile("grass", function(img)
  fillRect(img,  0,  0, 32, 32, P.grass1)
  fillRect(img,  6,  8,  2,  2, P.grass2)
  fillRect(img, 20,  4,  2,  2, P.grass2)
  fillRect(img, 14, 22,  2,  2, P.grass2)
  fillRect(img, 26, 16,  2,  2, P.grass2)
end)

makeTile("grass2", function(img)
  fillRect(img,  0,  0, 32, 32, P.grass2)
  fillRect(img, 10,  6,  2,  2, P.grass1)
  fillRect(img, 24, 14,  2,  2, P.grass1)
  fillRect(img,  4, 24,  2,  2, P.grass1)
end)

makeTile("path", function(img)
  fillRect(img,  0,  0, 32, 32, P.path)
  fillRect(img, 12,  6,  4,  2, P.pathEdge)
  fillRect(img, 22, 20,  4,  2, P.pathEdge)
end)

makeTile("path_edge", function(img)
  fillRect(img, 0, 0, 32, 32, P.pathEdge)
end)

makeTile("dirt", function(img)
  fillRect(img,  0,  0, 32, 32, P.dirt)
  fillRect(img,  8, 12,  2,  2, P.pathEdge)
  fillRect(img, 22,  6,  2,  2, P.pathEdge)
end)

-- ── Water (2 animation frames) ──

makeTile("water", function(img)
  fillRect(img,  0,  0, 32, 32, P.water1)
  fillRect(img,  4,  8,  8,  2, P.water2)
  fillRect(img, 18, 18, 10,  2, P.water2)
  fillRect(img,  6, 10,  4,  2, P.waterLight)
  fillRect(img, 20, 20,  6,  2, P.waterLight)
end)

makeTile("water2", function(img)
  fillRect(img,  0,  0, 32, 32, P.water1)
  fillRect(img, 10,  6, 10,  2, P.water2)
  fillRect(img,  2, 22,  8,  2, P.water2)
  fillRect(img, 12,  8,  6,  2, P.waterLight)
  fillRect(img,  4, 24,  4,  2, P.waterLight)
end)

-- ── Trees ──

makeTile("tree_top", function(img)
  fillRect(img,  0,  0, 32, 32, P.grass1)
  fillRect(img,  4,  4, 24, 20, P.treeTop1)
  fillRect(img,  8,  6, 16, 14, P.treeTop2)
  fillRect(img, 10,  8,  4,  4, P.treeTop1)
  fillRect(img, 18, 10,  6,  4, P.treeTop1)
end)

makeTile("tree_trunk", function(img)
  fillRect(img,  0,  0, 32, 32, P.grass1)
  fillRect(img, 12,  0,  8, 24, P.treeTrunk)
  fillRect(img, 14,  0,  4, 20, P.dirt)
  fillRect(img,  8, 24, 16,  4, P.treeTrunk)
end)

-- ── Building parts ──

makeTile("wall", function(img)
  fillRect(img,  0,  0, 32, 32, P.wall)
  fillRect(img,  0,  0, 32,  2, P.wallDark)
  fillRect(img,  0, 16, 32,  2, P.wallDark)
end)

makeTile("wall_left", function(img)
  fillRect(img, 0, 0, 32, 32, P.wall)
  fillRect(img, 0, 0,  4, 32, P.wallDark)
end)

makeTile("wall_right", function(img)
  fillRect(img,  0, 0, 32, 32, P.wall)
  fillRect(img, 28, 0,  4, 32, P.wallDark)
end)

makeTile("roof", function(img)
  fillRect(img, 0,  0, 32, 32, P.roof)
  fillRect(img, 0, 28, 32,  4, P.roofDark)
end)

makeTile("roof_left", function(img)
  fillRect(img, 0,  0, 32, 32, P.roof)
  fillRect(img, 0,  0,  4, 32, P.roofDark)
  fillRect(img, 0, 28, 32,  4, P.roofDark)
end)

makeTile("roof_right", function(img)
  fillRect(img,  0,  0, 32, 32, P.roof)
  fillRect(img, 28,  0,  4, 32, P.roofDark)
  fillRect(img,  0, 28, 32,  4, P.roofDark)
end)

makeTile("door", function(img)
  fillRect(img,  0,  0, 32, 32, P.wall)
  fillRect(img,  6,  4, 20, 28, P.doorFrame)
  fillRect(img,  8,  6, 16, 26, P.door)
  fillRect(img, 20, 18,  2,  2, P.lightest)
end)

makeTile("house_door", function(img)
  fillRect(img,  0,  0, 32, 32, P.wall)
  fillRect(img,  6,  4, 20, 28, P.doorFrame)
  fillRect(img,  8,  6, 16, 26, P.shirt)
  fillRect(img, 20, 18,  2,  2, P.lightest)
end)

makeTile("window", function(img)
  fillRect(img,  0,  0, 32, 32, P.wall)
  fillRect(img,  6,  6, 20, 20, P.windowFrame)
  fillRect(img,  8,  8, 16, 16, P.window)
  fillRect(img, 14,  8,  4, 16, P.windowFrame)
  fillRect(img,  8, 14, 16,  4, P.windowFrame)
end)

-- ── Decorative ──

makeTile("fence", function(img)
  fillRect(img,  0,  0, 32, 32, P.grass1)
  fillRect(img,  2,  8,  4, 20, P.fencePost)
  fillRect(img, 26,  8,  4, 20, P.fencePost)
  fillRect(img,  0, 12, 32,  4, P.fence)
  fillRect(img,  0, 22, 32,  4, P.fence)
end)

makeTile("brick", function(img)
  fillRect(img,  0,  0, 32, 32, P.brick1)
  -- Mortar rows
  fillRect(img,  0,  6, 32,  2, P.brickGap)
  fillRect(img,  0, 14, 32,  2, P.brickGap)
  fillRect(img,  0, 22, 32,  2, P.brickGap)
  fillRect(img,  0, 30, 32,  2, P.brickGap)
  -- Vertical joints (offset each row)
  fillRect(img, 14,  0,  2,  8, P.brickGap)
  fillRect(img,  6,  8,  2,  8, P.brickGap)
  fillRect(img, 22,  8,  2,  8, P.brickGap)
  fillRect(img, 14, 16,  2,  8, P.brickGap)
  fillRect(img,  6, 24,  2,  8, P.brickGap)
  fillRect(img, 22, 24,  2,  8, P.brickGap)
  -- Alternate brick highlight
  fillRect(img,  2,  0, 10,  6, P.brick2)
  fillRect(img, 16,  8,  6,  6, P.brick2)
  fillRect(img,  2, 16, 10,  6, P.brick2)
  fillRect(img, 16, 24,  6,  6, P.brick2)
end)

makeTile("bridge", function(img)
  fillRect(img,  0,  0, 32, 32, P.bridgeDeck)
  fillRect(img,  0, 10, 32,  2, P.brickGap)
  fillRect(img,  0, 22, 32,  2, P.brickGap)
end)

makeTile("bridge_rail", function(img)
  fillRect(img,  0,  0, 32, 32, P.bridgeDeck)
  fillRect(img,  0,  0, 32,  6, P.bridgeRail)
  fillRect(img,  4,  0,  4, 10, P.bridgeRailPost)
  fillRect(img, 24,  0,  4, 10, P.bridgeRailPost)
end)

app.alert("Done! 22 tiles saved to:\n" .. OUT)
