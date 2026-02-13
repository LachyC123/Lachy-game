var Game = Game || {};

Game.World = (function () {
  var U = Game.Utils;
  var TILE_SIZE = 32;
  var CHUNK_SIZE = 16;
  var WORLD_TILES = 256;
  var WORLD_CHUNKS = WORLD_TILES / CHUNK_SIZE;

  // Tile types
  var T = {
    GRASS: 0, DIRT: 1, ROAD: 2, WATER: 3, FOREST_FLOOR: 4,
    STONE_FLOOR: 5, WALL_STONE: 6, WALL_WOOD: 7, DOOR: 8,
    FARMLAND: 9, SAND: 10, WOOD_FLOOR: 11, BRIDGE: 12,
    MARKET_STONE: 13, DEEP_WATER: 14
  };

  var TILE_SOLID = {};
  TILE_SOLID[T.WALL_STONE] = true;
  TILE_SOLID[T.WALL_WOOD] = true;
  TILE_SOLID[T.WATER] = true;
  TILE_SOLID[T.DEEP_WATER] = true;

  var TILE_SLOW = {};
  TILE_SLOW[T.FOREST_FLOOR] = 0.7;
  TILE_SLOW[T.FARMLAND] = 0.8;
  TILE_SLOW[T.SAND] = 0.85;

  var TILE_ROAD = {};
  TILE_ROAD[T.ROAD] = 1.2;
  TILE_ROAD[T.BRIDGE] = 1.2;
  TILE_ROAD[T.MARKET_STONE] = 1.1;

  // World data
  var tiles = null;
  var treeMap = null;
  var decoMap = null;   // decoration type (0=none)
  var decoSeed = null;  // variation per deco
  var chunkCanvases = {};
  var chunkDirty = {};
  var buildings = [];
  var locations = {};
  var seed = 42;

  // Decoration types
  var D = {
    NONE: 0, FLOWERS: 1, SMALL_ROCK: 2, MUSHROOM: 3, TALL_GRASS: 4,
    BUSH: 5, HAY_BALE: 6, BARREL: 7, CRATE: 8, MARKET_STALL: 9,
    WELL: 10, FENCE_H: 11, FENCE_V: 12, CAMPFIRE: 13, ANVIL: 14,
    SIGN_POST: 15, CART: 16, WATER_BUCKET: 17, LOG_PILE: 18,
    SCARECROW: 19, BENCH: 20, TORCH: 21, BANNER: 22, GRAVESTONE: 23,
    PLANTER: 24
  };

  var TOWN_WALLS = { x1: 108, y1: 108, x2: 148, y2: 148 };

  var SETTLEMENTS = {
    ashford: { x: 128, y: 128, type: 'town', name: 'Ashford' },
    millhaven: { x: 66, y: 190, type: 'village', name: 'Millhaven' },
    thornfield: { x: 66, y: 64, type: 'village', name: 'Thornfield' },
    banditCamp: { x: 200, y: 80, type: 'camp', name: 'Bandit Camp' }
  };

  function init(worldSeed) {
    seed = worldSeed || 42;
    U.seededRandom(seed);
    tiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
    treeMap = new Uint8Array(WORLD_TILES * WORLD_TILES);
    decoMap = new Uint8Array(WORLD_TILES * WORLD_TILES);
    decoSeed = new Uint8Array(WORLD_TILES * WORLD_TILES);
    chunkCanvases = {};
    chunkDirty = {};
    buildings = [];
    locations = {};

    generateTerrain();
    generateRiver();
    generateRoads();
    generateTown();
    generateVillage(SETTLEMENTS.millhaven);
    generateVillage(SETTLEMENTS.thornfield);
    generateBanditCamp();
    generateFarmland();
    generateTrees();
    generateDecorations();
    storeLocations();
  }

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return T.DEEP_WATER;
    return tiles[ty * WORLD_TILES + tx];
  }

  function setTile(tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return;
    tiles[ty * WORLD_TILES + tx] = type;
    var cx = Math.floor(tx / CHUNK_SIZE);
    var cy = Math.floor(ty / CHUNK_SIZE);
    chunkDirty[cx + ',' + cy] = true;
  }

  function setDeco(tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return;
    decoMap[ty * WORLD_TILES + tx] = type;
    decoSeed[ty * WORLD_TILES + tx] = (U.rng() * 255) | 0;
  }

  function isSolid(tx, ty) {
    return !!TILE_SOLID[tileAt(tx, ty)];
  }

  function getSpeedMod(tx, ty) {
    var t = tileAt(tx, ty);
    if (TILE_ROAD[t]) return TILE_ROAD[t];
    if (TILE_SLOW[t]) return TILE_SLOW[t];
    return 1.0;
  }

  function hasTree(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return false;
    return treeMap[ty * WORLD_TILES + tx] === 1;
  }

  function isForest(tx, ty) {
    return tileAt(tx, ty) === T.FOREST_FLOOR || hasTree(tx, ty);
  }

  function getDeco(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    return decoMap[ty * WORLD_TILES + tx];
  }

  function getDecoVar(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    return decoSeed[ty * WORLD_TILES + tx];
  }

  // ======= GENERATION =======

  function generateTerrain() {
    for (var y = 0; y < WORLD_TILES; y++) {
      for (var x = 0; x < WORLD_TILES; x++) {
        var elev = U.fbm(x * 0.015, y * 0.015, 4, seed);
        var moist = U.fbm(x * 0.02, y * 0.02, 3, seed + 500);
        var t = T.GRASS;
        if (elev < 0.25) t = T.WATER;
        else if (elev < 0.30) t = T.SAND;
        else if (moist > 0.62 && elev > 0.38) t = T.FOREST_FLOOR;
        tiles[y * WORLD_TILES + x] = t;
      }
    }
    for (var y = 25; y < 135; y++)
      for (var x = 168; x < 245; x++) {
        if (U.fbm(x * 0.05, y * 0.05, 2, seed + 100) > 0.3)
          tiles[y * WORLD_TILES + x] = T.FOREST_FLOOR;
      }
    for (var y = 10; y < 52; y++)
      for (var x = 20; x < 55; x++) {
        if (U.fbm(x * 0.06, y * 0.06, 2, seed + 200) > 0.35)
          tiles[y * WORLD_TILES + x] = T.FOREST_FLOOR;
      }
  }

  function generateRiver() {
    var rx = 38;
    for (var y = 0; y < WORLD_TILES; y++) {
      rx += Math.floor(U.noise2D(y * 0.08, 0, seed + 300) * 3 - 1);
      rx = U.clamp(rx, 34, 42);
      for (var dx = -1; dx <= 1; dx++) setTile(rx + dx, y, T.WATER);
      if (U.rng() < 0.3) setTile(rx + 2, y, T.WATER);
      if (U.rng() < 0.3) setTile(rx - 2, y, T.WATER);
    }
    for (var dx = -3; dx <= 3; dx++) { setTile(38 + dx, 64, T.BRIDGE); setTile(38 + dx, 65, T.BRIDGE); }
    for (var dx = -3; dx <= 3; dx++) { setTile(38 + dx, 128, T.BRIDGE); setTile(38 + dx, 129, T.BRIDGE); }
  }

  function generateRoads() {
    drawRoad(66, 182, 128, 152, 2);
    drawRoad(128, 152, 128, 148, 2);
    drawRoad(108, 128, 76, 64, 2);
    drawRoad(76, 64, 66, 64, 2);
    drawRoad(66, 64, 34, 64, 2);
    drawRoad(56, 190, 56, 72, 1);
    drawRoad(148, 120, 180, 90, 1);
    drawRoad(180, 90, 196, 80, 1);
    drawRoad(110, 128, 146, 128, 2);
    drawRoad(128, 110, 128, 146, 2);
  }

  function drawRoad(x0, y0, x1, y1, width) {
    var points = U.bresenhamLine(x0, y0, x1, y1);
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      for (var dy = -width + 1; dy < width; dy++)
        for (var dx = -width + 1; dx < width; dx++) {
          var tx = p.x + dx, ty = p.y + dy;
          var cur = tileAt(tx, ty);
          if (cur !== T.WATER && cur !== T.BRIDGE && cur !== T.WALL_STONE && cur !== T.WALL_WOOD)
            setTile(tx, ty, T.ROAD);
        }
    }
  }

  function generateTown() {
    var w = TOWN_WALLS;
    for (var y = w.y1; y <= w.y2; y++)
      for (var x = w.x1; x <= w.x2; x++) setTile(x, y, T.DIRT);

    // Walls with thicker corners (towers)
    for (var x = w.x1; x <= w.x2; x++) {
      setTile(x, w.y1, T.WALL_STONE); setTile(x, w.y1 + 1, T.WALL_STONE);
      setTile(x, w.y2, T.WALL_STONE); setTile(x, w.y2 - 1, T.WALL_STONE);
    }
    for (var y = w.y1; y <= w.y2; y++) {
      setTile(w.x1, y, T.WALL_STONE); setTile(w.x1 + 1, y, T.WALL_STONE);
      setTile(w.x2, y, T.WALL_STONE); setTile(w.x2 - 1, y, T.WALL_STONE);
    }
    // Corner towers (3x3)
    var corners = [[w.x1, w.y1], [w.x2 - 2, w.y1], [w.x1, w.y2 - 2], [w.x2 - 2, w.y2 - 2]];
    for (var c = 0; c < corners.length; c++) {
      for (var dy = 0; dy < 3; dy++)
        for (var dx = 0; dx < 3; dx++)
          setTile(corners[c][0] + dx, corners[c][1] + dy, T.WALL_STONE);
    }

    // Gates - south
    for (var dx = -1; dx <= 1; dx++) { setTile(128 + dx, w.y2, T.ROAD); setTile(128 + dx, w.y2 - 1, T.ROAD); }
    // Gates - west
    for (var dy = -1; dy <= 1; dy++) { setTile(w.x1, 128 + dy, T.ROAD); setTile(w.x1 + 1, 128 + dy, T.ROAD); }

    // Internal roads
    for (var x = w.x1 + 2; x <= w.x2 - 2; x++) { setTile(x, 128, T.ROAD); setTile(x, 127, T.ROAD); }
    for (var y = w.y1 + 2; y <= w.y2 - 2; y++) { setTile(128, y, T.ROAD); setTile(127, y, T.ROAD); }

    // Market square
    for (var y = 124; y <= 132; y++)
      for (var x = 124; x <= 132; x++) setTile(x, y, T.MARKET_STONE);

    // Buildings
    placeBuilding(136, 110, 10, 8, T.WALL_STONE, T.STONE_FLOOR, 'castle');
    locations.castle = { x: 140, y: 114, name: 'Castle' };

    placeBuilding(113, 124, 7, 6, T.WALL_WOOD, T.WOOD_FLOOR, 'tavern');
    locations.tavern = { x: 116, y: 127, name: 'The Crossed Keys Tavern' };

    placeBuilding(134, 125, 6, 5, T.WALL_STONE, T.STONE_FLOOR, 'blacksmith');
    locations.blacksmith = { x: 137, y: 127, name: 'Blacksmith' };

    placeBuilding(111, 136, 8, 6, T.WALL_STONE, T.STONE_FLOOR, 'barracks');
    locations.barracks = { x: 115, y: 139, name: 'Guard Barracks' };

    placeBuilding(113, 113, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(120, 113, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(113, 118, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(134, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(140, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(134, 118, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(120, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(140, 120, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'noble_house');

    placeBuilding(122, 120, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
    placeBuilding(130, 120, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');

    // Training yard (open area near barracks)
    for (var y = 142; y <= 146; y++)
      for (var x = 120; x <= 126; x++) setTile(x, y, T.DIRT);
    locations.trainingYard = { x: 123, y: 144, name: 'Training Yard' };

    // Small garden in noble district
    for (var y = 112; y <= 114; y++)
      for (var x = 142; x <= 146; x++) setTile(x, y, T.GRASS);

    locations.market = { x: 128, y: 128, name: 'Market Square' };
    locations.townGateSouth = { x: 128, y: 149, name: 'Town South Gate' };
    locations.townGateWest = { x: 109, y: 128, name: 'Town West Gate' };
  }

  function generateVillage(settlement) {
    var cx = settlement.x, cy = settlement.y;
    for (var y = cy - 8; y <= cy + 8; y++)
      for (var x = cx - 10; x <= cx + 10; x++) {
        var cur = tileAt(x, y);
        if (cur !== T.FOREST_FLOOR && cur !== T.WATER) setTile(x, y, T.GRASS);
      }
    setTile(cx, cy, T.MARKET_STONE); setTile(cx + 1, cy, T.MARKET_STONE);
    setTile(cx, cy + 1, T.MARKET_STONE); setTile(cx + 1, cy + 1, T.MARKET_STONE);

    placeBuilding(cx - 7, cy - 5, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx + 3, cy - 5, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx - 7, cy + 3, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx + 3, cy + 3, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx - 3, cy - 7, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'house');

    // Additional homes so each villager can visibly belong to a proper dwelling
    placeBuilding(cx - 11, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx + 7, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx - 2, cy + 8, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');

    if (settlement.name === 'Millhaven') {
      placeBuilding(cx + 4, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
      locations.millhavenShop = { x: cx + 6, y: cy + 1, name: 'Millhaven Shop' };
    }
    if (settlement.name === 'Thornfield') {
      placeBuilding(cx + 4, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
      locations.thornfieldShop = { x: cx + 6, y: cy + 1, name: 'Thornfield Shop' };
    }

    for (var x = cx - 8; x <= cx + 8; x++) {
      var cur = tileAt(x, cy);
      if (cur !== T.WALL_WOOD && cur !== T.WALL_STONE && cur !== T.WOOD_FLOOR) setTile(x, cy, T.DIRT);
    }
    for (var y = cy - 6; y <= cy + 6; y++) {
      var cur = tileAt(cx, y);
      if (cur !== T.WALL_WOOD && cur !== T.WALL_STONE && cur !== T.WOOD_FLOOR) setTile(cx, y, T.DIRT);
    }
    locations[settlement.name.toLowerCase()] = { x: cx, y: cy, name: settlement.name };
  }

  function generateBanditCamp() {
    var cx = 200, cy = 80;
    for (var y = cy - 5; y <= cy + 5; y++)
      for (var x = cx - 6; x <= cx + 6; x++) setTile(x, y, T.DIRT);
    placeBuilding(cx - 4, cy - 3, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');
    placeBuilding(cx + 2, cy - 3, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');
    placeBuilding(cx - 1, cy + 2, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');
    locations.banditCamp = { x: cx, y: cy, name: 'Bandit Camp' };
  }

  function generateFarmland() {
    for (var y = 170; y < 185; y++)
      for (var x = 50; x < 82; x++) {
        if (tileAt(x, y) === T.GRASS && U.noise2D(x * 0.3, y * 0.3, seed + 400) > 0.35)
          setTile(x, y, T.FARMLAND);
      }
    for (var y = 150; y < 165; y++)
      for (var x = 112; x < 144; x++) {
        var cur = tileAt(x, y);
        if ((cur === T.GRASS || cur === T.DIRT) && U.noise2D(x * 0.3, y * 0.3, seed + 450) > 0.4)
          setTile(x, y, T.FARMLAND);
      }
  }

  function generateTrees() {
    for (var y = 0; y < WORLD_TILES; y++)
      for (var x = 0; x < WORLD_TILES; x++) {
        var t = tileAt(x, y);
        if (t === T.FOREST_FLOOR) {
          if (U.noise2D(x * 0.5, y * 0.5, seed + 600) > 0.3) treeMap[y * WORLD_TILES + x] = 1;
        } else if (t === T.GRASS) {
          if (U.noise2D(x * 0.8, y * 0.8, seed + 700) > 0.82) treeMap[y * WORLD_TILES + x] = 1;
        }
      }
  }

  function generateDecorations() {
    // Natural decorations on terrain
    for (var y = 0; y < WORLD_TILES; y++)
      for (var x = 0; x < WORLD_TILES; x++) {
        var t = tileAt(x, y);
        var h = U.hash2D(x, y, seed + 1200);
        if (treeMap[y * WORLD_TILES + x]) continue;
        if (t === T.GRASS) {
          if (h > 0.92) setDeco(x, y, D.FLOWERS);
          else if (h > 0.88) setDeco(x, y, D.TALL_GRASS);
          else if (h > 0.86) setDeco(x, y, D.SMALL_ROCK);
        } else if (t === T.FOREST_FLOOR) {
          if (h > 0.9) setDeco(x, y, D.MUSHROOM);
          else if (h > 0.85) setDeco(x, y, D.BUSH);
          else if (h > 0.82) setDeco(x, y, D.SMALL_ROCK);
        } else if (t === T.SAND) {
          if (h > 0.92) setDeco(x, y, D.SMALL_ROCK);
        }
      }

    // Town decorations
    var w = TOWN_WALLS;
    // Market stalls
    setDeco(125, 125, D.MARKET_STALL); setDeco(131, 125, D.MARKET_STALL);
    setDeco(125, 131, D.MARKET_STALL); setDeco(131, 131, D.MARKET_STALL);
    // Town barrels/crates near buildings
    setDeco(119, 125, D.BARREL); setDeco(119, 126, D.CRATE);
    setDeco(133, 126, D.BARREL); setDeco(140, 125, D.CRATE);
    setDeco(112, 140, D.BARREL); setDeco(113, 141, D.BARREL);
    // Blacksmith anvil
    setDeco(136, 128, D.ANVIL);
    // Tavern bench
    setDeco(112, 127, D.BENCH); setDeco(112, 128, D.BENCH);
    // Torches along main road
    for (var x = w.x1 + 4; x <= w.x2 - 4; x += 6) { setDeco(x, 126, D.TORCH); setDeco(x, 129, D.TORCH); }
    for (var y = w.y1 + 4; y <= w.y2 - 4; y += 6) { setDeco(126, y, D.TORCH); setDeco(129, y, D.TORCH); }
    // Banners at gates
    setDeco(127, w.y2 + 1, D.BANNER); setDeco(129, w.y2 + 1, D.BANNER);
    setDeco(w.x1 - 1, 127, D.BANNER); setDeco(w.x1 - 1, 129, D.BANNER);
    // Planters in noble district
    setDeco(141, 119, D.PLANTER); setDeco(144, 119, D.PLANTER);
    setDeco(141, 123, D.PLANTER); setDeco(144, 123, D.PLANTER);
    // Castle entrance sign
    setDeco(140, 118, D.SIGN_POST);

    // Village decorations
    var vils = [SETTLEMENTS.millhaven, SETTLEMENTS.thornfield];
    for (var vi = 0; vi < vils.length; vi++) {
      var v = vils[vi];
      setDeco(v.x, v.y, D.WELL);      // well at center
      setDeco(v.x - 6, v.y - 1, D.BARREL);
      setDeco(v.x + 7, v.y + 2, D.CRATE);
      setDeco(v.x - 2, v.y + 5, D.BENCH);
    }

    // Fences around farmland (Millhaven)
    for (var x = 49; x < 83; x++) { setDeco(x, 169, D.FENCE_H); setDeco(x, 185, D.FENCE_H); }
    for (var y = 169; y < 186; y++) { setDeco(49, y, D.FENCE_V); setDeco(83, y, D.FENCE_V); }
    // Scarecrows
    setDeco(60, 176, D.SCARECROW); setDeco(74, 178, D.SCARECROW);
    // Hay bales
    setDeco(52, 172, D.HAY_BALE); setDeco(78, 180, D.HAY_BALE); setDeco(65, 183, D.HAY_BALE);

    // Bandit camp
    setDeco(200, 80, D.CAMPFIRE);
    setDeco(198, 78, D.LOG_PILE); setDeco(203, 82, D.LOG_PILE);
    setDeco(196, 81, D.BARREL); setDeco(204, 79, D.CRATE);

    // Thornfield woodcutter area
    setDeco(58, 58, D.LOG_PILE); setDeco(60, 57, D.LOG_PILE);

    // Road signs
    setDeco(90, 152, D.SIGN_POST); // fork toward town
    setDeco(76, 66, D.SIGN_POST);  // fork near thornfield

    // === GRAVEYARD (just outside town, NW corner) ===
    for (var y = 104; y <= 107; y++)
      for (var x = 100; x <= 106; x++) setTile(x, y, T.GRASS);
    for (var x = 100; x <= 106; x++) setDeco(x, 103, D.FENCE_H);
    for (var y = 103; y <= 107; y++) { setDeco(99, y, D.FENCE_V); setDeco(107, y, D.FENCE_V); }
    setDeco(101, 105, D.GRAVESTONE); setDeco(103, 105, D.GRAVESTONE);
    setDeco(105, 105, D.GRAVESTONE); setDeco(102, 107, D.GRAVESTONE);
    setDeco(104, 107, D.GRAVESTONE);

    // === TRAINING YARD decorations ===
    setDeco(121, 143, D.BARREL); // archery target stand-in
    setDeco(125, 143, D.BARREL);
    setDeco(123, 145, D.SIGN_POST);

    // === NOBLE GARDEN ===
    setDeco(143, 112, D.PLANTER); setDeco(145, 112, D.PLANTER);
    setDeco(143, 114, D.FLOWERS); setDeco(144, 114, D.FLOWERS); setDeco(145, 114, D.FLOWERS);
    setDeco(142, 113, D.BENCH);

    // === DOCK / PIER on river (near Millhaven, south of bridge) ===
    for (var dy = 0; dy < 5; dy++) {
      setTile(37, 135 + dy, T.BRIDGE);
      setTile(38, 135 + dy, T.BRIDGE);
    }
    setDeco(37, 135, D.BARREL);
    setDeco(38, 139, D.CRATE);

    // === More scatter through the world ===
    // Roadside details: carts, water buckets
    setDeco(95, 155, D.CART); setDeco(80, 100, D.CART);
    setDeco(100, 160, D.WATER_BUCKET); setDeco(60, 68, D.WATER_BUCKET);

    // Benches on village outskirts
    setDeco(60, 185, D.BENCH); setDeco(72, 60, D.BENCH);

    // Barrels near tavern entrance
    setDeco(116, 130, D.BARREL); setDeco(117, 130, D.BARREL);

    // Extra hay bales near town farms
    setDeco(120, 158, D.HAY_BALE); setDeco(135, 160, D.HAY_BALE);

    // Extra torches at village centers
    setDeco(64, 190, D.TORCH); setDeco(68, 190, D.TORCH);
    setDeco(64, 64, D.TORCH); setDeco(68, 64, D.TORCH);

    // Log pile at woodcutter area expanded
    setDeco(56, 59, D.LOG_PILE); setDeco(62, 58, D.LOG_PILE); setDeco(57, 56, D.LOG_PILE);
  }

  function placeBuilding(bx, by, w, h, wallType, floorType, bType) {
    var b = { x: bx, y: by, w: w, h: h, type: bType, wallType: wallType, doorX: bx + Math.floor(w / 2), doorY: by + h - 1 };
    for (var y = by; y < by + h; y++)
      for (var x = bx; x < bx + w; x++) {
        if (x === bx || x === bx + w - 1 || y === by || y === by + h - 1)
          setTile(x, y, wallType);
        else
          setTile(x, y, floorType);
        treeMap[y * WORLD_TILES + x] = 0;
        decoMap[y * WORLD_TILES + x] = 0;
      }
    var dx = bx + Math.floor(w / 2);
    setTile(dx, by + h - 1, T.DOOR);
    if (w > 4) setTile(dx - 1, by + h - 1, T.DOOR);
    buildings.push(b);
  }

  function storeLocations() {
    locations.millhaven = { x: 66, y: 190, name: 'Millhaven' };
    locations.thornfield = { x: 66, y: 64, name: 'Thornfield' };
    locations.banditCamp = { x: 200, y: 80, name: 'Bandit Camp' };
    locations.playerStart = { x: 66, y: 195, name: 'Player Start' };
  }

  // ======= CHUNK RENDERING =======

  function renderChunk(cx, cy) {
    var key = cx + ',' + cy;
    if (chunkCanvases[key] && !chunkDirty[key]) return chunkCanvases[key];
    var cvs = chunkCanvases[key];
    if (!cvs) {
      cvs = document.createElement('canvas');
      cvs.width = CHUNK_SIZE * TILE_SIZE;
      cvs.height = CHUNK_SIZE * TILE_SIZE;
      chunkCanvases[key] = cvs;
    }
    var ctx = cvs.getContext('2d');
    var baseX = cx * CHUNK_SIZE, baseY = cy * CHUNK_SIZE;

    for (var ty = 0; ty < CHUNK_SIZE; ty++)
      for (var tx = 0; tx < CHUNK_SIZE; tx++) {
        var wx = baseX + tx, wy = baseY + ty;
        var tile = tileAt(wx, wy);
        var px = tx * TILE_SIZE, py = ty * TILE_SIZE;
        drawTile(ctx, px, py, tile, wx, wy);
      }
    // Second pass: decorations & trees (so they draw on top of adjacent tiles)
    for (var ty = 0; ty < CHUNK_SIZE; ty++)
      for (var tx = 0; tx < CHUNK_SIZE; tx++) {
        var wx = baseX + tx, wy = baseY + ty;
        var px = tx * TILE_SIZE, py = ty * TILE_SIZE;
        var d = getDeco(wx, wy);
        if (d) drawDeco(ctx, px, py, d, wx, wy);
        if (hasTree(wx, wy)) drawTree(ctx, px, py, wx, wy);
      }
    chunkDirty[key] = false;
    return cvs;
  }

  // ======= TILE DRAWING (ENHANCED) =======

  function drawTile(ctx, px, py, tile, wx, wy) {
    var nv = U.noise2D(wx * 0.5, wy * 0.5, seed + 800) * 15;
    var h2 = U.hash2D(wx, wy, seed + 850);
    var S = TILE_SIZE;

    switch (tile) {
      case T.GRASS:
        ctx.fillStyle = U.colorStr(74 + nv | 0, 124 + nv | 0, 63 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Varied grass blades
        if (h2 > 0.55) {
          ctx.fillStyle = U.colorStr(60 + nv | 0, 132 + nv | 0, 50 + nv | 0);
          var gx = (h2 * 20) | 0, gy = ((h2 * 97) % 20) | 0;
          ctx.fillRect(px + gx + 2, py + gy + 2, 1, 5);
          ctx.fillRect(px + ((gx + 11) % 28) + 2, py + ((gy + 7) % 24) + 2, 1, 4);
          ctx.fillRect(px + ((gx + 19) % 28) + 2, py + ((gy + 15) % 24) + 2, 1, 6);
        }
        // Occasional tiny flower
        if (h2 > 0.95) {
          var fc = ['#d44','#dd4','#d8d','#4ad','#fa4'][(h2 * 50) | 0 % 5];
          ctx.fillStyle = fc;
          ctx.fillRect(px + (h2 * 24 | 0) + 4, py + (h2 * 60 % 24 | 0) + 4, 2, 2);
        }
        // Soft edge blending with adjacent different tiles
        drawTileEdges(ctx, px, py, wx, wy, tile, nv);
        break;

      case T.DIRT:
        ctx.fillStyle = U.colorStr(139 + nv | 0, 115 + nv | 0, 85 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Pebbles
        if (h2 > 0.6) {
          ctx.fillStyle = U.colorStr(120 + nv | 0, 100 + nv | 0, 72 + nv | 0);
          ctx.fillRect(px + (h2 * 22 | 0) + 3, py + (h2 * 55 % 22 | 0) + 5, 3, 2);
          ctx.fillRect(px + ((h2 * 37 | 0) % 24) + 4, py + ((h2 * 73 | 0) % 22) + 4, 2, 2);
        }
        break;

      case T.ROAD:
        ctx.fillStyle = U.colorStr(155 + nv | 0, 135 + nv | 0, 105 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Wheel ruts
        ctx.fillStyle = U.colorStr(140 + nv | 0, 118 + nv | 0, 88 + nv | 0);
        ctx.fillRect(px + 8, py, 3, S);
        ctx.fillRect(px + 20, py, 3, S);
        // Scattered pebbles/gravel
        if (h2 > 0.5) {
          ctx.fillStyle = U.colorStr(165 + nv | 0, 145 + nv | 0, 115 + nv | 0);
          ctx.fillRect(px + (h2 * 18 | 0) + 2, py + (h2 * 50 % 20 | 0) + 6, 2, 2);
          ctx.fillRect(px + (h2 * 43 % 24 | 0) + 4, py + (h2 * 71 % 20 | 0) + 3, 3, 1);
        }
        break;

      case T.WATER:
        var wn = U.noise2D(wx * 0.3, wy * 0.3, seed + 1000) * 20;
        ctx.fillStyle = U.colorStr(48 + wn | 0, 100 + wn | 0, 155 + wn | 0);
        ctx.fillRect(px, py, S, S);
        // Varied ripples
        ctx.fillStyle = 'rgba(100,170,210,0.25)';
        var rx1 = ((wx * 7 + wy * 13) % 17) + 3, ry1 = ((wx * 11 + wy * 3) % 13) + 4;
        ctx.fillRect(px + rx1, py + ry1, 7, 1);
        if (h2 > 0.4) {
          ctx.fillRect(px + ((rx1 + 9) % 22) + 3, py + ((ry1 + 11) % 22) + 5, 5, 1);
        }
        // Depth shading at edges
        if (tileAt(wx, wy - 1) !== T.WATER && tileAt(wx, wy - 1) !== T.DEEP_WATER) {
          ctx.fillStyle = 'rgba(80,140,180,0.3)';
          ctx.fillRect(px, py, S, 4);
        }
        break;

      case T.DEEP_WATER:
        ctx.fillStyle = U.colorStr(25, 60, 120);
        ctx.fillRect(px, py, S, S);
        break;

      case T.FOREST_FLOOR:
        ctx.fillStyle = U.colorStr(42 + nv | 0, 85 + nv | 0, 28 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Leaf litter
        if (h2 > 0.5) {
          ctx.fillStyle = U.colorStr(55 + nv | 0, 75 + nv | 0, 22 + nv | 0);
          ctx.fillRect(px + (h2 * 18 | 0) + 4, py + (h2 * 50 % 20 | 0) + 4, 4, 3);
        }
        if (h2 > 0.7) {
          ctx.fillStyle = U.colorStr(70 + nv | 0, 55 + nv | 0, 20 + nv | 0);
          ctx.fillRect(px + (h2 * 35 % 22 | 0) + 3, py + (h2 * 67 % 22 | 0) + 3, 3, 2);
        }
        break;

      case T.STONE_FLOOR:
        ctx.fillStyle = U.colorStr(148 + nv | 0, 145 + nv | 0, 140 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Offset stone tile pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + S / 2); ctx.lineTo(px + S, py + S / 2);
        var off = (wy % 2) ? S / 3 : 2 * S / 3;
        ctx.moveTo(px + off, py); ctx.lineTo(px + off, py + S / 2);
        ctx.moveTo(px + (off + S / 2) % S, py + S / 2); ctx.lineTo(px + (off + S / 2) % S, py + S);
        ctx.stroke();
        break;

      case T.WALL_STONE:
        // Check if this is a tower corner
        var isTower = isCornerTower(wx, wy);
        var baseR = isTower ? 85 : 100;
        var baseG = isTower ? 85 : 100;
        var baseB = isTower ? 92 : 105;
        ctx.fillStyle = U.colorStr(baseR + nv | 0, baseG + nv | 0, baseB + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Top shading
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px, py, S, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px, py + 3, S, 2);
        // Stone blocks
        ctx.strokeStyle = 'rgba(0,0,0,0.13)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + S / 2); ctx.lineTo(px + S, py + S / 2);
        ctx.moveTo(px + S / 2, py); ctx.lineTo(px + S / 2, py + S / 2);
        ctx.moveTo(px + S / 4, py + S / 2); ctx.lineTo(px + S / 4, py + S);
        ctx.moveTo(px + 3 * S / 4, py + S / 2); ctx.lineTo(px + 3 * S / 4, py + S);
        ctx.stroke();
        // Crenellations on outer walls
        if (isTower) {
          ctx.fillStyle = U.colorStr(75 + nv | 0, 75 + nv | 0, 80 + nv | 0);
          ctx.fillRect(px + 2, py + 2, 4, 4);
          ctx.fillRect(px + S - 6, py + 2, 4, 4);
          ctx.fillRect(px + 2, py + S - 6, 4, 4);
          ctx.fillRect(px + S - 6, py + S - 6, 4, 4);
        }
        // Window on long wall sections
        if (!isTower && h2 > 0.7 && isInteriorWall(wx, wy)) {
          ctx.fillStyle = 'rgba(40,35,25,0.6)';
          ctx.fillRect(px + 12, py + 8, 8, 10);
          ctx.fillStyle = 'rgba(180,160,100,0.15)';
          ctx.fillRect(px + 13, py + 9, 6, 8);
          // Window frame
          ctx.strokeStyle = 'rgba(60,50,30,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 12, py + 8, 8, 10);
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 8); ctx.lineTo(px + 16, py + 18);
          ctx.stroke();
        }
        break;

      case T.WALL_WOOD:
        ctx.fillStyle = U.colorStr(107 + nv | 0, 68 + nv | 0, 35 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Horizontal planks
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 5; i < S; i += 8) {
          ctx.moveTo(px, py + i); ctx.lineTo(px + S, py + i);
        }
        ctx.stroke();
        // Highlight strip
        ctx.fillStyle = 'rgba(255,220,160,0.06)';
        ctx.fillRect(px, py + 3, S, 3);
        // Window
        if (h2 > 0.65 && isInteriorWall(wx, wy)) {
          ctx.fillStyle = 'rgba(35,30,20,0.55)';
          ctx.fillRect(px + 10, py + 7, 12, 10);
          ctx.fillStyle = 'rgba(200,180,120,0.12)';
          ctx.fillRect(px + 11, py + 8, 10, 8);
          ctx.strokeStyle = 'rgba(80,55,25,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 10, py + 7, 12, 10);
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 7); ctx.lineTo(px + 16, py + 17);
          ctx.moveTo(px + 10, py + 12); ctx.lineTo(px + 22, py + 12);
          ctx.stroke();
        }
        break;

      case T.DOOR:
        ctx.fillStyle = U.colorStr(120 + nv | 0, 82 + nv | 0, 42 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Door panels
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(px + 3, py + 2, S / 2 - 4, S - 4);
        ctx.fillRect(px + S / 2 + 1, py + 2, S / 2 - 4, S - 4);
        // Handle
        ctx.fillStyle = '#c8a840';
        ctx.beginPath();
        ctx.arc(px + S - 8, py + S / 2, 2, 0, Math.PI * 2);
        ctx.fill();
        // Threshold
        ctx.fillStyle = 'rgba(80,60,30,0.3)';
        ctx.fillRect(px, py + S - 3, S, 3);
        break;

      case T.FARMLAND:
        ctx.fillStyle = U.colorStr(100 + nv | 0, 85 + nv | 0, 50 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Furrows
        ctx.fillStyle = U.colorStr(80 + nv | 0, 68 + nv | 0, 38 + nv | 0);
        for (var r = 3; r < S; r += 6) ctx.fillRect(px, py + r, S, 2);
        // Crop variation
        var cropPhase = ((wx + wy * 3) % 4);
        if (cropPhase < 2) {
          ctx.fillStyle = U.colorStr(85 + nv | 0, 135 + nv | 0, 55 + nv | 0);
          for (var r = 1; r < S; r += 6) ctx.fillRect(px + 3, py + r, S - 6, 2);
        } else {
          ctx.fillStyle = U.colorStr(140 + nv | 0, 130 + nv | 0, 60 + nv | 0);
          for (var r = 0; r < S; r += 6) ctx.fillRect(px + 4, py + r, S - 8, 1);
        }
        break;

      case T.SAND:
        ctx.fillStyle = U.colorStr(201 + nv | 0, 181 + nv | 0, 125 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Sand dunes texture
        if (h2 > 0.4) {
          ctx.fillStyle = U.colorStr(210 + nv | 0, 190 + nv | 0, 135 + nv | 0);
          ctx.beginPath();
          ctx.moveTo(px, py + 14 + h2 * 6);
          ctx.quadraticCurveTo(px + S / 2, py + 10 + h2 * 4, px + S, py + 16 + h2 * 5);
          ctx.lineTo(px + S, py + 20 + h2 * 5);
          ctx.quadraticCurveTo(px + S / 2, py + 16 + h2 * 4, px, py + 18 + h2 * 6);
          ctx.fill();
        }
        break;

      case T.WOOD_FLOOR:
        ctx.fillStyle = U.colorStr(135 + nv | 0, 102 + nv | 0, 58 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Plank lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 0; i < S; i += 8) { ctx.moveTo(px, py + i); ctx.lineTo(px + S, py + i); }
        ctx.stroke();
        // Knots
        if (h2 > 0.8) {
          ctx.fillStyle = 'rgba(90,60,25,0.3)';
          ctx.beginPath();
          ctx.arc(px + (h2 * 22 | 0) + 5, py + (h2 * 50 % 22 | 0) + 5, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case T.BRIDGE:
        ctx.fillStyle = U.colorStr(115 + nv | 0, 80 + nv | 0, 42 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Planks
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 4; i < S; i += 6) { ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + S); }
        ctx.stroke();
        // Rails with posts
        ctx.fillStyle = 'rgba(75,48,18,0.9)';
        ctx.fillRect(px, py, 4, S);
        ctx.fillRect(px + S - 4, py, 4, S);
        // Rail posts
        ctx.fillStyle = 'rgba(60,38,12,0.9)';
        for (var i = 0; i < S; i += 12) {
          ctx.fillRect(px, py + i, 4, 6);
          ctx.fillRect(px + S - 4, py + i, 4, 6);
        }
        // Rope rail
        ctx.strokeStyle = 'rgba(140,120,80,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 2, py); ctx.lineTo(px + 2, py + S);
        ctx.moveTo(px + S - 2, py); ctx.lineTo(px + S - 2, py + S);
        ctx.stroke();
        break;

      case T.MARKET_STONE:
        ctx.fillStyle = U.colorStr(162 + nv | 0, 157 + nv | 0, 147 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Alternating stone pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        var checkerOff = (wx + wy) % 2;
        if (checkerOff) {
          ctx.fillStyle = U.colorStr(155 + nv | 0, 150 + nv | 0, 140 + nv | 0);
          ctx.fillRect(px + 1, py + 1, S - 2, S - 2);
        }
        ctx.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
        break;

      default:
        ctx.fillStyle = '#555';
        ctx.fillRect(px, py, S, S);
    }
  }

  function drawTileEdges(ctx, px, py, wx, wy, tile, nv) {
    var S = TILE_SIZE;
    // Subtle grass-to-dirt/road transition
    var neighbors = [
      [0, -1, px, py, S, 3],     // top
      [0, 1, px, py + S - 3, S, 3],  // bottom
      [-1, 0, px, py, 3, S],     // left
      [1, 0, px + S - 3, py, 3, S]   // right
    ];
    for (var i = 0; i < neighbors.length; i++) {
      var nb = neighbors[i];
      var nt = tileAt(wx + nb[0], wy + nb[1]);
      if (nt !== tile && nt !== T.WATER && nt !== T.DEEP_WATER && nt !== T.WALL_STONE && nt !== T.WALL_WOOD) {
        ctx.fillStyle = 'rgba(139,115,85,0.15)';
        ctx.fillRect(nb[2], nb[3], nb[4], nb[5]);
      }
    }
  }

  function isCornerTower(wx, wy) {
    var w = TOWN_WALLS;
    return (wx >= w.x1 && wx <= w.x1 + 2 && wy >= w.y1 && wy <= w.y1 + 2) ||
           (wx >= w.x2 - 2 && wx <= w.x2 && wy >= w.y1 && wy <= w.y1 + 2) ||
           (wx >= w.x1 && wx <= w.x1 + 2 && wy >= w.y2 - 2 && wy <= w.y2) ||
           (wx >= w.x2 - 2 && wx <= w.x2 && wy >= w.y2 - 2 && wy <= w.y2);
  }

  function isInteriorWall(wx, wy) {
    // Wall tile that has floor on at least one interior side (so window makes sense)
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var i = 0; i < dirs.length; i++) {
      var nt = tileAt(wx + dirs[i][0], wy + dirs[i][1]);
      if (nt === T.WOOD_FLOOR || nt === T.STONE_FLOOR) return true;
    }
    return false;
  }

  // ======= DECORATION DRAWING =======

  function drawDeco(ctx, px, py, deco, wx, wy) {
    var v = getDecoVar(wx, wy);
    var S = TILE_SIZE;
    ctx.save();

    switch (deco) {
      case D.FLOWERS:
        var colors = ['#e04040','#e0d040','#d060d0','#4090e0','#e08030'];
        for (var i = 0; i < 3; i++) {
          var fx = (v * (i + 1) * 7 % 22) + 5;
          var fy = (v * (i + 1) * 11 % 20) + 6;
          ctx.fillStyle = colors[(v + i) % 5];
          ctx.fillRect(px + fx, py + fy, 3, 3);
          ctx.fillStyle = '#3a6a2a';
          ctx.fillRect(px + fx + 1, py + fy + 3, 1, 3);
        }
        break;

      case D.SMALL_ROCK:
        ctx.fillStyle = U.colorStr(130 + (v % 20), 125 + (v % 15), 115 + (v % 18));
        var rw = 4 + (v % 4), rh = 3 + (v % 3);
        ctx.beginPath();
        ctx.ellipse(px + 14 + (v % 8), py + 18 + (v % 6), rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(px + 13 + (v % 8), py + 17 + (v % 6), rw * 0.5, rh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case D.MUSHROOM:
        var mx = px + 12 + (v % 10), my = py + 16 + (v % 8);
        ctx.fillStyle = '#c8b090';
        ctx.fillRect(mx + 2, my + 2, 2, 5);
        ctx.fillStyle = (v % 2) ? '#a03020' : '#b08030';
        ctx.beginPath();
        ctx.ellipse(mx + 3, my + 1, 4, 3, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        if (v % 2) {
          ctx.fillStyle = '#e0d0c0';
          ctx.fillRect(mx + 1, my, 1, 1);
          ctx.fillRect(mx + 4, my - 1, 1, 1);
        }
        break;

      case D.TALL_GRASS:
        ctx.fillStyle = U.colorStr(55, 120, 40);
        for (var i = 0; i < 4; i++) {
          var gx = px + 6 + (v * (i + 1) * 5 % 18);
          var gy = py + 10 + (v * (i + 1) * 3 % 14);
          ctx.fillRect(gx, gy, 1, 8 + (v % 4));
          ctx.fillRect(gx + 1, gy + 1, 1, 6 + (v % 3));
        }
        break;

      case D.BUSH:
        var bx = px + 8 + (v % 10), by = py + 10 + (v % 8);
        ctx.fillStyle = U.colorStr(35 + (v % 15), 80 + (v % 20), 25 + (v % 10));
        ctx.beginPath();
        ctx.ellipse(bx + 6, by + 4, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = U.colorStr(45 + (v % 15), 95 + (v % 20), 35 + (v % 10));
        ctx.beginPath();
        ctx.ellipse(bx + 4, by + 2, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case D.HAY_BALE:
        ctx.fillStyle = '#c8a848';
        ctx.fillRect(px + 6, py + 10, 20, 14);
        ctx.fillStyle = '#b89838';
        ctx.strokeStyle = '#a08828';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 6, py + 10, 20, 14);
        // Straw lines
        ctx.beginPath();
        for (var i = 9; i < 24; i += 4) { ctx.moveTo(px + i, py + 10); ctx.lineTo(px + i, py + 24); }
        ctx.stroke();
        // Highlight
        ctx.fillStyle = 'rgba(255,240,180,0.2)';
        ctx.fillRect(px + 7, py + 11, 18, 3);
        break;

      case D.BARREL:
        ctx.fillStyle = '#6a4820';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 18, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5828';
        ctx.fillRect(px + 9, py + 8, 14, 16);
        // Bands
        ctx.strokeStyle = '#4a3210';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 9, py + 12); ctx.lineTo(px + 23, py + 12);
        ctx.moveTo(px + 9, py + 20); ctx.lineTo(px + 23, py + 20);
        ctx.stroke();
        // Top
        ctx.fillStyle = '#5a3818';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 8, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case D.CRATE:
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 8, py + 10, 16, 14);
        ctx.strokeStyle = '#5a4018';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 8, py + 10, 16, 14);
        // Cross planks
        ctx.beginPath();
        ctx.moveTo(px + 8, py + 10); ctx.lineTo(px + 24, py + 24);
        ctx.moveTo(px + 24, py + 10); ctx.lineTo(px + 8, py + 24);
        ctx.stroke();
        // Lid highlight
        ctx.fillStyle = 'rgba(200,180,120,0.15)';
        ctx.fillRect(px + 9, py + 11, 14, 3);
        break;

      case D.MARKET_STALL:
        // Posts
        ctx.fillStyle = '#6a4a20';
        ctx.fillRect(px + 2, py + 4, 3, 24);
        ctx.fillRect(px + 27, py + 4, 3, 24);
        // Counter
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 2, py + 16, 28, 4);
        // Awning
        var awningColors = ['#a03030','#3060a0','#308030','#a06020'];
        ctx.fillStyle = awningColors[v % 4];
        ctx.fillRect(px, py + 2, S, 6);
        // Awning stripes
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (var i = 2; i < S; i += 6) ctx.fillRect(px + i, py + 2, 3, 6);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(px + 2, py + 8, 28, 8);
        // Goods on counter
        ctx.fillStyle = '#b89838';
        ctx.fillRect(px + 8, py + 14, 5, 3);
        ctx.fillStyle = '#8a4a2a';
        ctx.fillRect(px + 16, py + 14, 4, 3);
        ctx.fillStyle = '#5a8a3a';
        ctx.fillRect(px + 22, py + 14, 4, 3);
        break;

      case D.WELL:
        // Stone base
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 20, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a8a8a';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 20, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Water inside
        ctx.fillStyle = 'rgba(50,100,160,0.6)';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 20, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Roof frame
        ctx.fillStyle = '#5a3818';
        ctx.fillRect(px + 6, py + 2, 3, 18);
        ctx.fillRect(px + 23, py + 2, 3, 18);
        ctx.fillRect(px + 5, py + 2, 22, 3);
        // Bucket
        ctx.fillStyle = '#7a5828';
        ctx.fillRect(px + 13, py + 6, 6, 5);
        // Rope
        ctx.strokeStyle = '#a09060';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 3); ctx.lineTo(px + 16, py + 7);
        ctx.stroke();
        break;

      case D.FENCE_H:
        ctx.fillStyle = '#7a5a28';
        // Posts
        ctx.fillRect(px, py + 12, 3, 12);
        ctx.fillRect(px + S - 3, py + 12, 3, 12);
        // Rails
        ctx.fillRect(px, py + 14, S, 2);
        ctx.fillRect(px, py + 20, S, 2);
        break;

      case D.FENCE_V:
        ctx.fillStyle = '#7a5a28';
        ctx.fillRect(px + 12, py, 12, 3);
        ctx.fillRect(px + 12, py + S - 3, 12, 3);
        ctx.fillRect(px + 14, py, 2, S);
        ctx.fillRect(px + 20, py, 2, S);
        break;

      case D.CAMPFIRE:
        // Stone ring
        ctx.fillStyle = '#6a6a6a';
        var cx = px + 16, cy = py + 18;
        for (var a = 0; a < 8; a++) {
          var ang = a * Math.PI / 4;
          ctx.fillRect(cx + Math.cos(ang) * 8 - 2, cy + Math.sin(ang) * 6 - 2, 4, 4);
        }
        // Charred ground
        ctx.fillStyle = 'rgba(30,20,10,0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Logs
        ctx.fillStyle = '#4a2a10';
        ctx.fillRect(cx - 6, cy - 2, 12, 3);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(1.2);
        ctx.fillRect(-5, -1, 10, 3);
        ctx.restore();
        // Embers (static)
        ctx.fillStyle = '#e06020';
        ctx.fillRect(cx - 2, cy - 3, 4, 3);
        ctx.fillStyle = '#f0a020';
        ctx.fillRect(cx - 1, cy - 4, 2, 2);
        break;

      case D.ANVIL:
        ctx.fillStyle = '#4a4a4a';
        // Base
        ctx.fillRect(px + 10, py + 18, 12, 6);
        // Body
        ctx.fillRect(px + 8, py + 12, 16, 6);
        // Horn
        ctx.fillRect(px + 6, py + 14, 4, 3);
        // Highlight
        ctx.fillStyle = 'rgba(200,200,200,0.15)';
        ctx.fillRect(px + 9, py + 12, 14, 2);
        break;

      case D.SIGN_POST:
        // Post
        ctx.fillStyle = '#6a4a20';
        ctx.fillRect(px + 14, py + 8, 4, 20);
        // Sign board
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 6, py + 6, 20, 10);
        ctx.strokeStyle = '#5a3a10';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 6, py + 6, 20, 10);
        // Text line
        ctx.fillStyle = '#3a2a10';
        ctx.fillRect(px + 9, py + 10, 14, 1);
        ctx.fillRect(px + 11, py + 13, 10, 1);
        break;

      case D.LOG_PILE:
        var logColors = ['#5a3a18','#6a4220','#4a3014'];
        for (var i = 0; i < 4; i++) {
          ctx.fillStyle = logColors[i % 3];
          ctx.beginPath();
          ctx.ellipse(px + 8 + i * 5, py + 20, 3, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        for (var i = 0; i < 3; i++) {
          ctx.fillStyle = logColors[(i + 1) % 3];
          ctx.beginPath();
          ctx.ellipse(px + 10 + i * 5, py + 13, 3, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // End circles
        ctx.fillStyle = '#b09060';
        for (var i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(px + 8 + i * 5, py + 20, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case D.SCARECROW:
        // Post
        ctx.fillStyle = '#6a4a18';
        ctx.fillRect(px + 14, py + 8, 4, 22);
        // Arms
        ctx.fillRect(px + 6, py + 12, 20, 3);
        // Head
        ctx.fillStyle = '#c8a860';
        ctx.beginPath();
        ctx.arc(px + 16, py + 7, 5, 0, Math.PI * 2);
        ctx.fill();
        // Hat
        ctx.fillStyle = '#5a3a10';
        ctx.fillRect(px + 10, py + 1, 12, 4);
        ctx.fillRect(px + 12, py - 2, 8, 4);
        // Shirt
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(px + 12, py + 14, 8, 8);
        // Straw bits
        ctx.fillStyle = '#d0b050';
        ctx.fillRect(px + 5, py + 14, 2, 4);
        ctx.fillRect(px + 25, py + 14, 2, 4);
        break;

      case D.BENCH:
        ctx.fillStyle = '#6a4a20';
        // Legs
        ctx.fillRect(px + 6, py + 16, 3, 10);
        ctx.fillRect(px + 23, py + 16, 3, 10);
        // Seat
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 4, py + 14, 24, 4);
        // Back
        ctx.fillRect(px + 4, py + 8, 24, 3);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(px + 6, py + 26, 20, 2);
        break;

      case D.TORCH:
        // Bracket
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(px + 14, py + 14, 4, 10);
        // Flame
        ctx.fillStyle = '#e08020';
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 8);
        ctx.lineTo(px + 12, py + 14);
        ctx.lineTo(px + 20, py + 14);
        ctx.fill();
        ctx.fillStyle = '#f0c040';
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 10);
        ctx.lineTo(px + 14, py + 14);
        ctx.lineTo(px + 18, py + 14);
        ctx.fill();
        // Glow
        ctx.fillStyle = 'rgba(240,160,40,0.08)';
        ctx.beginPath();
        ctx.arc(px + 16, py + 12, 10, 0, Math.PI * 2);
        ctx.fill();
        break;

      case D.BANNER:
        // Pole
        ctx.fillStyle = '#7a6a5a';
        ctx.fillRect(px + 15, py + 2, 2, 28);
        // Flag
        ctx.fillStyle = '#8a2020';
        ctx.beginPath();
        ctx.moveTo(px + 17, py + 4);
        ctx.lineTo(px + 28, py + 8);
        ctx.lineTo(px + 17, py + 14);
        ctx.fill();
        // Emblem stripe
        ctx.fillStyle = '#d4a030';
        ctx.fillRect(px + 18, py + 8, 8, 2);
        break;

      case D.GRAVESTONE:
        // Stone slab
        ctx.fillStyle = '#8a8a88';
        ctx.fillRect(px + 10, py + 8, 12, 16);
        // Rounded top
        ctx.beginPath();
        ctx.arc(px + 16, py + 8, 6, Math.PI, Math.PI * 2);
        ctx.fill();
        // Cross etching
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 6); ctx.lineTo(px + 16, py + 16);
        ctx.moveTo(px + 13, py + 10); ctx.lineTo(px + 19, py + 10);
        ctx.stroke();
        // Moss
        ctx.fillStyle = 'rgba(60,90,40,0.3)';
        ctx.fillRect(px + 10, py + 20, 5, 4);
        // Ground mound
        ctx.fillStyle = 'rgba(80,65,40,0.3)';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 26, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case D.CART:
        // Wheels
        ctx.fillStyle = '#5a3a18';
        ctx.beginPath();
        ctx.arc(px + 6, py + 22, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + 26, py + 22, 5, 0, Math.PI * 2);
        ctx.stroke();
        // Spokes
        ctx.strokeStyle = '#5a3a18';
        ctx.lineWidth = 1;
        for (var sp = 0; sp < 4; sp++) {
          var a = sp * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(px + 6, py + 22);
          ctx.lineTo(px + 6 + Math.cos(a) * 4, py + 22 + Math.sin(a) * 4);
          ctx.moveTo(px + 26, py + 22);
          ctx.lineTo(px + 26 + Math.cos(a) * 4, py + 22 + Math.sin(a) * 4);
          ctx.stroke();
        }
        // Cart body
        ctx.fillStyle = '#7a5a28';
        ctx.fillRect(px + 3, py + 8, 26, 12);
        ctx.strokeStyle = '#4a3010';
        ctx.strokeRect(px + 3, py + 8, 26, 12);
        // Handle
        ctx.fillStyle = '#6a4a20';
        ctx.fillRect(px - 2, py + 14, 6, 2);
        // Cargo
        ctx.fillStyle = '#b0a060';
        ctx.fillRect(px + 6, py + 6, 8, 4);
        ctx.fillStyle = '#8a6030';
        ctx.fillRect(px + 16, py + 5, 10, 5);
        break;

      case D.WATER_BUCKET:
        // Bucket body
        ctx.fillStyle = '#6a5028';
        ctx.beginPath();
        ctx.moveTo(px + 10, py + 12);
        ctx.lineTo(px + 8, py + 24);
        ctx.lineTo(px + 24, py + 24);
        ctx.lineTo(px + 22, py + 12);
        ctx.fill();
        // Metal band
        ctx.strokeStyle = '#5a5a5a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 9, py + 16); ctx.lineTo(px + 23, py + 16);
        ctx.moveTo(px + 8, py + 22); ctx.lineTo(px + 24, py + 22);
        ctx.stroke();
        // Handle
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px + 16, py + 10, 5, Math.PI, Math.PI * 2);
        ctx.stroke();
        // Water inside
        ctx.fillStyle = 'rgba(60,110,170,0.4)';
        ctx.fillRect(px + 10, py + 13, 12, 3);
        break;

      case D.PLANTER:
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(px + 8, py + 14, 16, 10);
        ctx.strokeStyle = '#4a3018';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 8, py + 14, 16, 10);
        // Soil
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(px + 9, py + 14, 14, 3);
        // Plant
        ctx.fillStyle = '#3a8a3a';
        ctx.fillRect(px + 14, py + 6, 2, 8);
        ctx.beginPath();
        ctx.arc(px + 12, py + 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + 19, py + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        // Flower
        ctx.fillStyle = '#d05050';
        ctx.beginPath();
        ctx.arc(px + 15, py + 5, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  // ======= TREE DRAWING (ENHANCED) =======

  function drawTree(ctx, px, py, wx, wy) {
    var n = U.hash2D(wx, wy, seed + 1100);
    var n2 = U.hash2D(wx, wy, seed + 1150);
    var S = TILE_SIZE;
    var isPine = n2 > 0.55;

    if (isPine) {
      // Pine tree
      var treeH = 16 + n * 6;
      // Trunk
      ctx.fillStyle = U.colorStr(72, 48, 22);
      ctx.fillRect(px + S / 2 - 2, py + S - treeH + 4, 4, treeH - 4);
      // Triangular canopy layers
      var layerY = py + S - treeH;
      for (var layer = 0; layer < 3; layer++) {
        var lw = 14 - layer * 3;
        var lh = 7 + layer;
        var shade = (n * 25 + layer * 8) | 0;
        ctx.fillStyle = U.colorStr(25 + shade, 75 + shade, 20 + shade);
        ctx.beginPath();
        ctx.moveTo(px + S / 2, layerY);
        ctx.lineTo(px + S / 2 - lw / 2, layerY + lh);
        ctx.lineTo(px + S / 2 + lw / 2, layerY + lh);
        ctx.fill();
        layerY += lh - 3;
      }
      // Snow-like highlight on top
      ctx.fillStyle = U.colorStr(45 + (n * 20 | 0), 100 + (n * 15 | 0), 40 + (n * 10 | 0));
      ctx.beginPath();
      ctx.moveTo(px + S / 2, py + S - treeH);
      ctx.lineTo(px + S / 2 - 4, py + S - treeH + 5);
      ctx.lineTo(px + S / 2 + 4, py + S - treeH + 5);
      ctx.fill();
    } else {
      // Deciduous tree (oak-like)
      var treeH = 12 + n * 8;
      var canopyR = 8 + n * 6;
      // Shadow on ground
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.ellipse(px + S / 2 + 2, py + S, canopyR, canopyR * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trunk with taper
      var trunkW = 4 + n * 3;
      ctx.fillStyle = U.colorStr(82 + (n * 20 | 0), 55 + (n * 15 | 0), 25 + (n * 10 | 0));
      ctx.beginPath();
      ctx.moveTo(px + S / 2 - trunkW / 2, py + S);
      ctx.lineTo(px + S / 2 - trunkW / 2 + 1, py + S - treeH + 2);
      ctx.lineTo(px + S / 2 + trunkW / 2 - 1, py + S - treeH + 2);
      ctx.lineTo(px + S / 2 + trunkW / 2, py + S);
      ctx.fill();
      // Canopy (multiple overlapping circles for fullness)
      var cx = px + S / 2, cy = py + S - treeH - 2;
      var shade = n * 30 | 0;
      ctx.fillStyle = U.colorStr(30 + shade, 85 + shade, 22 + shade);
      ctx.beginPath(); ctx.arc(cx - 3, cy + 2, canopyR * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 3, cy + 1, canopyR * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = U.colorStr(35 + shade, 100 + shade, 25 + shade);
      ctx.beginPath(); ctx.arc(cx, cy, canopyR * 0.9, 0, Math.PI * 2); ctx.fill();
      // Highlight
      ctx.fillStyle = U.colorStr(50 + shade, 118 + shade, 38 + shade);
      ctx.beginPath(); ctx.arc(cx - 2, cy - 3, canopyR * 0.55, 0, Math.PI * 2); ctx.fill();
      // Leaf texture dots
      ctx.fillStyle = U.colorStr(25 + shade, 78 + shade, 18 + shade);
      for (var i = 0; i < 4; i++) {
        var lx = cx + ((n * (i + 1) * 13) % (canopyR * 1.4)) - canopyR * 0.7;
        var ly = cy + ((n * (i + 1) * 17) % (canopyR * 1.2)) - canopyR * 0.6;
        ctx.fillRect(lx | 0, ly | 0, 2, 2);
      }
    }
  }

  // ======= PUBLIC API =======

  function getLocationAt(px, py) {
    var tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE);
    if (tx >= TOWN_WALLS.x1 && tx <= TOWN_WALLS.x2 && ty >= TOWN_WALLS.y1 && ty <= TOWN_WALLS.y2) return 'ashford';
    if (U.dist(tx, ty, 66, 190) < 12) return 'millhaven';
    if (U.dist(tx, ty, 66, 64) < 12) return 'thornfield';
    if (U.dist(tx, ty, 200, 80) < 10) return 'banditCamp';
    if (tileAt(tx, ty) === T.FOREST_FLOOR) return 'forest';
    return 'wilderness';
  }

  function isRestricted(tx, ty) {
    return tx >= 137 && tx <= 145 && ty >= 111 && ty <= 117;
  }

  return {
    T: T, D: D, TILE_SIZE: TILE_SIZE, CHUNK_SIZE: CHUNK_SIZE,
    WORLD_TILES: WORLD_TILES, WORLD_CHUNKS: WORLD_CHUNKS,
    TILE_SOLID: TILE_SOLID,
    init: init, tileAt: tileAt, setTile: setTile,
    isSolid: isSolid, getSpeedMod: getSpeedMod,
    hasTree: hasTree, isForest: isForest,
    getDeco: getDeco, getDecoVar: getDecoVar,
    renderChunk: renderChunk, getLocationAt: getLocationAt,
    isRestricted: isRestricted, getBuildings: function () { return buildings; },
    getLocations: function () { return locations; }, SETTLEMENTS: SETTLEMENTS,
    TOWN_WALLS: TOWN_WALLS
  };
})();
