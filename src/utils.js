var Game = Game || {};

// Ellipse polyfill for older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.ellipse) {
  CanvasRenderingContext2D.prototype.ellipse = function (x, y, rx, ry, rot, sa, ea, ccw) {
    this.save();
    this.translate(x, y);
    this.rotate(rot);
    this.scale(rx, ry);
    this.arc(0, 0, 1, sa, ea, ccw);
    this.restore();
  };
}

Game.Utils = (function () {
  // Seeded PRNG (xorshift128)
  function PRNG(seed) {
    var s = [seed | 0 || 1, (seed * 16807) | 0 || 2, (seed * 48271) | 0 || 3, (seed * 69621) | 0 || 4];
    this.next = function () {
      var t = s[3];
      t ^= t << 11; t ^= t >>> 8;
      s[3] = s[2]; s[2] = s[1]; s[1] = s[0];
      t ^= s[0]; t ^= s[0] >>> 19;
      s[0] = t;
      return (t >>> 0) / 4294967296;
    };
  }

  var _globalRng = new PRNG(42);

  function seededRandom(seed) {
    if (seed !== undefined) _globalRng = new PRNG(seed);
    return _globalRng.next();
  }

  function rng() { return _globalRng.next(); }

  // Value noise 2D
  function hash2D(x, y, seed) {
    var h = seed + x * 374761393 + y * 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  function noise2D(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    var a = hash2D(ix, iy, seed);
    var b = hash2D(ix + 1, iy, seed);
    var c = hash2D(ix, iy + 1, seed);
    var d = hash2D(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  function fbm(x, y, octaves, seed) {
    var val = 0, amp = 1, freq = 1, max = 0;
    for (var i = 0; i < octaves; i++) {
      val += amp * noise2D(x * freq, y * freq, seed + i * 1000);
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / max;
  }

  // Math helpers
  function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function distSq(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
  function angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
  function randInt(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
  function randFloat(min, max) { return rng() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Name generation
  var FIRST_MALE = ['Aldric', 'Bertram', 'Conrad', 'Dietrich', 'Edmund', 'Falko', 'Gareth', 'Henrik',
    'Ivo', 'Jareth', 'Kaelin', 'Leoric', 'Merrick', 'Nolan', 'Oswin', 'Percival', 'Roderic',
    'Sigmund', 'Theron', 'Ulric', 'Viktor', 'Walden', 'Brandt', 'Cedric', 'Dorian', 'Emeric',
    'Florian', 'Godwin', 'Haldor', 'Ingram', 'Joran', 'Kenric', 'Lothar', 'Magnus', 'Norbert'];
  var FIRST_FEMALE = ['Adela', 'Brigid', 'Cecily', 'Daria', 'Elsbeth', 'Fiona', 'Greta', 'Helena',
    'Isolde', 'Johanna', 'Katrin', 'Lena', 'Maren', 'Nessa', 'Olwen', 'Petra', 'Rosalind',
    'Sybil', 'Tilda', 'Ursula', 'Vera', 'Willa', 'Agna', 'Berta', 'Cora', 'Eda', 'Frida',
    'Gerda', 'Hild', 'Ilsa', 'Jutta', 'Kara', 'Liora', 'Maeve', 'Nell'];
  var LAST_NAMES = ['Ashford', 'Brewer', 'Cooper', 'Dyer', 'Fletcher', 'Grayson', 'Harper', 'Irwin',
    'Joiner', 'Keller', 'Lindgren', 'Mason', 'Norwood', 'Oakley', 'Palmer', 'Reed', 'Sawyer',
    'Thatcher', 'Ward', 'Brennan', 'Carver', 'Dunbar', 'Falk', 'Graves', 'Holden', 'Kern',
    'Lang', 'Morrow', 'Nash', 'Orwell', 'Pike', 'Roth', 'Stone', 'Trask', 'Voss', 'Wren'];

  var _usedNames = {};
  function generateName(gender) {
    var first, last, name;
    var attempts = 0;
    do {
      first = pick(gender === 'female' ? FIRST_FEMALE : FIRST_MALE);
      last = pick(LAST_NAMES);
      name = first + ' ' + last;
      attempts++;
    } while (_usedNames[name] && attempts < 50);
    _usedNames[name] = true;
    return { first: first, last: last, full: name };
  }

  function resetNames() { _usedNames = {}; }

  // Color helpers
  function colorLerp(c1, c2, t) {
    return 'rgb(' +
      Math.round(lerp(c1[0], c2[0], t)) + ',' +
      Math.round(lerp(c1[1], c2[1], t)) + ',' +
      Math.round(lerp(c1[2], c2[2], t)) + ')';
  }

  function colorStr(r, g, b, a) {
    if (a !== undefined) return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }


  function formatJobLabel(job) {
    if (job === 'tavernKeeper') return 'Tavern Keeper';
    return job ? job.charAt(0).toUpperCase() + job.slice(1) : 'Commoner';
  }

  // Simple spatial hash
  function SpatialHash(cellSize) {
    this.cellSize = cellSize;
    this.cells = {};
  }
  SpatialHash.prototype.clear = function () { this.cells = {}; };
  SpatialHash.prototype._key = function (x, y) {
    return Math.floor(x / this.cellSize) + ',' + Math.floor(y / this.cellSize);
  };
  SpatialHash.prototype.insert = function (entity) {
    var key = this._key(entity.x, entity.y);
    if (!this.cells[key]) this.cells[key] = [];
    this.cells[key].push(entity);
  };
  SpatialHash.prototype.query = function (x, y, radius) {
    var results = [];
    var cs = this.cellSize;
    var minCX = Math.floor((x - radius) / cs);
    var maxCX = Math.floor((x + radius) / cs);
    var minCY = Math.floor((y - radius) / cs);
    var maxCY = Math.floor((y + radius) / cs);
    var r2 = radius * radius;
    for (var cx = minCX; cx <= maxCX; cx++) {
      for (var cy = minCY; cy <= maxCY; cy++) {
        var cell = this.cells[cx + ',' + cy];
        if (cell) {
          for (var i = 0; i < cell.length; i++) {
            var e = cell[i];
            if (distSq(x, y, e.x, e.y) <= r2) results.push(e);
          }
        }
      }
    }
    return results;
  };

  // Direction helpers
  var DIR = {
    N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 },
    NE: { x: 1, y: -1 }, NW: { x: -1, y: -1 }, SE: { x: 1, y: 1 }, SW: { x: -1, y: 1 }
  };

  function dirFromAngle(a) {
    var deg = ((a * 180 / Math.PI) + 360) % 360;
    if (deg < 22.5 || deg >= 337.5) return 'E';
    if (deg < 67.5) return 'SE';
    if (deg < 112.5) return 'S';
    if (deg < 157.5) return 'SW';
    if (deg < 202.5) return 'W';
    if (deg < 247.5) return 'NW';
    if (deg < 292.5) return 'N';
    return 'NE';
  }

  // Bresenham line for road drawing
  function bresenhamLine(x0, y0, x1, y1) {
    var points = [];
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return points;
  }

  return {
    PRNG: PRNG, seededRandom: seededRandom, rng: rng,
    hash2D: hash2D, noise2D: noise2D, fbm: fbm,
    clamp: clamp, lerp: lerp, dist: dist, distSq: distSq, angle: angle,
    randInt: randInt, randFloat: randFloat, pick: pick, shuffle: shuffle,
    generateName: generateName, resetNames: resetNames,
    colorLerp: colorLerp, colorStr: colorStr, hexToRgb: hexToRgb,
    formatJobLabel: formatJobLabel,
    SpatialHash: SpatialHash, DIR: DIR, dirFromAngle: dirFromAngle,
    bresenhamLine: bresenhamLine
  };
})();
