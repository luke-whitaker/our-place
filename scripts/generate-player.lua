-- generate-player.lua
-- Generates 32x32 player sprite templates for Our Place
-- Run via: File > Scripts > Run Script
--
-- Produces 4 .aseprite files (one per direction), each with 2 animation frames:
--   Frame 1 = idle/standing, Frame 2 = mid-step
--
-- Colors match DEFAULT_AVATAR from src/lib/types/game.ts.
-- Open each file in Aseprite and paint your real art on top.

local S = 32
local OUT = "/Users/lukewhitaker/Desktop/our-place/public/game/sprites/"

-- ── Colors (DEFAULT_AVATAR + palette) ──

local function hex(h)
  local r = tonumber(h:sub(2, 3), 16)
  local g = tonumber(h:sub(4, 5), 16)
  local b = tonumber(h:sub(6, 7), 16)
  return app.pixelColor.rgba(r, g, b, 255)
end

local function darken(h, amount)
  local r = math.floor(tonumber(h:sub(2, 3), 16) * (1 - amount) + 0.5)
  local g = math.floor(tonumber(h:sub(4, 5), 16) * (1 - amount) + 0.5)
  local b = math.floor(tonumber(h:sub(6, 7), 16) * (1 - amount) + 0.5)
  return app.pixelColor.rgba(r, g, b, 255)
end

local SKIN_HEX   = "#C68642"
local SKIN       = hex(SKIN_HEX)
local HAIR       = darken(SKIN_HEX, 0.35)  -- derived from skin, same as JS
local SHIRT      = hex("#5c699f")
local PANTS      = hex("#353540")
local SHOES      = hex("#4d3f38")
local EYES       = hex("#353540")
local TRANSPARENT = app.pixelColor.rgba(0, 0, 0, 0)

-- ── Helper ──

local function fillRect(img, x, y, w, h, color)
  for py = y, y + h - 1 do
    for px = x, x + w - 1 do
      img:drawPixel(px, py, color)
    end
  end
end

-- ── Body drawing (all coordinates are 2× the originals in sprites.ts) ──
--
-- dir: "down" | "up" | "left" | "right"
-- frame: 0 (idle) | 1 (mid-step)

local function drawBody(img, dir, frame)
  img:clear(TRANSPARENT)

  local armShift = frame == 1 and 2 or 0

  -- Hair base
  fillRect(img,  8,  0, 16,  8, HAIR)

  -- Long hair side tails (optional — comment out for short hair)
  -- fillRect(img,  6,  6,  4, 10, HAIR)
  -- fillRect(img, 22,  6,  4, 10, HAIR)

  -- Face (varies by direction)
  if dir == "down" then
    fillRect(img, 10,  6, 12,  8, SKIN)
    fillRect(img, 12,  8,  2,  2, EYES)   -- left eye
    fillRect(img, 18,  8,  2,  2, EYES)   -- right eye

  elseif dir == "up" then
    fillRect(img, 10,  6, 12,  6, SKIN)   -- back of head, less face shown
    fillRect(img, 10,  6, 12,  2, HAIR)   -- hair covers top

  elseif dir == "left" then
    fillRect(img,  8,  6, 10,  8, SKIN)
    fillRect(img, 10,  8,  2,  2, EYES)

  elseif dir == "right" then
    fillRect(img, 14,  6, 10,  8, SKIN)
    fillRect(img, 20,  8,  2,  2, EYES)
  end

  -- Shirt
  fillRect(img,  8, 14, 16,  8, SHIRT)

  -- Arms (skin — shift opposite directions for walk cycle)
  fillRect(img,  6, 14 + armShift,  2,  6, SKIN)   -- left arm
  fillRect(img, 24, 16 - armShift,  2,  6, SKIN)   -- right arm

  -- Pants (two legs)
  fillRect(img, 10, 22,  6,  6, PANTS)
  fillRect(img, 16, 22,  6,  6, PANTS)

  -- Shoes (shift outward on walk frame)
  if frame == 0 then
    fillRect(img, 10, 28,  6,  4, SHOES)
    fillRect(img, 16, 28,  6,  4, SHOES)
  else
    fillRect(img,  8, 28,  6,  4, SHOES)
    fillRect(img, 18, 28,  6,  4, SHOES)
  end
end

-- ── Sprite sheet builder ──
--
-- Creates one .aseprite file per direction with 2 frames.

local directions = { "down", "up", "left", "right" }

for _, dir in ipairs(directions) do
  local spr = Sprite(S, S)

  -- Frame 1 (idle)
  local img1 = spr.cels[1].image
  drawBody(img1, dir, 0)
  spr.frames[1].duration = 400

  -- Frame 2 (mid-step)
  spr:newFrame(1)
  local cel2 = spr:newCel(spr.layers[1], spr.frames[2])
  local img2 = cel2.image
  drawBody(img2, dir, 1)
  spr.frames[2].duration = 400

  spr.filename = OUT .. "player_" .. dir .. ".aseprite"
  spr:save()
  spr:close()
end

app.alert("Done! 4 player sprites saved to:\n" .. OUT)
