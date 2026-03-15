var Game = Game || {};

// Lockpicking & Pickpocket minigames - Kingdom Come: Deliverance inspired
Game.Minigames = (function () {
  var U = Game.Utils;

  // --- Shared state ---
  var activeGame = null; // null | 'lockpick' | 'pickpocket' | 'forage'
  var canvas, ctx;
  var W, H;

  // --- Lockpick state ---
  var lp = {
    active: false,
    // The "sweet spot" angle on the lock cylinder
    sweetSpot: 0,       sweetSpotWidth: 0,
    // Current pick angle (player controls this)
    pickAngle: 0,       pickTargetAngle: 0,
    // Tension (how hard the player is turning the cylinder)
    tension: 0,         tensionDir: 0,
    // Cylinder rotation
    cylinderAngle: 0,
    // Progress
    progress: 0,
    // Pick wobble (when over the sweet spot under tension)
    wobble: 0,
    // Failure
    pickBroken: false,  pickBreakTimer: 0,
    // Success / fail anim
    openTimer: 0,       failTimer: 0,
    // Difficulty (0=easy, 1=medium, 2=hard)
    difficulty: 0,
    onSuccess: null,    onFail: null,
    // Feedback
    feedbackAlpha: 0,   feedbackText: ''
  };

  // --- Pickpocket state ---
  var pp = {
    active: false,
    // Slider position and target zone
    sliderPos: 0,    sliderDir: 1,    sliderSpeed: 0,
    zoneStart: 0,    zoneEnd: 0,      zoneWidth: 0,
    // Timing press
    pressTimer: 0,   maxPressTime: 2.5,
    // Animation
    pulseTimer: 0,
    // State
    done: false,     success: false,
    flashTimer: 0,
    onSuccess: null, onFail: null,
    targetNPC: null
  };

  // --- Forage state ---
  var fg = {
    active: false,
    timer: 0, maxTime: 3.5,
    dots: [],   // animated dots
    done: false,
    onDone: null
  };

  // =================== INIT ===================

  function init(cvs) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
  }

  // =================== LOCKPICKING ===================

  function startLockpick(difficulty, onSuccess, onFail) {
    var diff = difficulty || 0;
    var widths = [0.45, 0.3, 0.18]; // sweet spot arc in radians (larger = easier)
    lp.sweetSpot      = (Math.random() * Math.PI * 1.6) - Math.PI * 0.8; // random position
    lp.sweetSpotWidth = widths[Math.min(diff, 2)];
    lp.pickAngle      = -Math.PI * 0.9;
    lp.pickTargetAngle = lp.pickAngle;
    lp.tension        = 0;
    lp.tensionDir     = 0;
    lp.cylinderAngle  = 0;
    lp.progress       = 0;
    lp.wobble         = 0;
    lp.pickBroken     = false;
    lp.pickBreakTimer = 0;
    lp.openTimer      = 0;
    lp.failTimer      = 0;
    lp.difficulty     = diff;
    lp.feedbackAlpha  = 0;
    lp.feedbackText   = '';
    lp.onSuccess = onSuccess;
    lp.onFail    = onFail;
    lp.active    = true;
    activeGame   = 'lockpick';
  }

  function updateLockpick(dt) {
    if (!lp.active) return;

    // Failure animation
    if (lp.failTimer > 0) {
      lp.failTimer -= dt;
      if (lp.failTimer <= 0) {
        lp.active = false;
        activeGame = null;
        if (lp.onFail) lp.onFail();
      }
      return;
    }
    // Success animation
    if (lp.openTimer > 0) {
      lp.openTimer -= dt;
      lp.cylinderAngle = Math.min(Math.PI / 2, lp.cylinderAngle + dt * 2.5);
      if (lp.openTimer <= 0) {
        lp.active = false;
        activeGame = null;
        if (lp.onSuccess) lp.onSuccess();
      }
      return;
    }
    if (lp.pickBroken) {
      lp.pickBreakTimer -= dt;
      if (lp.pickBreakTimer <= 0) {
        // Try a new pick if player has picks; else fail
        var player = Game.Player ? Game.Player.getState() : null;
        var picks = player ? Game.Player.hasItem('lockpick') : null;
        if (picks && picks.qty > 0) {
          Game.Player.removeItem('lockpick', 1);
          // Slightly easier sweet spot on retry
          lp.sweetSpotWidth = Math.min(0.55, lp.sweetSpotWidth + 0.06);
          lp.pickBroken = false;
          lp.tension    = 0;
          lp.cylinderAngle = 0;
          lp.wobble     = 0;
          if (Game.UI) Game.UI.showNotification('Pick broke! Using another pick.', 'warning');
        } else {
          lp.failTimer = 0.8;
          lp.feedbackText = 'Out of picks!';
          lp.feedbackAlpha = 1;
        }
      }
      return;
    }

    // Player inputs: arrow keys or WASD to move pick, Space/J to apply tension
    var input = Game.Input ? Game.Input.getRaw() : {};
    var moveLeft  = input.ArrowLeft  || input.KeyA;
    var moveRight = input.ArrowRight || input.KeyD;
    var applyTension = input.Space || input.KeyJ || input.ShiftLeft;

    // Move pick angle
    var pickSpeed = 1.8 * dt;
    if (moveLeft)  lp.pickTargetAngle = Math.max(-Math.PI * 0.95, lp.pickTargetAngle - pickSpeed);
    if (moveRight) lp.pickTargetAngle = Math.min( Math.PI * 0.95, lp.pickTargetAngle + pickSpeed);
    lp.pickAngle += (lp.pickTargetAngle - lp.pickAngle) * Math.min(1, dt * 10);

    // Check if pick is in sweet spot
    var diff = Math.abs(lp.pickAngle - lp.sweetSpot);
    var inZone = diff < lp.sweetSpotWidth / 2;

    // Apply tension (rotate cylinder toward open)
    if (applyTension) {
      lp.tension = Math.min(1, lp.tension + dt * 0.7);
    } else {
      lp.tension = Math.max(0, lp.tension - dt * 2.0);
    }

    if (lp.tension > 0.05) {
      if (inZone) {
        // Correct position: cylinder turns, progress advances
        var angleOpen = (1 - diff / (lp.sweetSpotWidth / 2));
        lp.cylinderAngle = Math.min(Math.PI / 2, lp.cylinderAngle + lp.tension * angleOpen * dt * 1.5);
        lp.progress = lp.cylinderAngle / (Math.PI / 2);
        lp.wobble = Math.sin(Date.now() * 0.02) * 0.02 * (1 - angleOpen);

        if (lp.progress >= 1.0) {
          lp.openTimer  = 0.7;
          lp.feedbackText  = 'Unlocked!';
          lp.feedbackAlpha = 1;
        }
      } else {
        // Wrong position: pick wobbles and can break
        lp.wobble = (Math.random() - 0.5) * 0.12 * lp.tension;
        lp.cylinderAngle = Math.max(0, lp.cylinderAngle - dt * 0.5);

        // Break chance scales with tension and being off-target
        var breakChance = lp.tension * (diff / Math.PI) * 0.04 * dt;
        if (Math.random() < breakChance) {
          lp.pickBroken    = true;
          lp.pickBreakTimer = 1.2;
          lp.feedbackText  = 'Pick broke!';
          lp.feedbackAlpha = 1;
          if (Game.Renderer) Game.Renderer.triggerShake(4);
        }
      }
    } else {
      // No tension: cylinder returns to rest slowly
      lp.cylinderAngle = Math.max(0, lp.cylinderAngle - dt * 0.8);
      lp.wobble = 0;
    }

    // Fade feedback text
    if (lp.feedbackAlpha > 0) lp.feedbackAlpha -= dt * 0.7;
  }

  function renderLockpick() {
    if (!lp.active) return;
    W = window.innerWidth; H = window.innerHeight;
    var cx = W / 2, cy = H / 2;

    ctx.save();

    // Darken background
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    var pw = 320, ph = 360;
    var px = cx - pw / 2, py = cy - ph / 2;
    ctx.fillStyle = 'rgba(25,18,10,0.97)';
    roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = '#c8a840'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

    // Title
    ctx.font = 'bold 16px serif'; ctx.fillStyle = '#e8c870'; ctx.textAlign = 'center';
    ctx.fillText('LOCKPICKING', cx, py + 28);

    // Lock cylinder body
    var lx = cx, ly = cy - 20;
    var cylRadius = 55;

    // Cylinder
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(lp.cylinderAngle);
    // Main cylinder
    var cylGrad = ctx.createRadialGradient(-8, -8, 2, 0, 0, cylRadius);
    cylGrad.addColorStop(0, '#888');
    cylGrad.addColorStop(1, '#444');
    ctx.fillStyle = cylGrad;
    ctx.beginPath(); ctx.arc(0, 0, cylRadius, 0, Math.PI * 2); ctx.fill();
    // Keyhole slot
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-6, 0, 12, 22);
    // Sheen line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, cylRadius - 5, -Math.PI * 0.7, -Math.PI * 0.2); ctx.stroke();
    ctx.restore();

    // Sweet spot indicator (shown faintly when pick is near)
    var pickDist = Math.abs(lp.pickAngle - lp.sweetSpot);
    var zoneAlpha = Math.max(0, 0.6 - pickDist * 0.8);
    if (lp.tension > 0.1 && pickDist < lp.sweetSpotWidth * 1.5) zoneAlpha = 0.9;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.globalAlpha = zoneAlpha;
    ctx.strokeStyle = lp.tension > 0.05 && pickDist < lp.sweetSpotWidth / 2 ? '#60e080' : '#e08840';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, cylRadius + 8, lp.sweetSpot - lp.sweetSpotWidth / 2, lp.sweetSpot + lp.sweetSpotWidth / 2);
    ctx.stroke();
    ctx.restore();

    // Pick tool
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(lp.pickAngle + lp.wobble);
    ctx.strokeStyle = lp.pickBroken ? '#cc4444' : '#c8c0a0';
    ctx.lineWidth   = lp.pickBroken ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -(cylRadius + 22));
    ctx.stroke();
    // Hook at tip
    if (!lp.pickBroken) {
      ctx.beginPath();
      ctx.arc(4, -(cylRadius + 22), 5, Math.PI, 0, true);
      ctx.stroke();
    } else {
      // Broken pick jagged end
      ctx.strokeStyle = '#884444';
      ctx.beginPath();
      ctx.moveTo(0, -(cylRadius + 14));
      ctx.lineTo(4, -(cylRadius + 8));
      ctx.moveTo(0, -(cylRadius + 14));
      ctx.lineTo(-4, -(cylRadius + 6));
      ctx.stroke();
    }
    ctx.restore();

    // Tension wrench (bottom of lock)
    ctx.save();
    ctx.translate(lx, ly + cylRadius + 12);
    ctx.strokeStyle = '#a0a080';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(16, 12); ctx.stroke();
    // Show tension with color/glow
    if (lp.tension > 0.05) {
      ctx.strokeStyle = lp.tension > 0.6 ? '#e06040' : '#e0b060';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(16, 12 * lp.tension); ctx.stroke();
    }
    ctx.restore();

    // Progress bar
    var pby = py + ph - 55;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, px + 20, pby, pw - 40, 12, 3); ctx.fill();
    var pCol = lp.progress > 0.8 ? '#60e080' : '#e0b060';
    ctx.fillStyle = pCol;
    roundRect(ctx, px + 20, pby, (pw - 40) * lp.progress, 12, 3); ctx.fill();
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#ccc'; ctx.textAlign = 'center';
    ctx.fillText('Cylinder Progress', cx, pby + 24);

    // Instructions
    ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(200,180,130,0.7)'; ctx.textAlign = 'center';
    ctx.fillText('A/D or ←/→ to move pick   Space/J to apply tension', cx, py + ph - 18);

    // Feedback text
    if (lp.feedbackAlpha > 0) {
      ctx.globalAlpha = lp.feedbackAlpha;
      ctx.font = 'bold 18px serif';
      ctx.fillStyle = lp.feedbackText.includes('broke') ? '#e04040' : '#60e080';
      ctx.fillText(lp.feedbackText, cx, py + ph - 75);
      ctx.globalAlpha = 1;
    }

    // ESC to cancel hint
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(160,140,100,0.5)'; ctx.textAlign = 'right';
    ctx.fillText('[Esc] Cancel', px + pw - 10, py + 18);

    ctx.restore();
  }

  // =================== PICKPOCKET ===================

  function startPickpocket(npc, onSuccess, onFail) {
    var stealth  = Game.Player ? Game.Player.getState().skills.stealth : 1;
    // Harder with lower stealth
    var speed    = 200 - stealth * 1.5; // slider pixels per second
    var zoneSize = 50 + stealth * 1.2;  // wider zone with higher stealth

    pp.sliderPos  = 0;
    pp.sliderDir  = 1;
    pp.sliderSpeed = Math.max(80, speed);
    pp.zoneWidth  = Math.min(120, Math.max(35, zoneSize));
    pp.zoneStart  = 100 + Math.random() * (260 - pp.zoneWidth);
    pp.zoneEnd    = pp.zoneStart + pp.zoneWidth;
    pp.pressTimer = 0;
    pp.maxPressTime = 3.0;
    pp.pulseTimer = 0;
    pp.done       = false;
    pp.success    = false;
    pp.flashTimer = 0;
    pp.targetNPC  = npc;
    pp.onSuccess  = onSuccess;
    pp.onFail     = onFail;
    pp.active     = true;
    activeGame    = 'pickpocket';
  }

  function updatePickpocket(dt) {
    if (!pp.active) return;
    if (pp.done) {
      pp.flashTimer -= dt;
      if (pp.flashTimer <= 0) {
        pp.active = false;
        activeGame = null;
        if (pp.success) { if (pp.onSuccess) pp.onSuccess(); }
        else             { if (pp.onFail)    pp.onFail();    }
      }
      return;
    }

    // Move slider back and forth
    pp.sliderPos += pp.sliderDir * pp.sliderSpeed * dt;
    if (pp.sliderPos >= 360) { pp.sliderPos = 360; pp.sliderDir = -1; }
    if (pp.sliderPos <= 0)   { pp.sliderPos = 0;   pp.sliderDir =  1; }

    pp.pressTimer += dt;
    pp.pulseTimer += dt;

    // Auto-fail if player waits too long
    if (pp.pressTimer >= pp.maxPressTime) {
      pp.done = true; pp.success = false; pp.flashTimer = 0.9;
      return;
    }

    // Player presses Space/J to grab
    var input = Game.Input ? Game.Input.getRaw() : {};
    if (input.Space || input.KeyJ || input.KeyE) {
      var inZone = pp.sliderPos >= pp.zoneStart && pp.sliderPos <= pp.zoneEnd;
      pp.done    = true;
      pp.success = inZone;
      pp.flashTimer = 1.0;
    }
  }

  function renderPickpocket() {
    if (!pp.active) return;
    W = window.innerWidth; H = window.innerHeight;
    var cx = W / 2, cy = H / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);

    // Panel
    var pw = 400, ph = 180;
    var px = cx - pw / 2, py = cy - ph / 2;
    ctx.fillStyle = 'rgba(18,13,8,0.97)';
    roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#a09060'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // Title
    ctx.font = 'bold 15px serif'; ctx.fillStyle = '#e8c870'; ctx.textAlign = 'center';
    ctx.fillText('PICKPOCKET', cx, py + 26);

    // NPC name
    if (pp.targetNPC) {
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#b0a080';
      ctx.fillText('Target: ' + pp.targetNPC.name.full, cx, py + 46);
    }

    // Track background
    var trackX = px + 20, trackY = cy + 10, trackW = pw - 40, trackH = 24;
    ctx.fillStyle = '#1a1208';
    roundRect(ctx, trackX, trackY, trackW, trackH, 4); ctx.fill();
    ctx.strokeStyle = '#4a3a20'; ctx.lineWidth = 1;
    roundRect(ctx, trackX, trackY, trackW, trackH, 4); ctx.stroke();

    // Safe zone (green)
    var zx = trackX + pp.zoneStart / 400 * trackW;
    var zw = pp.zoneWidth / 400 * trackW;
    ctx.fillStyle = pp.done
      ? (pp.success ? 'rgba(60,200,80,0.8)' : 'rgba(200,40,40,0.5)')
      : 'rgba(60,180,80,0.35)';
    roundRect(ctx, zx, trackY + 2, zw, trackH - 4, 3); ctx.fill();

    // Slider / cursor
    var slx = trackX + pp.sliderPos / 400 * trackW;
    ctx.fillStyle = pp.done
      ? (pp.success ? '#80ff90' : '#ff6060')
      : '#e8d080';
    ctx.beginPath();
    ctx.moveTo(slx, trackY - 6);
    ctx.lineTo(slx + 8, trackY + trackH + 4);
    ctx.lineTo(slx - 8, trackY + trackH + 4);
    ctx.closePath();
    ctx.fill();

    // Countdown bar
    var remain = Math.max(0, 1 - pp.pressTimer / pp.maxPressTime);
    ctx.fillStyle = remain > 0.4 ? '#e0a060' : '#e04040';
    roundRect(ctx, px + 20, py + ph - 32, (pw - 40) * remain, 8, 2); ctx.fill();
    ctx.strokeStyle = '#5a4a28'; ctx.lineWidth = 1;
    roundRect(ctx, px + 20, py + ph - 32, pw - 40, 8, 2); ctx.stroke();

    // Instructions / result text
    ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(200,180,130,0.8)'; ctx.textAlign = 'center';
    if (!pp.done) {
      ctx.fillText('Press Space or J when the needle is in the green zone!', cx, py + ph - 10);
    } else {
      ctx.font = 'bold 16px serif';
      ctx.fillStyle = pp.success ? '#60e080' : '#e04040';
      ctx.fillText(pp.success ? 'Success!' : 'Caught!', cx, py + ph - 10);
    }

    ctx.restore();
  }

  // =================== FORAGING ===================

  function startForage(onDone) {
    fg.timer   = 0;
    fg.maxTime = 3.0;
    fg.dots    = [];
    fg.done    = false;
    fg.onDone  = onDone;
    fg.active  = true;
    activeGame = 'forage';
    // Generate dots (herb icons)
    for (var i = 0; i < 12; i++) {
      fg.dots.push({ x: Math.random(), y: Math.random(), phase: Math.random() * Math.PI * 2 });
    }
  }

  function updateForage(dt) {
    if (!fg.active) return;
    fg.timer += dt;
    if (fg.timer >= fg.maxTime) {
      fg.done   = true;
      fg.active = false;
      activeGame = null;
      if (fg.onDone) fg.onDone();
    }
  }

  function renderForage() {
    if (!fg.active) return;
    W = window.innerWidth; H = window.innerHeight;
    var cx = W / 2, cy = H / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);

    // Panel
    var pw = 280, ph = 130;
    var px = cx - pw / 2, py = cy - ph / 2;
    ctx.fillStyle = 'rgba(10,20,8,0.95)';
    roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#508050'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    ctx.font = 'bold 14px serif'; ctx.fillStyle = '#90c870'; ctx.textAlign = 'center';
    ctx.fillText('Foraging...', cx, py + 28);

    // Animated dots
    var now = fg.timer;
    for (var i = 0; i < fg.dots.length; i++) {
      var d = fg.dots[i];
      var alpha = 0.3 + 0.5 * Math.abs(Math.sin(d.phase + now * 2));
      var scale = 0.5 + 0.5 * (fg.timer / fg.maxTime);
      ctx.globalAlpha = alpha * scale;
      ctx.font = '16px serif';
      ctx.fillStyle = '#68c848';
      ctx.fillText('🌿', px + 20 + d.x * (pw - 40), py + 50 + d.y * 40);
    }
    ctx.globalAlpha = 1;

    // Progress bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, px + 20, py + ph - 32, pw - 40, 12, 3); ctx.fill();
    ctx.fillStyle = '#50a840';
    roundRect(ctx, px + 20, py + ph - 32, (pw - 40) * (fg.timer / fg.maxTime), 12, 3); ctx.fill();

    ctx.font = '10px sans-serif'; ctx.fillStyle = '#80b060'; ctx.globalAlpha = 0.8;
    ctx.fillText('Hold still to gather herbs...', cx, py + ph - 8);

    ctx.restore();
  }

  // =================== MAIN UPDATE / RENDER ===================

  function update(dt) {
    if (activeGame === 'lockpick')   updateLockpick(dt);
    if (activeGame === 'pickpocket') updatePickpocket(dt);
    if (activeGame === 'forage')     updateForage(dt);

    // ESC to cancel
    var input = Game.Input ? Game.Input.getRaw() : {};
    if (input.Escape && activeGame && activeGame !== 'forage') {
      cancelAll();
    }
  }

  function render() {
    if (activeGame === 'lockpick')   renderLockpick();
    if (activeGame === 'pickpocket') renderPickpocket();
    if (activeGame === 'forage')     renderForage();
  }

  function cancelAll() {
    if (lp.active) { lp.active = false; if (lp.onFail) lp.onFail(); }
    if (pp.active) { pp.active = false; if (pp.onFail) pp.onFail(); }
    if (fg.active) { fg.active = false; }
    activeGame = null;
  }

  function isActive() { return !!activeGame; }

  // =================== HELPERS ===================

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

  return {
    init: init,
    update: update, render: render,
    startLockpick: startLockpick,
    startPickpocket: startPickpocket,
    startForage: startForage,
    isActive: isActive, cancelAll: cancelAll
  };
})();
