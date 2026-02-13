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
  }

  function render() {
    ctx.clearRect(0, 0, screenW, screenH);

    var startCX = Math.max(0, Math.floor(camera.x / (CS * TS)));
    var startCY = Math.max(0, Math.floor(camera.y / (CS * TS)));
    var endCX = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.x + camera.w) / (CS * TS)));
    var endCY = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.y + camera.h) / (CS * TS)));

    for (var cy = startCY; cy <= endCY; cy++)
      for (var cx = startCX; cx <= endCX; cx++) {
        var chunkCanvas = W.renderChunk(cx, cy);
        ctx.drawImage(chunkCanvas, Math.floor(cx * CS * TS - camera.x), Math.floor(cy * CS * TS - camera.y));
      }

    // Entities sorted by Y
    var entities = collectVisibleEntities();
    entities.sort(function (a, b) { return a.y - b.y; });

    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      var sx = Math.floor(e.x - camera.x);
      var sy = Math.floor(e.y - camera.y);
      if (e.isPlayer) drawPlayer(ctx, sx, sy, e);
      else drawNPC(ctx, sx, sy, e);
    }

    // Particles (above entities)
    renderParticles();

    // Combat effects
    renderCombatEffects();
    renderDamageNumbers();

    // Day/night
    renderDayNight();

    // Speech bubbles after overlay
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.isPlayer || !e.alive) continue;
      renderSpeechBubble(ctx, Math.floor(e.x - camera.x), Math.floor(e.y - camera.y), e);
    }
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

    // Dust particles when moving
    if (moving && Math.random() < 0.3) {
      spawnParticle(ps.x - Math.cos(fAngle) * 6, ps.y + 10, 'dust');
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

    // Name label when close
    var p = Game.Player.getState();
    if (U.dist(npc.x, npc.y, p.x, p.y) < 80) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(220,210,180,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name.first, sx, bodyY - getNameOffset(npc));
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
      if (p.type === 'dust') p.vy += 20 * dt; // gravity
      if (p.type === 'ember') p.vy += 10 * dt;
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
    spawnParticle: spawnParticle
  };
})();
