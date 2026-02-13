var Game = Game || {};

Game.Renderer = (function () {
  var U = Game.Utils;
  var W, TS, CS;
  var canvas, ctx;
  var camera = { x: 0, y: 0, targetX: 0, targetY: 0, w: 0, h: 0, zoom: 1 };
  var screenW, screenH;

  // Particles
  var particles = [];
  var MAX_PARTICLES = 200;

  // Animation clock
  var animTime = 0;

  // Screen shake
  var shakeIntensity = 0;
  var shakeDecay = 8;
  var shakeOffsetX = 0;
  var shakeOffsetY = 0;

  function init(cvs) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
    W = Game.World;
    TS = W.TILE_SIZE;
    CS = W.CHUNK_SIZE;
    particles = [];
    resize();
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    canvas.width = Math.floor(screenW * dpr);
    canvas.height = Math.floor(screenH * dpr);
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.w = screenW;
    camera.h = screenH;
  }

  function updateCamera(dt) {
    animTime += dt;
    var player = Game.Player.getState();
    camera.targetX = player.x - camera.w / 2;
    camera.targetY = player.y - camera.h / 2;
    var smoothing = 1 - Math.pow(0.001, dt);
    camera.x += (camera.targetX - camera.x) * smoothing;
    camera.y += (camera.targetY - camera.y) * smoothing;
    var worldPx = W.WORLD_TILES * TS;
    camera.x = U.clamp(camera.x, 0, Math.max(0, worldPx - camera.w));
    camera.y = U.clamp(camera.y, 0, Math.max(0, worldPx - camera.h));

    updateParticles(dt);
    spawnAmbientParticles(dt);

    // Screen shake decay
    if (shakeIntensity > 0.1) {
      shakeOffsetX = (Math.random() - 0.5) * shakeIntensity;
      shakeOffsetY = (Math.random() - 0.5) * shakeIntensity;
      shakeIntensity *= Math.pow(0.01, dt); // rapid decay
    } else {
      shakeOffsetX = 0; shakeOffsetY = 0; shakeIntensity = 0;
    }
  }

  function triggerShake(intensity) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
  }

  function render() {
    ctx.clearRect(0, 0, screenW, screenH);

    // Apply screen shake
    ctx.save();
    if (shakeIntensity > 0.1) ctx.translate(shakeOffsetX, shakeOffsetY);

    var startCX = Math.max(0, Math.floor(camera.x / (CS * TS)));
    var startCY = Math.max(0, Math.floor(camera.y / (CS * TS)));
    var endCX = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.x + camera.w) / (CS * TS)));
    var endCY = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.y + camera.h) / (CS * TS)));

    for (var cy = startCY; cy <= endCY; cy++)
      for (var cx = startCX; cx <= endCX; cx++) {
        var chunkCanvas = W.renderChunk(cx, cy);
        ctx.drawImage(chunkCanvas, Math.floor(cx * CS * TS - camera.x), Math.floor(cy * CS * TS - camera.y));
      }

    // Water shimmer overlay (per-frame animation on top of cached chunks)
    renderWaterShimmer();

    // Wildlife (ground layer - rendered among entities by Y)
    var entities = collectVisibleEntities();
    // Mix in wildlife as pseudo-entities for Y-sorting
    if (Game.Ambient) {
      var wl = Game.Ambient.getWildlife();
      for (var i = 0; i < wl.length; i++) {
        var w = wl[i];
        if (w.x > camera.x - 50 && w.x < camera.x + camera.w + 50 &&
            w.y > camera.y - 50 && w.y < camera.y + camera.h + 50) {
          entities.push({ x: w.x, y: w.y, isWildlife: true, data: w });
        }
      }
    }
    entities.sort(function (a, b) { return a.y - b.y; });

    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      var sx = Math.floor(e.x - camera.x);
      var sy = Math.floor(e.y - camera.y);
      if (e.isPlayer) drawPlayer(ctx, sx, sy, e);
      else if (e.isWildlife) drawWildlife(ctx, sx, sy, e.data);
      else drawNPC(ctx, sx, sy, e);
    }

    // Particles
    renderParticles();

    // Combat effects
    renderCombatEffects();
    renderDamageNumbers();

    // Clouds (between entities and day/night overlay)
    renderClouds();

    // Weather overlay (rain/storm)
    renderWeather();

    // Day/night
    renderDayNight();

    // Morning fog
    renderFog();

    // Speech bubbles after overlay
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.isPlayer || e.isWildlife || !e.alive) continue;
      renderSpeechBubble(ctx, Math.floor(e.x - camera.x), Math.floor(e.y - camera.y), e);
    }

    // Stealth visibility indicator
    renderStealthMeter();

    // End screen shake transform
    ctx.restore();
  }

  function collectVisibleEntities() {
    var entities = [];
    var player = Game.Player.getState();
    var pad = 120;
    if (player.alive) {
      entities.push({
        x: player.x, y: player.y, isPlayer: true,
        facing: player.facing, attacking: player.attackTimer > 0,
        blocking: player.blocking, dodging: player.dodging,
        attackType: player.attackType, vx: player.vx || 0, vy: player.vy || 0
      });
    }
    var npcs = Game.NPC.getNPCs();
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.x < camera.x - pad || n.x > camera.x + camera.w + pad) continue;
      if (n.y < camera.y - pad || n.y > camera.y + camera.h + pad) continue;
      entities.push(n);
    }
    return entities;
  }

  // ======= FACING HELPERS =======

  var FACING_ANGLE = {
    'N': -Math.PI / 2, 'S': Math.PI / 2, 'E': 0, 'W': Math.PI,
    'NE': -Math.PI / 4, 'NW': -3 * Math.PI / 4,
    'SE': Math.PI / 4, 'SW': 3 * Math.PI / 4
  };

  function isMoving(e) {
    if (e.isPlayer) {
      var m = Game.Input.getMovement();
      return m.x !== 0 || m.y !== 0;
    }
    return Math.abs(e.vx || 0) > 0.5 || Math.abs(e.vy || 0) > 0.5;
  }

  // ======= PLAYER SPRITE (POLISHED) =======

  function drawPlayer(ctx, sx, sy, p) {
    ctx.save();
    var ps = Game.Player.getState();
    var moving = isMoving(p);
    var walkPhase = moving ? animTime * 10 : 0;
    var legSwing = moving ? Math.sin(walkPhase) * 4 : 0;
    var armSwing = moving ? Math.sin(walkPhase + Math.PI) * 3.5 : 0;
    var bobY = moving ? Math.abs(Math.sin(walkPhase * 2)) * 1.5 : 0;
    var fAngle = FACING_ANGLE[p.facing] || Math.PI / 2;
    var faceSide = (p.facing === 'E' || p.facing === 'NE' || p.facing === 'SE') ? 1 :
                   (p.facing === 'W' || p.facing === 'NW' || p.facing === 'SW') ? -1 : 0;
    var faceDown = (p.facing === 'S' || p.facing === 'SE' || p.facing === 'SW') ? 1 :
                   (p.facing === 'N' || p.facing === 'NE' || p.facing === 'NW') ? -1 : 0;

    if (p.dodging) ctx.globalAlpha = 0.5;

    var bodyY = sy - bobY;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 13, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- LEGS ---
    var legColor = '#5a4a2a';
    if (ps.equipped.armor) legColor = '#4a3a1a';
    ctx.fillStyle = legColor;
    // Left leg
    ctx.fillRect(sx - 4 + legSwing * 0.3, bodyY + 4, 3, 8 + legSwing * 0.5);
    // Right leg
    ctx.fillRect(sx + 1 - legSwing * 0.3, bodyY + 4, 3, 8 - legSwing * 0.5);
    // Boots
    ctx.fillStyle = '#3a2a12';
    ctx.fillRect(sx - 5 + legSwing * 0.3, bodyY + 10 + legSwing * 0.3, 4, 3);
    ctx.fillRect(sx + 1 - legSwing * 0.3, bodyY + 10 - legSwing * 0.3, 4, 3);

    // --- BODY ---
    var bodyColor = '#7a6a4a';
    var armorId = ps.equipped.armor ? ps.equipped.armor.id : null;
    if (armorId === 'leather_armor') bodyColor = '#6a4e28';
    else if (armorId === 'chain_armor') bodyColor = '#8a8a98';
    ctx.fillStyle = bodyColor;
    // Torso (slightly tapered)
    ctx.beginPath();
    ctx.moveTo(sx - 6, bodyY + 6);
    ctx.lineTo(sx - 5, bodyY - 6);
    ctx.lineTo(sx + 5, bodyY - 6);
    ctx.lineTo(sx + 6, bodyY + 6);
    ctx.fill();
    // Belt
    ctx.fillStyle = '#3a2a12';
    ctx.fillRect(sx - 6, bodyY + 3, 12, 2);
    // Belt buckle
    ctx.fillStyle = '#c8a840';
    ctx.fillRect(sx - 1, bodyY + 3, 2, 2);

    // Armor detail
    if (armorId === 'chain_armor') {
      ctx.fillStyle = 'rgba(180,180,200,0.2)';
      for (var r = -4; r < 4; r += 3) ctx.fillRect(sx - 5, bodyY + r, 10, 1);
      // Shoulder pads
      ctx.fillStyle = '#7a7a88';
      ctx.fillRect(sx - 8, bodyY - 5, 4, 5);
      ctx.fillRect(sx + 4, bodyY - 5, 4, 5);
    } else if (armorId === 'leather_armor') {
      ctx.fillStyle = 'rgba(100,70,30,0.2)';
      ctx.fillRect(sx - 5, bodyY - 4, 10, 3);
    }

    // --- ARMS ---
    ctx.fillStyle = bodyColor;
    // Left arm
    ctx.save();
    ctx.translate(sx - 6, bodyY - 3);
    ctx.rotate(armSwing * 0.1);
    ctx.fillRect(-3, 0, 3, 10 + armSwing * 0.3);
    // Hand
    ctx.fillStyle = '#deb88a';
    ctx.fillRect(-2, 9 + armSwing * 0.3, 2, 3);
    ctx.restore();
    // Right arm
    ctx.fillStyle = bodyColor;
    ctx.save();
    ctx.translate(sx + 6, bodyY - 3);
    ctx.rotate(-armSwing * 0.1);
    ctx.fillRect(0, 0, 3, 10 - armSwing * 0.3);
    ctx.fillStyle = '#deb88a';
    ctx.fillRect(0, 9 - armSwing * 0.3, 2, 3);
    ctx.restore();

    // --- HEAD ---
    ctx.fillStyle = '#deb88a';
    ctx.beginPath();
    ctx.arc(sx + faceSide * 1, bodyY - 11, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#4a2a15';
    ctx.beginPath();
    ctx.arc(sx + faceSide * 1, bodyY - 14, 6, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // Side hair
    if (faceSide === 0) {
      ctx.fillRect(sx - 6, bodyY - 14, 2, 5);
      ctx.fillRect(sx + 4, bodyY - 14, 2, 5);
    }

    // Eyes
    ctx.fillStyle = '#1a0e05';
    if (faceDown >= 0) {
      ctx.fillRect(sx - 3 + faceSide * 2, bodyY - 12, 2, 2);
      if (faceSide === 0) ctx.fillRect(sx + 1, bodyY - 12, 2, 2);
    }

    // --- WEAPON ---
    var weapon = ps.equipped.weapon;
    if (p.attacking) {
      var swingProgress = 1 - (ps.attackTimer / (p.attackType === 'heavy' ? 0.6 : 0.3));
      var swingAngle = fAngle + (swingProgress - 0.5) * 1.5;
      var weaponLen = weapon ? (weapon.damage > 12 ? 22 : 18) : 14;
      ctx.strokeStyle = weapon ? '#b8b8c0' : '#aaa';
      ctx.lineWidth = weapon && weapon.damage > 12 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(fAngle) * 4, bodyY - 2 + Math.sin(fAngle) * 4);
      ctx.lineTo(sx + Math.cos(swingAngle) * weaponLen, bodyY - 2 + Math.sin(swingAngle) * weaponLen);
      ctx.stroke();
      // Blade glint
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(swingAngle) * (weaponLen - 6), bodyY - 2 + Math.sin(swingAngle) * (weaponLen - 6));
      ctx.lineTo(sx + Math.cos(swingAngle) * weaponLen, bodyY - 2 + Math.sin(swingAngle) * weaponLen);
      ctx.stroke();
    } else if (weapon) {
      // Sheathed weapon on belt
      ctx.strokeStyle = '#9a9aa0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 5, bodyY + 2);
      ctx.lineTo(sx + 8, bodyY + 12);
      ctx.stroke();
    }

    // --- BLOCKING SHIELD ---
    if (p.blocking) {
      ctx.fillStyle = '#7a5a2a';
      ctx.strokeStyle = '#5a3a14';
      ctx.lineWidth = 1.5;
      var bx = sx + Math.cos(fAngle) * 10;
      var by = bodyY - 2 + Math.sin(fAngle) * 8;
      ctx.beginPath();
      ctx.ellipse(bx, by, 7, 9, fAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Shield boss
      ctx.fillStyle = '#c8a840';
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bleeding drips
    if (ps.bleeding > 0) {
      ctx.fillStyle = 'rgba(160,15,15,0.5)';
      for (var bi = 0; bi < 2; bi++) {
        ctx.beginPath();
        ctx.arc(sx + Math.sin(animTime * 3 + bi) * 5, sy + 5 + bi * 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Surface-aware footstep particles
    if (moving && Math.random() < 0.3) {
      var footTile = W.tileAt(Math.floor(ps.x / TS), Math.floor(ps.y / TS));
      var footX = ps.x - Math.cos(fAngle) * 6;
      var footY = ps.y + 10;
      if (footTile === W.T.WATER || footTile === W.T.BRIDGE) {
        spawnParticle(footX, footY, 'splash');
      } else if (footTile === W.T.SAND) {
        spawnParticle(footX, footY, 'sand');
      } else if (footTile === W.T.GRASS || footTile === W.T.FOREST_FLOOR) {
        if (Math.random() < 0.15) spawnParticle(footX, footY, 'leaf');
      } else {
        spawnParticle(footX, footY, 'dust');
      }
    }

    ctx.restore();
  }

  // ======= NPC SPRITE (POLISHED) =======

  function drawNPC(ctx, sx, sy, npc) {
    ctx.save();

    // DEAD BODY
    if (!npc.alive) {
      ctx.globalAlpha = 0.65;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 8, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Fallen body
      ctx.fillStyle = npc.bodyColor || '#5a5040';
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(0.3);
      ctx.fillRect(-10, -3, 18, 7);
      // Limbs
      ctx.fillRect(-12, -1, 4, 3);
      ctx.fillRect(8, 1, 4, 3);
      ctx.fillRect(-4, 4, 3, 5);
      ctx.fillRect(3, 4, 3, 4);
      ctx.restore();
      // Head
      ctx.fillStyle = npc.headColor || '#d0a080';
      ctx.beginPath();
      ctx.arc(sx - 11, sy + 1, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Blood pool
      ctx.fillStyle = 'rgba(110,15,15,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy + 5, 9, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    var moving = isMoving(npc);
    var walkPhase = moving ? animTime * 8 + npc.id * 1.3 : 0; // offset by id for variety
    var legSwing = moving ? Math.sin(walkPhase) * 3.5 : 0;
    var armSwing = moving ? Math.sin(walkPhase + Math.PI) * 3 : 0;
    var bobY = moving ? Math.abs(Math.sin(walkPhase * 2)) * 1 : 0;
    var bodyY = sy - bobY;

    var faceSide = 0, faceDown = 1;
    if (npc.facing === 'E' || npc.facing === 'NE' || npc.facing === 'SE') faceSide = 1;
    else if (npc.facing === 'W' || npc.facing === 'NW' || npc.facing === 'SW') faceSide = -1;
    if (npc.facing === 'N' || npc.facing === 'NE' || npc.facing === 'NW') faceDown = -1;
    else if (npc.facing === 'S' || npc.facing === 'SE' || npc.facing === 'SW') faceDown = 1;
    else faceDown = 0;

    if (npc.state === 'sleep') ctx.globalAlpha = 0.55;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 13, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- LEGS ---
    var legCol = getLegColor(npc);
    ctx.fillStyle = legCol;
    ctx.fillRect(sx - 3 + legSwing * 0.3, bodyY + 4, 3, 7 + legSwing * 0.4);
    ctx.fillRect(sx + 0 - legSwing * 0.3, bodyY + 4, 3, 7 - legSwing * 0.4);
    // Shoes
    ctx.fillStyle = '#3a2510';
    ctx.fillRect(sx - 4 + legSwing * 0.3, bodyY + 9 + legSwing * 0.3, 4, 3);
    ctx.fillRect(sx + 0 - legSwing * 0.3, bodyY + 9 - legSwing * 0.3, 4, 3);

    // --- BODY ---
    ctx.fillStyle = npc.bodyColor || '#5a5040';
    ctx.beginPath();
    ctx.moveTo(sx - 5, bodyY + 5);
    ctx.lineTo(sx - 4, bodyY - 5);
    ctx.lineTo(sx + 4, bodyY - 5);
    ctx.lineTo(sx + 5, bodyY + 5);
    ctx.fill();

    // Job-specific body details
    if (npc.job === 'blacksmith') {
      // Leather apron
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(sx - 4, bodyY - 1, 8, 8);
      ctx.strokeStyle = '#2a1a0a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx - 4, bodyY - 1, 8, 8);
    } else if (npc.job === 'noble') {
      // Embroidered trim
      ctx.fillStyle = '#d4a030';
      ctx.fillRect(sx - 4, bodyY - 5, 8, 1);
      ctx.fillRect(sx - 4, bodyY + 3, 8, 1);
    } else if (npc.job === 'guard') {
      // Tabard
      ctx.fillStyle = '#1a3a6a';
      ctx.fillRect(sx - 4, bodyY - 4, 8, 8);
      // Emblem
      ctx.fillStyle = '#d4a030';
      ctx.fillRect(sx - 1, bodyY - 2, 2, 4);
      ctx.fillRect(sx - 2, bodyY - 1, 4, 2);
    } else if (npc.job === 'bandit') {
      // Dark vest
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(sx - 4, bodyY - 4, 3, 8);
      ctx.fillRect(sx + 1, bodyY - 4, 3, 8);
    }

    // Belt
    ctx.fillStyle = '#3a2210';
    ctx.fillRect(sx - 5, bodyY + 3, 10, 2);

    // --- ARMS ---
    ctx.fillStyle = npc.bodyColor || '#5a5040';
    // Left arm
    ctx.save();
    ctx.translate(sx - 5, bodyY - 2);
    ctx.rotate(armSwing * 0.08);
    ctx.fillRect(-2, 0, 3, 8 + armSwing * 0.2);
    ctx.fillStyle = npc.headColor || '#deb88a';
    ctx.fillRect(-2, 7 + armSwing * 0.2, 2, 2);
    ctx.restore();
    // Right arm
    ctx.fillStyle = npc.bodyColor || '#5a5040';
    ctx.save();
    ctx.translate(sx + 5, bodyY - 2);
    ctx.rotate(-armSwing * 0.08);
    ctx.fillRect(-1, 0, 3, 8 - armSwing * 0.2);
    ctx.fillStyle = npc.headColor || '#deb88a';
    ctx.fillRect(0, 7 - armSwing * 0.2, 2, 2);
    ctx.restore();

    // Guard weapon (spear)
    if (npc.job === 'guard') {
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + 7, bodyY - 4);
      ctx.lineTo(sx + 7, bodyY - 20);
      ctx.stroke();
      // Spear tip
      ctx.fillStyle = '#b0b0b8';
      ctx.beginPath();
      ctx.moveTo(sx + 7, bodyY - 24);
      ctx.lineTo(sx + 5, bodyY - 20);
      ctx.lineTo(sx + 9, bodyY - 20);
      ctx.fill();
    }

    // Bandit weapon
    if (npc.job === 'bandit' && npc.state === 'fight') {
      var ba = FACING_ANGLE[npc.facing] || 0;
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, bodyY - 2);
      ctx.lineTo(sx + Math.cos(ba) * 16, bodyY - 2 + Math.sin(ba) * 16);
      ctx.stroke();
    }

    // --- HEAD ---
    ctx.fillStyle = npc.headColor || '#deb88a';
    ctx.beginPath();
    ctx.arc(sx + faceSide * 0.5, bodyY - 10, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Hair (varies by gender/id)
    var hairColor = getHairColor(npc);
    ctx.fillStyle = hairColor;
    if (npc.gender === 'female') {
      // Longer hair
      ctx.beginPath();
      ctx.arc(sx + faceSide * 0.5, bodyY - 13, 5, Math.PI * 0.8, Math.PI * 2.2);
      ctx.fill();
      ctx.fillRect(sx - 5, bodyY - 13, 2, 8);
      ctx.fillRect(sx + 3, bodyY - 13, 2, 8);
    } else {
      ctx.beginPath();
      ctx.arc(sx + faceSide * 0.5, bodyY - 13, 4.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
    }

    // JOB-SPECIFIC HEAD GEAR
    if (npc.job === 'guard') {
      ctx.fillStyle = '#6a6a78';
      ctx.beginPath();
      ctx.arc(sx, bodyY - 12, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - 6, bodyY - 12, 12, 3);
      // Nose guard
      ctx.fillRect(sx - 0.5, bodyY - 12, 1, 4);
    } else if (npc.job === 'king') {
      ctx.fillStyle = '#d4a030';
      ctx.fillRect(sx - 5, bodyY - 18, 10, 3);
      ctx.fillStyle = '#e0b840';
      ctx.fillRect(sx - 5, bodyY - 22, 2, 4);
      ctx.fillRect(sx - 1, bodyY - 23, 2, 5);
      ctx.fillRect(sx + 3, bodyY - 22, 2, 4);
      // Gems
      ctx.fillStyle = '#e04040';
      ctx.fillRect(sx - 4, bodyY - 20, 2, 2);
      ctx.fillStyle = '#4060e0';
      ctx.fillRect(sx + 2, bodyY - 20, 2, 2);
    } else if (npc.job === 'noble') {
      ctx.fillStyle = '#6a2020';
      ctx.fillRect(sx - 5, bodyY - 18, 10, 4);
      ctx.fillStyle = '#d4a030';
      ctx.fillRect(sx - 4, bodyY - 17, 8, 1);
    } else if (npc.job === 'farmer') {
      // Straw hat
      ctx.fillStyle = '#c8a850';
      ctx.fillRect(sx - 7, bodyY - 16, 14, 3);
      ctx.fillRect(sx - 4, bodyY - 19, 8, 3);
    } else if (npc.job === 'bandit') {
      // Hood
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(sx, bodyY - 12, 6, Math.PI * 0.7, Math.PI * 2.3);
      ctx.fill();
    } else if (npc.job === 'merchant') {
      // Cap
      ctx.fillStyle = '#2a6a2a';
      ctx.beginPath();
      ctx.arc(sx, bodyY - 13, 5, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (npc.job === 'tavernKeeper') {
      // Headscarf for female tavern keeper
      if (npc.gender === 'female') {
        ctx.fillStyle = '#8a5a2a';
        ctx.beginPath();
        ctx.arc(sx, bodyY - 12, 6, Math.PI * 0.7, Math.PI * 2.3);
        ctx.fill();
      }
    }

    // King cape
    if (npc.job === 'king') {
      ctx.fillStyle = 'rgba(140,30,30,0.7)';
      ctx.beginPath();
      ctx.moveTo(sx - 5, bodyY - 5);
      ctx.lineTo(sx - 8, bodyY + 10);
      ctx.lineTo(sx + 8, bodyY + 10);
      ctx.lineTo(sx + 5, bodyY - 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,160,60,0.3)';
      ctx.fillRect(sx - 7, bodyY + 7, 14, 2);
    }

    // Eyes
    if (faceDown >= 0 && npc.state !== 'sleep') {
      ctx.fillStyle = '#1a0e05';
      ctx.fillRect(sx - 2 + faceSide * 1.5, bodyY - 11, 1.5, 1.5);
      if (faceSide === 0) ctx.fillRect(sx + 1, bodyY - 11, 1.5, 1.5);
    }

    // Mouth (subtle)
    if (npc.barkTimer > 0 && faceDown >= 0) {
      ctx.fillStyle = '#4a2010';
      ctx.fillRect(sx - 1 + faceSide, bodyY - 8, 2, 1);
    }

    // Health bar
    if (npc.health < npc.maxHealth) {
      var hpPct = npc.health / npc.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - 12, bodyY - 22, 24, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#4a8a4a' : hpPct > 0.25 ? '#8a8a2a' : '#8a2a2a';
      ctx.fillRect(sx - 12, bodyY - 22, Math.round(24 * hpPct), 3);
    }

    // Combat indicator
    if (npc.state === 'fight') {
      ctx.strokeStyle = 'rgba(180,40,40,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(sx, bodyY - 4, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bleeding
    if (npc.bleeding > 0) {
      ctx.fillStyle = 'rgba(150,12,12,0.5)';
      ctx.beginPath();
      ctx.arc(sx + Math.sin(animTime * 4 + npc.id) * 4, sy + 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name + life activity labels when close
    var p = Game.Player.getState();
    var distToPlayer = U.dist(npc.x, npc.y, p.x, p.y);
    if (distToPlayer < 120) {
      var labelY = bodyY - getNameOffset(npc);
      ctx.textAlign = 'center';
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(230,220,195,0.92)';
      ctx.fillText(npc.name.first, sx, labelY);

      var jobText = Game.NPC.getJobLabel ? Game.NPC.getJobLabel(npc.job) : npc.job;
      ctx.font = '8px sans-serif';
      ctx.fillStyle = 'rgba(205,175,105,0.88)';
      ctx.fillText(jobText, sx, labelY + 10);

      if (distToPlayer < 95 && Game.NPC.getActivityLabel) {
        var activity = Game.NPC.getActivityLabel(npc);
        if (activity) {
          ctx.fillStyle = 'rgba(185,210,225,0.82)';
          ctx.fillText(activity, sx, labelY + 20);
        }
      }
    }

    // Sleep zzz
    if (npc.state === 'sleep') {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = 'rgba(180,180,230,0.6)';
      ctx.textAlign = 'center';
      var zzOff = Math.sin(animTime * 2) * 2;
      ctx.fillText('z', sx + 8, bodyY - 16 + zzOff);
      ctx.fillText('z', sx + 12, bodyY - 22 + zzOff * 0.7);
      ctx.font = '8px sans-serif';
      ctx.fillText('z', sx + 15, bodyY - 26 + zzOff * 0.5);
    }

    // === ALERT / AWARENESS ICON ===
    if (npc.alertIcon && npc.alertIconTimer > 0) {
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      var iconBob = Math.sin(animTime * 6) * 2;
      ctx.fillStyle = npc.alertIcon === '!' ? '#e04040' : '#e0c040';
      ctx.fillText(npc.alertIcon, sx, bodyY - getNameOffset(npc) - 8 + iconBob);
    }

    // === TOOL-USE ANIMATION (when working) ===
    if (npc.state === 'work' && !moving) {
      var toolPhase = npc.activityAnim || 0;
      var toolSwing = Math.sin(toolPhase) * 0.4;
      if (npc.job === 'blacksmith') {
        // Hammer striking anvil
        ctx.save();
        ctx.translate(sx + 6, bodyY - 2);
        ctx.rotate(-0.3 + toolSwing);
        ctx.fillStyle = '#6a5a4a';
        ctx.fillRect(0, -1, 2, 10);
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(-1, 8, 4, 4);
        ctx.restore();
      } else if (npc.job === 'farmer') {
        // Hoe motion
        ctx.save();
        ctx.translate(sx + 5, bodyY - 4);
        ctx.rotate(-0.5 + toolSwing * 1.2);
        ctx.fillStyle = '#6a4a20';
        ctx.fillRect(0, 0, 2, 14);
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(-2, 12, 6, 2);
        ctx.restore();
      } else if (npc.job === 'woodcutter') {
        // Axe swing
        ctx.save();
        ctx.translate(sx + 6, bodyY - 3);
        ctx.rotate(-0.4 + toolSwing * 1.5);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(0, 0, 2, 12);
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(0, 10); ctx.lineTo(5, 12); ctx.lineTo(0, 14);
        ctx.fill();
        ctx.restore();
      } else if (npc.job === 'healer') {
        // Potion vial swirl
        ctx.fillStyle = '#2f7a6d';
        ctx.fillRect(sx + 4, bodyY + 1, 3, 5);
        ctx.fillStyle = '#9be0d6';
        ctx.fillRect(sx + 4, bodyY + 4 + Math.sin(toolPhase * 2) * 1.5, 3, 2);
      } else if (npc.job === 'hunter') {
        // Bow draw pose
        ctx.strokeStyle = '#6b4a25';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx + 6, bodyY - 1, 4, -1.2, 1.2);
        ctx.stroke();
      } else if (npc.job === 'miner') {
        // Pickaxe motion
        ctx.save();
        ctx.translate(sx + 6, bodyY - 3);
        ctx.rotate(-0.8 + toolSwing * 1.4);
        ctx.fillStyle = '#6a4a20';
        ctx.fillRect(0, 0, 2, 12);
        ctx.fillStyle = '#8f959b';
        ctx.fillRect(-3, 1, 8, 2);
        ctx.restore();
      }
    }

    // === LIMP when badly hurt ===
    if (npc.health < npc.maxHealth * 0.35 && npc.health > 0) {
      // Small indicator: hunched posture already via lower bob, plus a subtle marker
      ctx.fillStyle = 'rgba(200,50,50,0.4)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('wounded', sx, sy + 16);
    }

    ctx.restore();
  }

  function getNameOffset(npc) {
    if (npc.job === 'king') return 28;
    if (npc.job === 'noble' || npc.job === 'guard' || npc.job === 'farmer') return 22;
    return 18;
  }

  function getLegColor(npc) {
    switch (npc.job) {
      case 'guard': return '#2a3a5a';
      case 'noble': return '#4a2020';
      case 'king': return '#3a2a18';
      case 'bandit': return '#2a2a2a';
      default: return '#5a4a28';
    }
  }

  function getHairColor(npc) {
    var colors = ['#3a2010', '#5a3820', '#2a1808', '#6a4a25', '#8a6a40', '#1a0e05'];
    return colors[npc.id % colors.length];
  }

  // ======= PARTICLES =======

  function spawnParticle(wx, wy, type) {
    if (particles.length >= MAX_PARTICLES) return;
    var p = { x: wx, y: wy, type: type, life: 0, maxLife: 1 };
    switch (type) {
      case 'dust':
        p.vx = (Math.random() - 0.5) * 15;
        p.vy = -Math.random() * 10 - 5;
        p.maxLife = 0.4 + Math.random() * 0.3;
        p.size = 1.5 + Math.random() * 1.5;
        p.color = [160, 140, 100];
        break;
      case 'smoke':
        p.vx = (Math.random() - 0.5) * 8;
        p.vy = -15 - Math.random() * 10;
        p.maxLife = 1.5 + Math.random();
        p.size = 2 + Math.random() * 3;
        p.color = [120, 110, 100];
        break;
      case 'ember':
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = -20 - Math.random() * 15;
        p.maxLife = 0.6 + Math.random() * 0.5;
        p.size = 1 + Math.random();
        p.color = [240, 140, 30];
        break;
      case 'spark':
        p.vx = (Math.random() - 0.5) * 30;
        p.vy = -25 - Math.random() * 15;
        p.maxLife = 0.3 + Math.random() * 0.2;
        p.size = 1;
        p.color = [255, 200, 100];
        break;
      case 'splash':
        p.vx = (Math.random() - 0.5) * 18;
        p.vy = -12 - Math.random() * 10;
        p.maxLife = 0.3 + Math.random() * 0.2;
        p.size = 1.5 + Math.random();
        p.color = [100, 160, 220];
        break;
      case 'sand':
        p.vx = (Math.random() - 0.5) * 12;
        p.vy = -6 - Math.random() * 5;
        p.maxLife = 0.3 + Math.random() * 0.2;
        p.size = 1 + Math.random();
        p.color = [200, 180, 120];
        break;
      case 'leaf':
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = -8 - Math.random() * 6;
        p.maxLife = 0.8 + Math.random() * 0.5;
        p.size = 2;
        p.color = [60 + (Math.random() * 40 | 0), 100 + (Math.random() * 40 | 0), 30];
        break;
    }
    particles.push(p);
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'smoke') { p.vy *= 0.98; p.size += dt * 2; }
      if (p.type === 'dust' || p.type === 'sand') p.vy += 20 * dt;
      if (p.type === 'ember') p.vy += 10 * dt;
      if (p.type === 'splash') p.vy += 35 * dt;
      if (p.type === 'leaf') { p.vy += 8 * dt; p.vx += Math.sin(p.life * 5) * 10 * dt; }
    }
  }

  function spawnAmbientParticles(dt) {
    // Campfire smoke + embers
    var campX = 200 * TS + TS / 2, campY = 80 * TS + TS / 2;
    if (U.distSq(campX, campY, camera.x + camera.w / 2, camera.y + camera.h / 2) < 500 * 500) {
      if (Math.random() < dt * 4) spawnParticle(campX + (Math.random() - 0.5) * 8, campY - 4, 'smoke');
      if (Math.random() < dt * 6) spawnParticle(campX + (Math.random() - 0.5) * 6, campY - 6, 'ember');
    }

    // Blacksmith sparks
    var bsX = 137 * TS, bsY = 127 * TS;
    if (U.distSq(bsX, bsY, camera.x + camera.w / 2, camera.y + camera.h / 2) < 400 * 400) {
      var hour = Game.time ? ((Game.time / 60) % 24) : 12;
      if (hour >= 7 && hour < 17 && Math.random() < dt * 3) {
        spawnParticle(bsX + (Math.random() - 0.5) * 10, bsY - 8, 'spark');
      }
    }

    // Chimney smoke from buildings (during certain hours)
    if (Math.random() < dt * 0.5) {
      var buildings = W.getBuildings();
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        if (b.type === 'house' || b.type === 'tavern' || b.type === 'noble_house') {
          var cx = (b.x + b.w / 2) * TS, cy = b.y * TS;
          if (cx > camera.x - 50 && cx < camera.x + camera.w + 50 &&
              cy > camera.y - 50 && cy < camera.y + camera.h + 50) {
            if (Math.random() < 0.05) {
              spawnParticle(cx + (Math.random() - 0.5) * 4, cy - 4, 'smoke');
            }
          }
        }
      }
    }
  }

  function renderParticles() {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var sx = p.x - camera.x, sy = p.y - camera.y;
      var alpha = 1 - p.life / p.maxLife;
      if (p.type === 'smoke') alpha *= 0.4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = U.colorStr(p.color[0], p.color[1], p.color[2]);
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ======= SPEECH BUBBLES =======

  function renderSpeechBubble(ctx, sx, sy, npc) {
    var text = null, timer = 0;
    if (npc.speechTimer > 0) { text = npc.speechBubble; timer = npc.speechTimer; }
    else if (npc.barkTimer > 0) { text = npc.bark; timer = npc.barkTimer; }
    if (!text) return;

    ctx.save();
    ctx.font = '11px sans-serif';
    var tw = Math.min(ctx.measureText(text).width + 14, 180);
    var lines = wrapText(ctx, text, 168);
    var th = lines.length * 14 + 10;
    var bx = sx - tw / 2, by = sy - 34 - th;

    ctx.globalAlpha = Math.min(1, timer * 1.5);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, bx + 2, by + 2, tw, th, 5);
    ctx.fill();
    // Bubble
    ctx.fillStyle = 'rgba(252,248,235,0.94)';
    roundRect(ctx, bx, by, tw, th, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,60,0.45)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw, th, 5);
    ctx.stroke();
    // Pointer
    ctx.fillStyle = 'rgba(252,248,235,0.94)';
    ctx.beginPath();
    ctx.moveTo(sx - 5, by + th);
    ctx.lineTo(sx, by + th + 6);
    ctx.lineTo(sx + 5, by + th);
    ctx.fill();
    // Text
    ctx.fillStyle = '#2a1a0a';
    ctx.textAlign = 'center';
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], sx, by + 15 + i * 14);

    ctx.restore();
  }

  // ======= COMBAT EFFECTS =======

  function renderCombatEffects() {
    var effects = Game.Combat.getEffects();
    for (var i = 0; i < effects.length; i++) {
      var ef = effects[i];
      var sx = Math.floor(ef.x - camera.x), sy = Math.floor(ef.y - camera.y);
      var progress = 1 - ef.timer / ef.maxTimer;
      if (ef.type === 'slash') {
        ctx.save();
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        var r = 14 + progress * 18;
        ctx.arc(sx, sy - 4, r, ef.angle - 0.7, ef.angle + 0.7);
        ctx.stroke();
        // Inner bright arc
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy - 4, r - 3, ef.angle - 0.5, ef.angle + 0.5);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function renderDamageNumbers() {
    var nums = Game.Combat.getDamageNumbers();
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < nums.length; i++) {
      var dn = nums[i];
      var sx = Math.floor(dn.x - camera.x), sy = Math.floor(dn.y - camera.y);
      ctx.globalAlpha = dn.alpha;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText('-' + dn.amount, sx, sy);
      ctx.fillStyle = '#dd2222';
      ctx.fillText('-' + dn.amount, sx, sy);
    }
    ctx.restore();
  }

  // ======= DAY/NIGHT =======

  function renderDayNight() {
    if (!Game.time) return;
    var hour = (Game.time / 60) % 24;
    var darkness = 0;
    if (hour >= 20) darkness = (hour - 20) / 3;
    else if (hour < 5) darkness = 1;
    else if (hour < 7) darkness = 1 - (hour - 5) / 2;
    darkness = U.clamp(darkness, 0, 0.6);

    if (darkness > 0.01) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,28,' + darkness + ')';
      ctx.fillRect(0, 0, screenW, screenH);

      // Torch/campfire warm glow during night (render light circles)
      if (darkness > 0.1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = darkness * 0.35;
        // Campfire glow
        drawLightSource(200 * TS + 16, 80 * TS + 16, 100);
        // Town torches (along roads)
        var w = W.TOWN_WALLS;
        for (var x = w.x1 + 4; x <= w.x2 - 4; x += 6) {
          drawLightSource(x * TS + 16, 126 * TS + 16, 48);
          drawLightSource(x * TS + 16, 129 * TS + 16, 48);
        }
        for (var y = w.y1 + 4; y <= w.y2 - 4; y += 6) {
          drawLightSource(126 * TS + 16, y * TS + 16, 48);
          drawLightSource(129 * TS + 16, y * TS + 16, 48);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    // Sunrise/sunset tints
    if (hour >= 5 && hour < 7) {
      ctx.save();
      var tint = 0.12 * (1 - (hour - 5) / 2);
      ctx.fillStyle = 'rgba(200,110,50,' + tint + ')';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    } else if (hour >= 18 && hour < 20) {
      ctx.save();
      var tint = 0.12 * ((hour - 18) / 2);
      ctx.fillStyle = 'rgba(200,90,40,' + tint + ')';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    }
  }

  function drawLightSource(wx, wy, radius) {
    var sx = wx - camera.x, sy = wy - camera.y;
    if (sx < -radius || sx > screenW + radius || sy < -radius || sy > screenH + radius) return;
    var grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, 'rgba(240,180,80,0.6)');
    grad.addColorStop(0.5, 'rgba(200,120,40,0.2)');
    grad.addColorStop(1, 'rgba(200,100,30,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }

  // ======= FOG =======

  function renderFog() {
    if (!Game.time) return;
    var hour = (Game.time / 60) % 24;
    // Morning fog: 4am-8am, peaks at 6am
    var fogAmount = 0;
    if (hour >= 4 && hour < 8) {
      fogAmount = hour < 6 ? (hour - 4) / 2 : 1 - (hour - 6) / 2;
    }
    // Weather adds fog
    if (Game.Ambient) {
      var w = Game.Ambient.getWeather();
      if (w.type === 'rain') fogAmount = Math.max(fogAmount, 0.15);
      if (w.type === 'storm') fogAmount = Math.max(fogAmount, 0.1);
    }
    // Forest increases fog
    var p = Game.Player.getState();
    var tile = W.tileAt(Math.floor(p.x / TS), Math.floor(p.y / TS));
    if (tile === W.T.FOREST_FLOOR) fogAmount *= 1.4;
    // Near water
    if (tile === W.T.SAND) fogAmount *= 1.2;

    fogAmount = U.clamp(fogAmount, 0, 0.45);
    if (fogAmount < 0.01) return;

    ctx.save();
    ctx.fillStyle = 'rgba(200,200,210,' + (fogAmount * 0.5) + ')';
    ctx.fillRect(0, 0, screenW, screenH);
    // Wispy fog patches
    ctx.globalAlpha = fogAmount * 0.3;
    ctx.fillStyle = '#d0d0d8';
    for (var i = 0; i < 6; i++) {
      var fx = ((animTime * 12 + i * 200) % (screenW + 300)) - 150;
      var fy = screenH * 0.3 + Math.sin(animTime * 0.5 + i * 1.5) * screenH * 0.25;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 100 + i * 20, 25 + i * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ======= STEALTH VISIBILITY METER =======

  function renderStealthMeter() {
    var p = Game.Player.getState();
    if (p.skills.stealth < 3) return; // don't show until some stealth skill
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var tile = W.tileAt(Math.floor(p.x / TS), Math.floor(p.y / TS));

    // Calculate visibility
    var visibility = 1.0;
    if (hour >= 20 || hour < 5) visibility *= 0.5;
    else if (hour >= 18 || hour < 7) visibility *= 0.75;
    if (tile === W.T.FOREST_FLOOR) visibility *= 0.6;
    if (tile === W.T.GRASS && W.hasTree(Math.floor(p.x / TS), Math.floor(p.y / TS))) visibility *= 0.7;
    // Moving increases visibility
    var m = Game.Input.getMovement();
    if (m.x !== 0 || m.y !== 0) visibility *= 1.3;
    visibility = U.clamp(visibility, 0.1, 1.0);

    // Draw small eye icon with fill
    var ix = 15, iy = 90;
    ctx.save();
    ctx.globalAlpha = 0.6;
    // Eye outline
    ctx.strokeStyle = '#c0b890';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.quadraticCurveTo(ix + 10, iy - 5, ix + 20, iy);
    ctx.quadraticCurveTo(ix + 10, iy + 5, ix, iy);
    ctx.stroke();
    // Fill based on visibility
    ctx.fillStyle = visibility > 0.7 ? '#c06030' : visibility > 0.4 ? '#a0a040' : '#408040';
    ctx.globalAlpha = 0.4 + visibility * 0.3;
    ctx.beginPath();
    ctx.arc(ix + 10, iy, 3, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.globalAlpha = 0.5;
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#c0b890';
    ctx.textAlign = 'left';
    var visLabel = visibility > 0.7 ? 'Exposed' : visibility > 0.4 ? 'Visible' : 'Hidden';
    ctx.fillText(visLabel, ix + 24, iy + 3);
    ctx.restore();
  }

  // ======= WATER SHIMMER OVERLAY =======

  function renderWaterShimmer() {
    ctx.save();
    ctx.globalAlpha = 0.12;
    // Only draw shimmer on visible water tiles
    var tStartX = Math.floor(camera.x / TS);
    var tStartY = Math.floor(camera.y / TS);
    var tEndX = Math.ceil((camera.x + camera.w) / TS);
    var tEndY = Math.ceil((camera.y + camera.h) / TS);
    for (var ty = tStartY; ty <= tEndY; ty++) {
      for (var tx = tStartX; tx <= tEndX; tx++) {
        var tile = W.tileAt(tx, ty);
        if (tile !== W.T.WATER) continue;
        var sx = tx * TS - camera.x;
        var sy = ty * TS - camera.y;
        // Animated ripple lines
        var phase = animTime * 2 + tx * 0.7 + ty * 0.5;
        ctx.fillStyle = 'rgba(160,210,240,0.6)';
        var ry = (Math.sin(phase) * 6 + 12) | 0;
        ctx.fillRect(sx + 4, sy + ry, 10, 1);
        var ry2 = (Math.sin(phase + 2) * 5 + 20) | 0;
        ctx.fillRect(sx + 14, sy + ry2, 8, 1);
      }
    }
    ctx.restore();
  }

  // ======= WILDLIFE RENDERING =======

  function drawWildlife(ctx, sx, sy, w) {
    ctx.save();
    var t = animTime + w.variant * 0.1;

    switch (w.type) {
      case 'bird':
        // Small bird: body + wing flaps
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(sx - 2, sy - 1, 5, 3);
        // Wings
        var wingUp = Math.sin(w.animPhase) * 3;
        ctx.fillStyle = '#6a5040';
        ctx.fillRect(sx - 4, sy - 2 - Math.abs(wingUp), 3, 2);
        ctx.fillRect(sx + 2, sy - 2 - Math.abs(wingUp), 3, 2);
        // Beak
        ctx.fillStyle = '#c89030';
        ctx.fillRect(sx + 3, sy - 1, 2, 1);
        // Eye
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 1, sy - 1, 1, 1);
        break;

      case 'crow':
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(sx - 3, sy - 1, 6, 3);
        var cw = Math.sin(w.animPhase) * 3;
        ctx.fillRect(sx - 5, sy - 2 - Math.abs(cw), 3, 2);
        ctx.fillRect(sx + 3, sy - 2 - Math.abs(cw), 3, 2);
        ctx.fillStyle = '#333';
        ctx.fillRect(sx + 3, sy - 1, 2, 1);
        break;

      case 'butterfly':
        var bColor = ['#e06080','#60a0e0','#e0c040','#a060d0'][(w.variant >> 2) % 4];
        ctx.fillStyle = bColor;
        var bw = Math.sin(w.animPhase) * 2.5;
        ctx.globalAlpha = 0.8;
        // Wings
        ctx.beginPath();
        ctx.ellipse(sx - 2, sy + bw * 0.5, 3, 2 + Math.abs(bw), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 2, sy - bw * 0.5, 3, 2 + Math.abs(bw), 0, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = '#222';
        ctx.fillRect(sx - 0.5, sy - 2, 1, 4);
        break;

      case 'dragonfly':
        ctx.fillStyle = '#306090';
        ctx.fillRect(sx - 4, sy, 8, 2);
        // Wings
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#a0d0f0';
        var dw = Math.sin(w.animPhase * 2) * 2;
        ctx.fillRect(sx - 5, sy - 2 - Math.abs(dw), 4, 2);
        ctx.fillRect(sx + 2, sy - 2 - Math.abs(dw), 4, 2);
        break;

      case 'rabbit':
        ctx.fillStyle = '#b0a080';
        // Body
        ctx.beginPath();
        ctx.ellipse(sx, sy, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(sx + 3, sy - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Ears
        ctx.fillRect(sx + 2, sy - 6, 1.5, 4);
        ctx.fillRect(sx + 4, sy - 5, 1.5, 3);
        // Eye
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 4, sy - 2, 1, 1);
        // Hopping animation
        if (w.state === 'move' || w.state === 'flee') {
          ctx.fillStyle = '#b0a080';
          var hop = Math.abs(Math.sin(t * 12)) * 2;
          ctx.translate(0, -hop);
        }
        break;

      case 'deer':
        ctx.fillStyle = '#8a6a40';
        // Body
        ctx.beginPath();
        ctx.ellipse(sx, sy, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Legs
        ctx.fillStyle = '#7a5a30';
        var legAnim = w.state === 'flee' ? Math.sin(t * 8) * 3 : 0;
        ctx.fillRect(sx - 4 + legAnim, sy + 2, 2, 6);
        ctx.fillRect(sx - 1 - legAnim, sy + 2, 2, 6);
        ctx.fillRect(sx + 2 + legAnim, sy + 2, 2, 6);
        ctx.fillRect(sx + 5 - legAnim, sy + 2, 2, 6);
        // Head + neck
        ctx.fillStyle = '#8a6a40';
        ctx.fillRect(sx + 5, sy - 6, 3, 6);
        ctx.beginPath();
        ctx.arc(sx + 7, sy - 7, 3, 0, Math.PI * 2);
        ctx.fill();
        // Eye
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 8, sy - 8, 1, 1);
        // Antlers (small)
        ctx.strokeStyle = '#5a4020';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 6, sy - 10); ctx.lineTo(sx + 4, sy - 14);
        ctx.moveTo(sx + 8, sy - 10); ctx.lineTo(sx + 10, sy - 13);
        ctx.stroke();
        break;

      case 'rat':
        ctx.fillStyle = '#6a5a4a';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.strokeStyle = '#8a7a6a';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.quadraticCurveTo(sx - 6, sy - 2, sx - 8, sy + 1);
        ctx.stroke();
        // Ears
        ctx.fillStyle = '#8a7060';
        ctx.fillRect(sx + 1, sy - 2, 2, 2);
        // Eye
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 2, sy - 1, 1, 1);
        break;

      case 'fish':
        ctx.fillStyle = 'rgba(80,120,160,0.5)';
        var fx = Math.sin(w.animPhase) * 2;
        ctx.beginPath();
        ctx.ellipse(sx + fx, sy, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.beginPath();
        ctx.moveTo(sx - 4 + fx, sy);
        ctx.lineTo(sx - 7 + fx, sy - 2);
        ctx.lineTo(sx - 7 + fx, sy + 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  // ======= CLOUDS =======

  function renderClouds() {
    if (!Game.Ambient) return;
    var clouds = Game.Ambient.getClouds();
    ctx.save();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.globalAlpha = c.opacity;
      ctx.fillStyle = '#e8e4e0';
      // Multiple overlapping ellipses for organic cloud shape
      var blobSpacing = c.w / c.blobs;
      for (var b = 0; b < c.blobs; b++) {
        var bx = c.x + b * blobSpacing;
        var by = c.y + Math.sin(b * 1.5) * c.h * 0.3;
        var bw = blobSpacing * 0.8 + Math.sin(b * 2.3) * 10;
        var bh = c.h * (0.6 + Math.sin(b * 1.7) * 0.3);
        ctx.beginPath();
        ctx.ellipse(bx, by, bw, bh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ======= WEATHER RENDERING (rain, storm) =======

  function renderWeather() {
    if (!Game.Ambient) return;
    var w = Game.Ambient.getWeather();
    if (w.type !== 'rain' && w.type !== 'storm') return;

    ctx.save();
    var intensity = w.intensity;
    var wind = w.wind;

    // Rain drops
    ctx.strokeStyle = 'rgba(160,180,200,' + (intensity * 0.4) + ')';
    ctx.lineWidth = 1;
    var dropCount = Math.floor(intensity * 120);
    ctx.beginPath();
    for (var i = 0; i < dropCount; i++) {
      // Pseudo-random but consistent rain pattern
      var rx = ((animTime * 50 + i * 137.5) % (screenW + 100)) - 50;
      var ry = ((animTime * 250 + i * 89.3) % (screenH + 80)) - 40;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + wind * 8, ry + 12);
    }
    ctx.stroke();

    // Storm: darken + occasional flash
    if (w.type === 'storm') {
      ctx.fillStyle = 'rgba(0,0,10,' + (intensity * 0.15) + ')';
      ctx.fillRect(0, 0, screenW, screenH);
      // Lightning flash (rare)
      if (Math.random() < 0.002) {
        ctx.fillStyle = 'rgba(220,220,240,0.15)';
        ctx.fillRect(0, 0, screenW, screenH);
      }
    }

    // Overcast dim
    if (w.type === 'rain') {
      ctx.fillStyle = 'rgba(20,20,30,' + (intensity * 0.08) + ')';
      ctx.fillRect(0, 0, screenW, screenH);
    }
    ctx.restore();
  }

  // ======= HELPERS =======

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    var words = text.split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line + (line ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function worldToScreen(wx, wy) { return { x: wx - camera.x, y: wy - camera.y }; }
  function screenToWorld(sx, sy) { return { x: sx + camera.x, y: sy + camera.y }; }
  function getCamera() { return camera; }

  return {
    init: init, resize: resize, updateCamera: updateCamera, render: render,
    worldToScreen: worldToScreen, screenToWorld: screenToWorld, getCamera: getCamera,
    spawnParticle: spawnParticle, triggerShake: triggerShake
  };
})();
