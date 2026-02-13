var Game = Game || {};

Game.Renderer = (function () {
  var U = Game.Utils;
  var W, TS, CS;
  var canvas, ctx;
  var camera = { x: 0, y: 0, targetX: 0, targetY: 0, w: 0, h: 0, zoom: 1 };
  var screenW, screenH;

  function init(cvs) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
    W = Game.World;
    TS = W.TILE_SIZE;
    CS = W.CHUNK_SIZE;
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
    var player = Game.Player.getState();
    camera.targetX = player.x - camera.w / 2;
    camera.targetY = player.y - camera.h / 2;

    // Smooth follow
    var smoothing = 1 - Math.pow(0.001, dt);
    camera.x += (camera.targetX - camera.x) * smoothing;
    camera.y += (camera.targetY - camera.y) * smoothing;

    // Clamp to world bounds
    var worldPx = W.WORLD_TILES * TS;
    camera.x = U.clamp(camera.x, 0, Math.max(0, worldPx - camera.w));
    camera.y = U.clamp(camera.y, 0, Math.max(0, worldPx - camera.h));
  }

  function render() {
    ctx.clearRect(0, 0, screenW, screenH);

    // Determine visible chunks
    var startCX = Math.max(0, Math.floor(camera.x / (CS * TS)));
    var startCY = Math.max(0, Math.floor(camera.y / (CS * TS)));
    var endCX = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.x + camera.w) / (CS * TS)));
    var endCY = Math.min(W.WORLD_CHUNKS - 1, Math.floor((camera.y + camera.h) / (CS * TS)));

    // Render terrain chunks
    for (var cy = startCY; cy <= endCY; cy++) {
      for (var cx = startCX; cx <= endCX; cx++) {
        var chunkCanvas = W.renderChunk(cx, cy);
        var dx = cx * CS * TS - camera.x;
        var dy = cy * CS * TS - camera.y;
        ctx.drawImage(chunkCanvas, Math.floor(dx), Math.floor(dy));
      }
    }

    // Render entities (sorted by Y for depth)
    var entities = collectVisibleEntities();
    entities.sort(function (a, b) { return a.y - b.y; });

    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      var sx = Math.floor(e.x - camera.x);
      var sy = Math.floor(e.y - camera.y);

      if (e.isPlayer) {
        drawPlayer(ctx, sx, sy, e);
      } else {
        drawNPC(ctx, sx, sy, e);
      }
    }

    // Combat effects
    renderCombatEffects();

    // Damage numbers
    renderDamageNumbers();

    // Day/night overlay
    renderDayNight();

    // Speech bubbles (rendered after overlay so they're visible)
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.isPlayer) continue;
      var sx = Math.floor(e.x - camera.x);
      var sy = Math.floor(e.y - camera.y);
      renderSpeechBubble(ctx, sx, sy, e);
    }
  }

  function collectVisibleEntities() {
    var entities = [];
    var player = Game.Player.getState();
    var pad = 100;

    // Player
    if (player.alive) {
      entities.push({
        x: player.x, y: player.y, isPlayer: true,
        facing: player.facing, attacking: player.attackTimer > 0,
        blocking: player.blocking, dodging: player.dodging,
        attackType: player.attackType
      });
    }

    // NPCs
    var npcs = Game.NPC.getNPCs();
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n.alive) continue;
      if (n.x < camera.x - pad || n.x > camera.x + camera.w + pad) continue;
      if (n.y < camera.y - pad || n.y > camera.y + camera.h + pad) continue;
      entities.push(n);
    }

    return entities;
  }

  function drawPlayer(ctx, sx, sy, p) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dodge flash
    if (p.dodging) {
      ctx.globalAlpha = 0.6;
    }

    // Body
    var bodyColor = '#6a5a3a';
    var armor = Game.Player.getState().equipped.armor;
    if (armor) {
      if (armor.id === 'leather_armor') bodyColor = '#5a4a2a';
      else if (armor.id === 'chain_armor') bodyColor = '#7a7a8a';
    }
    ctx.fillStyle = bodyColor;
    ctx.fillRect(sx - 6, sy - 8, 12, 16);

    // Head
    ctx.fillStyle = '#e8c4a0';
    ctx.beginPath();
    ctx.arc(sx, sy - 14, 7, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#4a3020';
    ctx.beginPath();
    ctx.arc(sx, sy - 17, 6, Math.PI, Math.PI * 2);
    ctx.fill();

    // Weapon (when attacking)
    if (p.attacking) {
      var facingAngles = {
        'N': -Math.PI / 2, 'S': Math.PI / 2, 'E': 0, 'W': Math.PI,
        'NE': -Math.PI / 4, 'NW': -3 * Math.PI / 4,
        'SE': Math.PI / 4, 'SW': 3 * Math.PI / 4
      };
      var ang = facingAngles[p.facing] || 0;
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx + Math.cos(ang) * 20, sy - 4 + Math.sin(ang) * 20);
      ctx.stroke();
    }

    // Blocking indicator
    if (p.blocking) {
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 3;
      var bAng = getFacingAngle(p.facing);
      ctx.beginPath();
      ctx.arc(sx + Math.cos(bAng) * 10, sy - 2 + Math.sin(bAng) * 10, 8, bAng - 0.8, bAng + 0.8);
      ctx.stroke();
    }

    // Facing indicator (small eye dots)
    var eyeOff = getFacingOffset(p.facing);
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(sx + eyeOff.x - 1, sy - 15, 2, 2);
    if (p.facing !== 'W' && p.facing !== 'E') {
      ctx.fillRect(sx + eyeOff.x2 - 1, sy - 15, 2, 2);
    }

    ctx.restore();

    // Health/damage indicator
    var ps = Game.Player.getState();
    if (ps.bleeding > 0) {
      ctx.fillStyle = 'rgba(180,20,20,0.4)';
      ctx.beginPath();
      ctx.arc(sx + U.randFloat(-5, 5), sy + 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNPC(ctx, sx, sy, npc) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sleeping indicator
    if (npc.state === 'sleep') {
      ctx.globalAlpha = 0.6;
    }

    // Body
    ctx.fillStyle = npc.bodyColor || '#5a5040';
    ctx.fillRect(sx - 5, sy - 7, 10, 14);

    // Head
    ctx.fillStyle = npc.headColor || '#e8c4a0';
    ctx.beginPath();
    ctx.arc(sx, sy - 12, 6, 0, Math.PI * 2);
    ctx.fill();

    // Job-specific details
    if (npc.job === 'guard') {
      // Helmet
      ctx.fillStyle = '#6a6a7a';
      ctx.beginPath();
      ctx.arc(sx, sy - 14, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - 6, sy - 14, 12, 3);
    } else if (npc.job === 'king') {
      // Crown
      ctx.fillStyle = '#d4a030';
      ctx.fillRect(sx - 5, sy - 20, 10, 4);
      ctx.fillRect(sx - 5, sy - 23, 2, 3);
      ctx.fillRect(sx - 1, sy - 24, 2, 4);
      ctx.fillRect(sx + 3, sy - 23, 2, 3);
    } else if (npc.job === 'noble') {
      // Fancy hat
      ctx.fillStyle = '#8a3030';
      ctx.fillRect(sx - 5, sy - 20, 10, 4);
    } else if (npc.job === 'blacksmith') {
      // Apron
      ctx.fillStyle = '#3a3030';
      ctx.fillRect(sx - 4, sy - 3, 8, 10);
    }

    // Health bar (only show if damaged)
    if (npc.health < npc.maxHealth) {
      var hpPct = npc.health / npc.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - 12, sy - 24, 24, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#4a8a4a' : hpPct > 0.25 ? '#8a8a2a' : '#8a2a2a';
      ctx.fillRect(sx - 12, sy - 24, Math.round(24 * hpPct), 3);
    }

    // Combat state indicator
    if (npc.state === 'fight') {
      ctx.strokeStyle = '#aa3333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy - 12, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bleeding
    if (npc.bleeding > 0) {
      ctx.fillStyle = 'rgba(180,20,20,0.5)';
      ctx.beginPath();
      ctx.arc(sx + U.randFloat(-4, 4), sy + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderSpeechBubble(ctx, sx, sy, npc) {
    var text = null;
    var timer = 0;

    if (npc.speechTimer > 0) {
      text = npc.speechBubble;
      timer = npc.speechTimer;
    } else if (npc.barkTimer > 0) {
      text = npc.bark;
      timer = npc.barkTimer;
    }
    if (!text) return;

    ctx.save();
    ctx.font = '11px sans-serif';
    var metrics = ctx.measureText(text);
    var tw = Math.min(metrics.width + 12, 180);
    var bx = sx - tw / 2;
    var by = sy - 36;

    // Wrap text if too long
    var lines = wrapText(ctx, text, 168);
    var th = lines.length * 14 + 8;
    by = sy - 30 - th;

    ctx.globalAlpha = Math.min(1, timer);

    // Bubble background
    ctx.fillStyle = 'rgba(250,245,230,0.92)';
    roundRect(ctx, bx, by, tw, th, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,80,50,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw, th, 4);
    ctx.stroke();

    // Pointer
    ctx.fillStyle = 'rgba(250,245,230,0.92)';
    ctx.beginPath();
    ctx.moveTo(sx - 4, by + th);
    ctx.lineTo(sx, by + th + 5);
    ctx.lineTo(sx + 4, by + th);
    ctx.fill();

    // Text
    ctx.fillStyle = '#2a1a0a';
    ctx.textAlign = 'center';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], sx, by + 14 + i * 14);
    }

    ctx.restore();
  }

  function renderCombatEffects() {
    var effects = Game.Combat.getEffects();
    for (var i = 0; i < effects.length; i++) {
      var ef = effects[i];
      var sx = Math.floor(ef.x - camera.x);
      var sy = Math.floor(ef.y - camera.y);
      var progress = 1 - ef.timer / ef.maxTimer;

      if (ef.type === 'slash') {
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        var r = 15 + progress * 15;
        ctx.arc(sx, sy - 4, r, ef.angle - 0.6, ef.angle + 0.6);
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
      var sx = Math.floor(dn.x - camera.x);
      var sy = Math.floor(dn.y - camera.y);
      ctx.globalAlpha = dn.alpha;
      ctx.fillStyle = '#cc2222';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText('-' + dn.amount, sx, sy);
      ctx.fillText('-' + dn.amount, sx, sy);
    }
    ctx.restore();
  }

  function renderDayNight() {
    if (!Game.time) return;
    var hour = (Game.time / 60) % 24;
    var darkness = 0;

    if (hour >= 20) {
      darkness = (hour - 20) / 3; // 20-23: getting dark
    } else if (hour < 5) {
      darkness = 1; // full night
    } else if (hour < 7) {
      darkness = 1 - (hour - 5) / 2; // dawn
    }

    darkness = U.clamp(darkness, 0, 0.6);

    if (darkness > 0.01) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,10,30,' + darkness + ')';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    }

    // Sunrise/sunset tint
    if (hour >= 5 && hour < 7) {
      ctx.save();
      ctx.fillStyle = 'rgba(180,100,40,0.08)';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    } else if (hour >= 18 && hour < 20) {
      ctx.save();
      ctx.fillStyle = 'rgba(180,80,30,0.1)';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    }
  }

  // Helpers
  function getFacingAngle(facing) {
    var angles = {
      'N': -Math.PI / 2, 'S': Math.PI / 2, 'E': 0, 'W': Math.PI,
      'NE': -Math.PI / 4, 'NW': -3 * Math.PI / 4,
      'SE': Math.PI / 4, 'SW': 3 * Math.PI / 4
    };
    return angles[facing] || 0;
  }

  function getFacingOffset(facing) {
    switch (facing) {
      case 'N': return { x: -3, x2: 3 };
      case 'S': return { x: -3, x2: 3 };
      case 'E': return { x: 3, x2: 5 };
      case 'W': return { x: -5, x2: -3 };
      case 'NE': return { x: 0, x2: 4 };
      case 'NW': return { x: -4, x2: 0 };
      case 'SE': return { x: 0, x2: 4 };
      case 'SW': return { x: -4, x2: 0 };
      default: return { x: -3, x2: 3 };
    }
  }

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
    var words = text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line + (line ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function worldToScreen(wx, wy) {
    return { x: wx - camera.x, y: wy - camera.y };
  }

  function screenToWorld(sx, sy) {
    return { x: sx + camera.x, y: sy + camera.y };
  }

  function getCamera() { return camera; }

  return {
    init: init, resize: resize,
    updateCamera: updateCamera, render: render,
    worldToScreen: worldToScreen, screenToWorld: screenToWorld,
    getCamera: getCamera
  };
})();
