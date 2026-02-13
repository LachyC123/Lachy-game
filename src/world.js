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
  var treeMap = null; // separate layer for trees (can be on forest floor)
  var chunkCanvases = {};
  var chunkDirty = {};
  var buildings = [];
  var locations = {}; // named locations with coordinates
  var seed = 42;

  // Settlement definitions
  var TOWN_CENTER = { x: 128, y: 128 };
  var TOWN_RADIUS = 20;
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

  function isSolid(tx, ty) {
    var t = tileAt(tx, ty);
    return !!TILE_SOLID[t];
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

  // GENERATION FUNCTIONS

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
    // Force eastern forest zone
    for (var y = 25; y < 135; y++) {
      for (var x = 168; x < 245; x++) {
        var n = U.fbm(x * 0.05, y * 0.05, 2, seed + 100);
        if (n > 0.3) tiles[y * WORLD_TILES + x] = T.FOREST_FLOOR;
      }
    }
    // Force NW forest zone
    for (var y = 10; y < 52; y++) {
      for (var x = 20; x < 55; x++) {
        var n = U.fbm(x * 0.06, y * 0.06, 2, seed + 200);
        if (n > 0.35) tiles[y * WORLD_TILES + x] = T.FOREST_FLOOR;
      }
    }
  }

  function generateRiver() {
    var rx = 38;
    for (var y = 0; y < WORLD_TILES; y++) {
      rx += Math.floor(U.noise2D(y * 0.08, 0, seed + 300) * 3 - 1);
      rx = U.clamp(rx, 34, 42);
      for (var dx = -1; dx <= 1; dx++) {
        setTile(rx + dx, y, T.WATER);
      }
      if (U.rng() < 0.3) setTile(rx + 2, y, T.WATER);
      if (U.rng() < 0.3) setTile(rx - 2, y, T.WATER);
    }
    // Bridge near Thornfield
    for (var dx = -3; dx <= 3; dx++) {
      setTile(38 + dx, 64, T.BRIDGE);
      setTile(38 + dx, 65, T.BRIDGE);
    }
    // Bridge on road to town
    for (var dx = -3; dx <= 3; dx++) {
      setTile(38 + dx, 128, T.BRIDGE);
      setTile(38 + dx, 129, T.BRIDGE);
    }
  }

  function generateRoads() {
    // Road: Millhaven to town south gate
    drawRoad(66, 182, 128, 152, 2);
    drawRoad(128, 152, 128, 148, 2); // into gate
    // Road: Town west gate to Thornfield
    drawRoad(108, 128, 76, 64, 2);
    drawRoad(76, 64, 66, 64, 2);
    // Cross road bridge
    drawRoad(66, 64, 34, 64, 2);
    // Road: Millhaven to Thornfield (via west)
    drawRoad(56, 190, 56, 72, 1);
    // Extend road a bit into forest (bandit path)
    drawRoad(148, 120, 180, 90, 1);
    drawRoad(180, 90, 196, 80, 1);
    // Internal town roads
    drawRoad(110, 128, 146, 128, 2);
    drawRoad(128, 110, 128, 146, 2);
  }

  function drawRoad(x0, y0, x1, y1, width) {
    var points = U.bresenhamLine(x0, y0, x1, y1);
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      for (var dy = -width + 1; dy < width; dy++) {
        for (var dx = -width + 1; dx < width; dx++) {
          var tx = p.x + dx, ty = p.y + dy;
          var cur = tileAt(tx, ty);
          if (cur !== T.WATER && cur !== T.BRIDGE && cur !== T.WALL_STONE && cur !== T.WALL_WOOD) {
            setTile(tx, ty, T.ROAD);
          }
        }
      }
    }
  }

  function generateTown() {
    var w = TOWN_WALLS;
    // Clear town area
    for (var y = w.y1; y <= w.y2; y++) {
      for (var x = w.x1; x <= w.x2; x++) {
        setTile(x, y, T.DIRT);
      }
    }
    // Town walls
    for (var x = w.x1; x <= w.x2; x++) {
      setTile(x, w.y1, T.WALL_STONE);
      setTile(x, w.y1 + 1, T.WALL_STONE);
      setTile(x, w.y2, T.WALL_STONE);
      setTile(x, w.y2 - 1, T.WALL_STONE);
    }
    for (var y = w.y1; y <= w.y2; y++) {
      setTile(w.x1, y, T.WALL_STONE);
      setTile(w.x1 + 1, y, T.WALL_STONE);
      setTile(w.x2, y, T.WALL_STONE);
      setTile(w.x2 - 1, y, T.WALL_STONE);
    }
    // Gates - south
    for (var dx = -1; dx <= 1; dx++) {
      setTile(128 + dx, w.y2, T.ROAD);
      setTile(128 + dx, w.y2 - 1, T.ROAD);
    }
    // Gates - west
    for (var dy = -1; dy <= 1; dy++) {
      setTile(w.x1, 128 + dy, T.ROAD);
      setTile(w.x1 + 1, 128 + dy, T.ROAD);
    }
    // Internal roads
    for (var x = w.x1 + 2; x <= w.x2 - 2; x++) {
      setTile(x, 128, T.ROAD);
      setTile(x, 127, T.ROAD);
    }
    for (var y = w.y1 + 2; y <= w.y2 - 2; y++) {
      setTile(128, y, T.ROAD);
      setTile(127, y, T.ROAD);
    }

    // Market square (center)
    for (var y = 124; y <= 132; y++) {
      for (var x = 124; x <= 132; x++) {
        setTile(x, y, T.MARKET_STONE);
      }
    }

    // Castle (NE corner)
    placeBuilding(136, 110, 10, 8, T.WALL_STONE, T.STONE_FLOOR, 'castle');
    locations.castle = { x: 140, y: 114, name: 'Castle' };

    // Tavern (west of market)
    placeBuilding(113, 124, 7, 6, T.WALL_WOOD, T.WOOD_FLOOR, 'tavern');
    locations.tavern = { x: 116, y: 127, name: 'The Crossed Keys Tavern' };

    // Blacksmith (east of market)
    placeBuilding(134, 125, 6, 5, T.WALL_STONE, T.STONE_FLOOR, 'blacksmith');
    locations.blacksmith = { x: 137, y: 127, name: 'Blacksmith' };

    // Barracks (SW)
    placeBuilding(111, 136, 8, 6, T.WALL_STONE, T.STONE_FLOOR, 'barracks');
    locations.barracks = { x: 115, y: 139, name: 'Guard Barracks' };

    // Town houses
    placeBuilding(113, 113, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(120, 113, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(113, 118, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(134, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(140, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(134, 118, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(120, 134, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(140, 120, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'noble_house');

    // Merchant shops near market
    placeBuilding(122, 120, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
    placeBuilding(130, 120, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');

    locations.market = { x: 128, y: 128, name: 'Market Square' };
    locations.townGateSouth = { x: 128, y: 149, name: 'Town South Gate' };
    locations.townGateWest = { x: 109, y: 128, name: 'Town West Gate' };
  }

  function generateVillage(settlement) {
    var cx = settlement.x, cy = settlement.y;
    // Clear area
    for (var y = cy - 8; y <= cy + 8; y++) {
      for (var x = cx - 10; x <= cx + 10; x++) {
        var cur = tileAt(x, y);
        if (cur === T.FOREST_FLOOR || cur === T.WATER) continue;
        setTile(x, y, T.GRASS);
      }
    }
    // Village center (well area)
    setTile(cx, cy, T.MARKET_STONE);
    setTile(cx + 1, cy, T.MARKET_STONE);
    setTile(cx, cy + 1, T.MARKET_STONE);
    setTile(cx + 1, cy + 1, T.MARKET_STONE);

    // Houses around center
    placeBuilding(cx - 7, cy - 5, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx + 3, cy - 5, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx - 7, cy + 3, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx + 3, cy + 3, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'house');
    placeBuilding(cx - 3, cy - 7, 4, 3, T.WALL_WOOD, T.WOOD_FLOOR, 'house');

    // Village shop/inn
    if (settlement.name === 'Millhaven') {
      placeBuilding(cx + 4, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
      locations.millhavenShop = { x: cx + 6, y: cy + 1, name: 'Millhaven Shop' };
    }
    if (settlement.name === 'Thornfield') {
      placeBuilding(cx + 4, cy - 1, 5, 4, T.WALL_WOOD, T.WOOD_FLOOR, 'shop');
      locations.thornfieldShop = { x: cx + 6, y: cy + 1, name: 'Thornfield Shop' };
    }

    // Dirt paths within village
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
    // Small clearing
    for (var y = cy - 5; y <= cy + 5; y++) {
      for (var x = cx - 6; x <= cx + 6; x++) {
        setTile(x, y, T.DIRT);
      }
    }
    // Makeshift shelters (open-front)
    placeBuilding(cx - 4, cy - 3, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');
    placeBuilding(cx + 2, cy - 3, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');
    placeBuilding(cx - 1, cy + 2, 4, 3, T.WALL_WOOD, T.DIRT, 'tent');

    locations.banditCamp = { x: cx, y: cy, name: 'Bandit Camp' };
  }

  function generateFarmland() {
    // Millhaven farms
    for (var y = 170; y < 185; y++) {
      for (var x = 50; x < 82; x++) {
        var cur = tileAt(x, y);
        if (cur === T.GRASS) {
          var n = U.noise2D(x * 0.3, y * 0.3, seed + 400);
          if (n > 0.35) setTile(x, y, T.FARMLAND);
        }
      }
    }
    // Town farms (south)
    for (var y = 150; y < 165; y++) {
      for (var x = 112; x < 144; x++) {
        var cur = tileAt(x, y);
        if (cur === T.GRASS || cur === T.DIRT) {
          var n = U.noise2D(x * 0.3, y * 0.3, seed + 450);
          if (n > 0.4) setTile(x, y, T.FARMLAND);
        }
      }
    }
  }

  function generateTrees() {
    for (var y = 0; y < WORLD_TILES; y++) {
      for (var x = 0; x < WORLD_TILES; x++) {
        var t = tileAt(x, y);
        if (t === T.FOREST_FLOOR) {
          var n = U.noise2D(x * 0.5, y * 0.5, seed + 600);
          if (n > 0.3) treeMap[y * WORLD_TILES + x] = 1;
        } else if (t === T.GRASS) {
          // Scattered trees on grassland
          var n = U.noise2D(x * 0.8, y * 0.8, seed + 700);
          if (n > 0.82) treeMap[y * WORLD_TILES + x] = 1;
        }
      }
    }
  }

  function placeBuilding(bx, by, w, h, wallType, floorType, bType) {
    var b = { x: bx, y: by, w: w, h: h, type: bType, doorX: bx + Math.floor(w / 2), doorY: by + h - 1 };
    for (var y = by; y < by + h; y++) {
      for (var x = bx; x < bx + w; x++) {
        if (x === bx || x === bx + w - 1 || y === by || y === by + h - 1) {
          setTile(x, y, wallType);
        } else {
          setTile(x, y, floorType);
        }
        treeMap[y * WORLD_TILES + x] = 0; // clear trees
      }
    }
    // Door at bottom center
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

  // Chunk rendering
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
    var baseX = cx * CHUNK_SIZE;
    var baseY = cy * CHUNK_SIZE;

    for (var ty = 0; ty < CHUNK_SIZE; ty++) {
      for (var tx = 0; tx < CHUNK_SIZE; tx++) {
        var wx = baseX + tx, wy = baseY + ty;
        var tile = tileAt(wx, wy);
        var px = tx * TILE_SIZE, py = ty * TILE_SIZE;

        drawTile(ctx, px, py, tile, wx, wy);

        if (hasTree(wx, wy)) {
          drawTree(ctx, px, py, wx, wy);
        }
      }
    }
    chunkDirty[key] = false;
    return cvs;
  }

  function drawTile(ctx, px, py, tile, wx, wy) {
    var nv = U.noise2D(wx * 0.5, wy * 0.5, seed + 800) * 15;
    var S = TILE_SIZE;

    switch (tile) {
      case T.GRASS:
        ctx.fillStyle = U.colorStr(74 + nv | 0, 124 + nv | 0, 63 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Grass detail
        if (U.hash2D(wx, wy, seed + 900) > 0.7) {
          ctx.fillStyle = U.colorStr(64 + nv | 0, 134 + nv | 0, 53 + nv | 0);
          ctx.fillRect(px + 4, py + 8, 2, 6);
          ctx.fillRect(px + 14, py + 3, 2, 5);
          ctx.fillRect(px + 22, py + 12, 2, 7);
        }
        break;
      case T.DIRT:
        ctx.fillStyle = U.colorStr(139 + nv | 0, 115 + nv | 0, 85 + nv | 0);
        ctx.fillRect(px, py, S, S);
        break;
      case T.ROAD:
        ctx.fillStyle = U.colorStr(155 + nv | 0, 135 + nv | 0, 105 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Road texture
        if (U.hash2D(wx, wy, seed + 950) > 0.6) {
          ctx.fillStyle = U.colorStr(140 + nv | 0, 120 + nv | 0, 90 + nv | 0);
          ctx.fillRect(px + 6, py + 10, 4, 3);
          ctx.fillRect(px + 18, py + 20, 5, 2);
        }
        break;
      case T.WATER:
        var wn = U.noise2D(wx * 0.3, wy * 0.3, seed + 1000) * 20;
        ctx.fillStyle = U.colorStr(58 + wn | 0, 110 + wn | 0, 165 + wn | 0);
        ctx.fillRect(px, py, S, S);
        // Water ripple detail
        ctx.fillStyle = 'rgba(120,180,220,0.2)';
        var rx = ((wx * 7 + wy * 13) % 17) + 4;
        var ry = ((wx * 11 + wy * 3) % 13) + 6;
        ctx.fillRect(px + rx, py + ry, 6, 2);
        break;
      case T.DEEP_WATER:
        ctx.fillStyle = U.colorStr(30, 70, 130);
        ctx.fillRect(px, py, S, S);
        break;
      case T.FOREST_FLOOR:
        ctx.fillStyle = U.colorStr(45 + nv | 0, 90 + nv | 0, 30 + nv | 0);
        ctx.fillRect(px, py, S, S);
        break;
      case T.STONE_FLOOR:
        ctx.fillStyle = U.colorStr(150 + nv | 0, 150 + nv | 0, 150 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Stone tile lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
        break;
      case T.WALL_STONE:
        ctx.fillStyle = U.colorStr(100 + nv | 0, 100 + nv | 0, 105 + nv | 0);
        ctx.fillRect(px, py, S, S);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(px, py, S, 3);
        ctx.fillRect(px, py + S - 3, S, 3);
        // Stone block pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + S / 2); ctx.lineTo(px + S, py + S / 2);
        ctx.moveTo(px + S / 2, py); ctx.lineTo(px + S / 2, py + S / 2);
        ctx.moveTo(px + S / 4, py + S / 2); ctx.lineTo(px + S / 4, py + S);
        ctx.moveTo(px + 3 * S / 4, py + S / 2); ctx.lineTo(px + 3 * S / 4, py + S);
        ctx.stroke();
        break;
      case T.WALL_WOOD:
        ctx.fillStyle = U.colorStr(107 + nv | 0, 68 + nv | 0, 35 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Wood grain
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 4; i < S; i += 7) {
          ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + S);
        }
        ctx.stroke();
        break;
      case T.DOOR:
        ctx.fillStyle = U.colorStr(130 + nv | 0, 90 + nv | 0, 50 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Door detail
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 4, py + 2, S - 8, S - 4);
        ctx.fillStyle = U.colorStr(180, 150, 80);
        ctx.fillRect(px + S - 10, py + S / 2 - 2, 3, 4); // handle
        break;
      case T.FARMLAND:
        ctx.fillStyle = U.colorStr(107 + nv | 0, 91 + nv | 0, 55 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Crop rows
        ctx.fillStyle = U.colorStr(90 + nv | 0, 138 + nv | 0, 62 + nv | 0);
        for (var r = 4; r < S; r += 8) {
          ctx.fillRect(px + 2, py + r, S - 4, 3);
        }
        break;
      case T.SAND:
        ctx.fillStyle = U.colorStr(201 + nv | 0, 181 + nv | 0, 125 + nv | 0);
        ctx.fillRect(px, py, S, S);
        break;
      case T.WOOD_FLOOR:
        ctx.fillStyle = U.colorStr(139 + nv | 0, 105 + nv | 0, 60 + nv | 0);
        ctx.fillRect(px, py, S, S);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 0; i < S; i += 8) {
          ctx.moveTo(px, py + i); ctx.lineTo(px + S, py + i);
        }
        ctx.stroke();
        break;
      case T.BRIDGE:
        ctx.fillStyle = U.colorStr(120 + nv | 0, 85 + nv | 0, 45 + nv | 0);
        ctx.fillRect(px, py, S, S);
        // Planks
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 6; i < S; i += 8) {
          ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + S);
        }
        ctx.stroke();
        // Rails
        ctx.fillStyle = 'rgba(80,50,20,0.8)';
        ctx.fillRect(px, py, 3, S);
        ctx.fillRect(px + S - 3, py, 3, S);
        break;
      case T.MARKET_STONE:
        ctx.fillStyle = U.colorStr(165 + nv | 0, 160 + nv | 0, 150 + nv | 0);
        ctx.fillRect(px, py, S, S);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);
        break;
      default:
        ctx.fillStyle = '#555';
        ctx.fillRect(px, py, S, S);
    }
  }

  function drawTree(ctx, px, py, wx, wy) {
    var n = U.hash2D(wx, wy, seed + 1100);
    var S = TILE_SIZE;
    var treeH = 12 + n * 8;
    var canopyR = 8 + n * 6;

    // Trunk
    ctx.fillStyle = U.colorStr(92, 61, 30);
    ctx.fillRect(px + S / 2 - 3, py + S - treeH, 6, treeH);

    // Canopy
    var cx = px + S / 2, cy = py + S - treeH - 2;
    var shade = n * 30 | 0;
    ctx.fillStyle = U.colorStr(35 + shade, 100 + shade, 25 + shade);
    ctx.beginPath();
    ctx.arc(cx, cy, canopyR, 0, Math.PI * 2);
    ctx.fill();
    // Canopy highlight
    ctx.fillStyle = U.colorStr(50 + shade, 120 + shade, 40 + shade);
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 3, canopyR * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function getLocationAt(px, py) {
    var tx = Math.floor(px / TILE_SIZE);
    var ty = Math.floor(py / TILE_SIZE);
    // Check if inside town walls
    if (tx >= TOWN_WALLS.x1 && tx <= TOWN_WALLS.x2 && ty >= TOWN_WALLS.y1 && ty <= TOWN_WALLS.y2) {
      return 'ashford';
    }
    // Check villages
    if (U.dist(tx, ty, 66, 190) < 12) return 'millhaven';
    if (U.dist(tx, ty, 66, 64) < 12) return 'thornfield';
    if (U.dist(tx, ty, 200, 80) < 10) return 'banditCamp';
    // Forest
    if (tileAt(tx, ty) === T.FOREST_FLOOR) return 'forest';
    return 'wilderness';
  }

  function isRestricted(tx, ty) {
    // Castle interior is restricted
    if (tx >= 137 && tx <= 145 && ty >= 111 && ty <= 117) return true;
    return false;
  }

  function getBuildings() { return buildings; }
  function getLocations() { return locations; }

  return {
    T: T, TILE_SIZE: TILE_SIZE, CHUNK_SIZE: CHUNK_SIZE,
    WORLD_TILES: WORLD_TILES, WORLD_CHUNKS: WORLD_CHUNKS,
    TILE_SOLID: TILE_SOLID,
    init: init, tileAt: tileAt, setTile: setTile,
    isSolid: isSolid, getSpeedMod: getSpeedMod,
    hasTree: hasTree, isForest: isForest,
    renderChunk: renderChunk, getLocationAt: getLocationAt,
    isRestricted: isRestricted, getBuildings: getBuildings,
    getLocations: getLocations, SETTLEMENTS: SETTLEMENTS,
    TOWN_WALLS: TOWN_WALLS
  };
})();
