var Game = Game || {};

Game.UI = (function () {
  var U = Game.Utils;
  var canvas, ctx;
  var W, H;
  var notifications = [];   // {text, timer, maxTimer, type}
  var showInventory = false;
  var showCharacter = false;
  var showDebug = false;
  var menuOpen = false;
  var deathScreen = false;
  var journalEntries = [];  // recent events log

  // Button definitions (will be positioned on resize)
  var BTN_SIZE = 52;
  var BTN_PAD = 9;
  var buttonDefs = {
    attack:      { label: 'ATK',  color: '#8a3030' },
    heavyAttack: { label: 'HVY',  color: '#6a1818' },
    block:       { label: 'BLK',  color: '#2a4a7a' },
    dodge:       { label: 'DGE',  color: '#2a6a2a' },
    interact:    { label: 'USE',  color: '#7a6a30' },
    forage:      { label: 'FRG',  color: '#2a6a2a' }
  };
  var buttonPositions = {};

  // Notification type colours
  var NOTIF_COLORS = {
    info:    'rgba(200,180,130,0.95)',
    warning: 'rgba(220,160,50,0.95)',
    danger:  'rgba(220,60,60,0.95)',
    success: 'rgba(80,200,80,0.95)',
    skill:   'rgba(100,180,240,0.95)'
  };

  function init(cvs) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
    notifications = [];
    deathScreen = false;
    positionButtons();
  }

  function positionButtons() {
    W = window.innerWidth;
    H = window.innerHeight;
    var safeBottom = 30; // safe area padding
    var baseX = W - BTN_SIZE - BTN_PAD - 10;
    var baseY = H - safeBottom - BTN_SIZE - BTN_PAD;

    // Right side button layout (arc pattern)
    buttonPositions.interact     = { x: baseX - BTN_SIZE - BTN_PAD, y: baseY - BTN_SIZE * 2 - BTN_PAD * 2 };
    buttonPositions.attack       = { x: baseX, y: baseY - BTN_SIZE - BTN_PAD };
    buttonPositions.heavyAttack  = { x: baseX - BTN_SIZE - BTN_PAD, y: baseY };
    buttonPositions.block        = { x: baseX - BTN_SIZE * 2 - BTN_PAD * 2, y: baseY - BTN_SIZE - BTN_PAD };
    buttonPositions.dodge        = { x: baseX, y: baseY };
    buttonPositions.forage       = { x: baseX - BTN_SIZE * 2 - BTN_PAD * 2, y: baseY };

    // Register with input system
    Game.Input.clearButtons();
    for (var name in buttonPositions) {
      var bp = buttonPositions[name];
      Game.Input.registerButton(name, bp.x, bp.y, BTN_SIZE, BTN_SIZE);
    }
  }

  function resize() {
    positionButtons();
  }

  function update(dt) {
    // Handle interact
    if (Game.Input.isAction('interact')) {
      Game.Input.consumeAction('interact');
      if (Game.Dialogue.isActive()) {
        // Already in dialogue, ignore
      } else if (Game.Minigames && Game.Minigames.isActive()) {
        // Minigame handles its own input
      } else {
        // Find nearest NPC to interact with
        var nearby = Game.NPC.getNearPlayer(60);
        if (nearby.length > 0) {
          var closest = nearby[0];
          var minDist = Infinity;
          for (var i = 0; i < nearby.length; i++) {
            var d = U.dist(nearby[i].x, nearby[i].y, Game.Player.getState().x, Game.Player.getState().y);
            if (d < minDist) {
              minDist = d;
              closest = nearby[i];
            }
          }
          if (closest.alive) {
            Game.Dialogue.startDialogue(closest);
          }
        }
      }
    }

    // Forage button
    if (Game.Input.isAction('forage')) {
      Game.Input.consumeAction('forage');
      if (Game.Player && Game.Player.tryForage) Game.Player.tryForage();
    }

    // Inventory toggle
    if (Game.Input.isAction('inventory')) {
      Game.Input.consumeAction('inventory');
      showInventory = !showInventory;
    }

    // Save/Load
    if (Game.Input.isAction('save')) {
      Game.Input.consumeAction('save');
      Game.Save.save(false);
    }
    if (Game.Input.isAction('load')) {
      Game.Input.consumeAction('load');
      Game.Save.load();
    }

    // Debug toggle
    if (Game.Input.isAction('debug')) {
      Game.Input.consumeAction('debug');
      showDebug = !showDebug;
    }

    // Update notifications
    for (var i = notifications.length - 1; i >= 0; i--) {
      notifications[i].timer -= dt;
      if (notifications[i].timer <= 0) notifications.splice(i, 1);
    }

    // Death screen
    if (!Game.Player.getState().alive) {
      deathScreen = true;
    }
  }

  function render() {
    W = window.innerWidth;
    H = window.innerHeight;

    // Re-register buttons each frame (clears dialogue buttons from last frame)
    positionButtons();

    // HUD
    renderHealthStamina();
    renderMiniInfo();

    // Mobile controls
    renderJoystick();
    renderButtons();

    // Dialogue panel
    if (Game.Dialogue.isActive()) {
      renderDialogue();
    }

    // Inventory
    if (showInventory) {
      renderInventory();
    }

    // Notifications
    renderNotifications();

    // Debug overlay
    if (showDebug) {
      renderDebug();
    }

    // Death screen
    if (deathScreen) {
      renderDeath();
    }
  }

  function renderHealthStamina() {
    var p = Game.Player.getState();

    // Panel background - bottom-left corner, medieval style
    var panelX = 12, panelY = 12;
    var barW = 160, barH = 11;
    var panelW = barW + 20, panelH = 110;

    // Panel parchment background
    ctx.save();
    ctx.fillStyle = 'rgba(12,8,4,0.78)';
    roundRect(ctx, panelX - 4, panelY - 4, panelW + 8, panelH + 8, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,130,70,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, panelX - 4, panelY - 4, panelW + 8, panelH + 8, 6);
    ctx.stroke();

    var x = panelX + 6, y = panelY + 6;

    // ── HEALTH ──
    var hpPct = U.clamp(p.health / p.maxHealth, 0, 1);
    var hpColor = hpPct > 0.6 ? '#c03030' : hpPct > 0.3 ? '#cc6020' : '#ff2020';
    // Track
    ctx.fillStyle = 'rgba(40,8,8,0.8)';
    roundRect(ctx, x, y, barW, barH, 3); ctx.fill();
    // Fill
    if (hpPct > 0) {
      ctx.fillStyle = hpColor;
      roundRect(ctx, x, y, Math.round(barW * hpPct), barH, 3); ctx.fill();
      // Gleam
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, x, y, Math.round(barW * hpPct), 4, 2); ctx.fill();
    }
    // Low health pulse glow
    if (hpPct < 0.3) {
      ctx.fillStyle = 'rgba(200,0,0,' + (0.25 * (0.5 + 0.5 * Math.sin(Date.now() * 0.005))) + ')';
      roundRect(ctx, x, y, barW, barH, 3); ctx.fill();
    }
    // Icon + label
    ctx.font = 'bold 9px serif'; ctx.fillStyle = '#e87070'; ctx.textAlign = 'left';
    ctx.fillText('♥', x - 9, y + 9);
    ctx.font = '9px sans-serif'; ctx.fillStyle = 'rgba(220,180,160,0.85)';
    ctx.fillText(Math.ceil(p.health) + '/' + p.maxHealth, x + barW + 4, y + 9);

    // ── STAMINA ──
    y += barH + 7;
    var stPct = U.clamp(p.stamina / p.maxStamina, 0, 1);
    var stColor = stPct > 0.4 ? '#308a30' : '#708820';
    ctx.fillStyle = 'rgba(8,25,8,0.8)';
    roundRect(ctx, x, y, barW, barH, 3); ctx.fill();
    if (stPct > 0) {
      ctx.fillStyle = stColor;
      roundRect(ctx, x, y, Math.round(barW * stPct), barH, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, x, y, Math.round(barW * stPct), 4, 2); ctx.fill();
    }
    ctx.font = 'bold 9px serif'; ctx.fillStyle = '#70c870'; ctx.textAlign = 'left';
    ctx.fillText('✦', x - 9, y + 9);
    ctx.font = '9px sans-serif'; ctx.fillStyle = 'rgba(180,220,160,0.85)';
    ctx.fillText(Math.ceil(p.stamina) + '/' + p.maxStamina, x + barW + 4, y + 9);

    // ── NEEDS (hunger/thirst/fatigue) ──
    if (Game.Needs) {
      var ns = Game.Needs.getState();
      y += barH + 6;
      var needBarH = 7, needBarW = (barW - 4) / 3 - 2;

      // Hunger
      var hgPct = ns.hunger / 100;
      ctx.fillStyle = 'rgba(40,25,8,0.8)';
      roundRect(ctx, x, y, needBarW, needBarH, 2); ctx.fill();
      var hgColor = hgPct > 0.5 ? '#c89040' : hgPct > 0.25 ? '#d06020' : '#e03010';
      ctx.fillStyle = hgColor;
      roundRect(ctx, x, y, Math.round(needBarW * hgPct), needBarH, 2); ctx.fill();
      ctx.font = '7px sans-serif'; ctx.fillStyle = 'rgba(200,160,80,0.75)'; ctx.textAlign = 'center';
      ctx.fillText('Food', x + needBarW / 2, y + needBarH + 9);

      // Thirst
      var thx = x + needBarW + 3;
      var thPct = ns.thirst / 100;
      ctx.fillStyle = 'rgba(8,20,40,0.8)';
      roundRect(ctx, thx, y, needBarW, needBarH, 2); ctx.fill();
      var thColor = thPct > 0.5 ? '#4080c0' : thPct > 0.25 ? '#20a0d0' : '#20c0e0';
      ctx.fillStyle = thColor;
      roundRect(ctx, thx, y, Math.round(needBarW * thPct), needBarH, 2); ctx.fill();
      ctx.fillStyle = 'rgba(140,180,220,0.75)';
      ctx.fillText('Water', thx + needBarW / 2, y + needBarH + 9);

      // Fatigue (inverted - more is worse)
      var ftx = thx + needBarW + 3;
      var ftPct = ns.fatigue / 100;
      ctx.fillStyle = 'rgba(20,15,30,0.8)';
      roundRect(ctx, ftx, y, needBarW, needBarH, 2); ctx.fill();
      var ftColor = ftPct < 0.5 ? '#6050c0' : ftPct < 0.75 ? '#9040a0' : '#c02080';
      ctx.fillStyle = ftColor;
      roundRect(ctx, ftx, y, Math.round(needBarW * ftPct), needBarH, 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,140,200,0.75)';
      ctx.fillText('Tired', ftx + needBarW / 2, y + needBarH + 9);

      y += needBarH + 12;
    } else {
      y += barH + 6;
    }

    // ── STATUS EFFECTS ──
    ctx.textAlign = 'left';
    var statuses = [];
    if (p.bleeding > 0) statuses.push({ t: '⚠ Bleeding', c: '#dd3030' });
    if (p.inCombat)     statuses.push({ t: '⚔ Combat',   c: '#dd7030' });
    if (p.bounty > 0)   statuses.push({ t: '⚖ Bounty: ' + p.bounty + 'g', c: '#ddaa30' });
    if (Game.Needs && Game.Needs.isCritical()) statuses.push({ t: '☠ Critical needs!', c: '#ff3030' });

    for (var si = 0; si < statuses.length && si < 2; si++) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = statuses[si].c;
      ctx.fillText(statuses[si].t, x - 3, y);
      y += 12;
    }

    ctx.restore();
  }

  function renderMiniInfo() {
    var p = Game.Player.getState();
    ctx.save();

    // Top-right panel
    var panelW = 170, panelH = 95;
    var px = W - panelW - 10, py = 10;

    ctx.fillStyle = 'rgba(10,7,3,0.76)';
    roundRect(ctx, px, py, panelW, panelH, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(160,130,70,0.45)'; ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, panelW, panelH, 6); ctx.stroke();

    ctx.textAlign = 'right';
    var x = px + panelW - 8, y = py + 16;

    // Gold
    ctx.font = 'bold 12px serif'; ctx.fillStyle = '#d4a030';
    ctx.fillText('⚙ ' + p.gold + 'g', x, y); y += 15;

    // Time + day
    if (Game.time !== undefined) {
      var hour = Math.floor((Game.time / 60) % 24);
      var min  = Math.floor(Game.time % 60);
      var timeStr = (hour < 10 ? '0' : '') + hour + ':' + (min < 10 ? '0' : '') + min;
      var isNight = hour >= 20 || hour < 5;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = isNight ? '#8080cc' : '#c8d0b0';
      ctx.fillText('Day ' + (Game.day || 1) + '  ' + (isNight ? '☽' : '☼') + ' ' + timeStr, x, y); y += 15;
    }

    // Location
    var loc = Game.World.getLocationAt(p.x, p.y);
    var locNames = { ashford:'Ashford', millhaven:'Millhaven', thornfield:'Thornfield',
      banditCamp:'Bandit Camp', forest:'Forest', wilderness:'Wilderness' };
    ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(210,195,160,0.9)';
    ctx.fillText('📍 ' + (locNames[loc] || loc), x, y); y += 15;

    // Weather
    if (Game.Ambient) {
      var weather = Game.Ambient.getWeather();
      var wIcons  = { clear:'☀ Clear', cloudy:'⛅ Cloudy', overcast:'☁ Overcast', rain:'🌧 Rain', storm:'⛈ Storm' };
      ctx.fillStyle = weather.type === 'storm' ? '#8080cc' : 'rgba(180,195,220,0.75)';
      ctx.font = '10px sans-serif';
      ctx.fillText(wIcons[weather.type] || weather.type, x, y); y += 14;
    }

    // Reputation
    var rep = p.reputation.global;
    var repStr = (rep >= 0 ? '+' : '') + rep;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = rep > 10 ? '#70c070' : rep < -10 ? '#c07070' : '#b0a080';
    ctx.fillText('Rep ' + repStr + '  Kills ' + p.killCount, x, y);

    // Quick icon buttons (below panel)
    var qbSize = 30, qbGap = 6;
    var qbY = py + panelH + 8;
    var qbX = W - qbSize - 10;

    // Inventory (I)
    ctx.fillStyle = 'rgba(45,35,18,0.78)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(160,130,60,0.5)'; ctx.lineWidth = 1;
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.stroke();
    ctx.font = 'bold 13px serif'; ctx.fillStyle = '#d4a030'; ctx.textAlign = 'center';
    ctx.fillText('I', qbX + qbSize / 2, qbY + qbSize / 2 + 5);
    Game.Input.registerButton('inventory', qbX, qbY, qbSize, qbSize);

    // Save (S)
    qbX -= qbSize + qbGap;
    ctx.fillStyle = 'rgba(20,35,18,0.78)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(80,140,60,0.5)'; ctx.lineWidth = 1;
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.stroke();
    ctx.fillStyle = '#6aba4a'; ctx.font = 'bold 13px serif';
    ctx.fillText('S', qbX + qbSize / 2, qbY + qbSize / 2 + 5);
    Game.Input.registerButton('save', qbX, qbY, qbSize, qbSize);

    // Debug (?)
    qbX -= qbSize + qbGap;
    ctx.fillStyle = 'rgba(25,25,30,0.78)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(80,80,100,0.5)'; ctx.lineWidth = 1;
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 5); ctx.stroke();
    ctx.fillStyle = '#8090a0'; ctx.font = '11px sans-serif';
    ctx.fillText('DB', qbX + qbSize / 2, qbY + qbSize / 2 + 4);
    Game.Input.registerButton('debug', qbX, qbY, qbSize, qbSize);

    ctx.restore();
  }

  function renderJoystick() {
    var js = Game.Input.getJoystickState();
    if (!js.active) return;

    ctx.save();
    // Outer ring
    ctx.strokeStyle = 'rgba(200,180,140,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(js.cx, js.cy, js.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thumb
    ctx.fillStyle = 'rgba(200,180,140,0.5)';
    ctx.beginPath();
    ctx.arc(js.px, js.py, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,180,140,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function renderButtons() {
    ctx.save();
    var p = Game.Player ? Game.Player.getState() : null;
    for (var name in buttonPositions) {
      var bp = buttonPositions[name];
      var def = buttonDefs[name];
      if (!def) continue;

      var isActive = false;
      if (p) {
        if (name === 'attack' && p.attackTimer > 0 && p.attackType === 'light') isActive = true;
        if (name === 'heavyAttack' && p.attackTimer > 0 && p.attackType === 'heavy') isActive = true;
        if (name === 'block' && p.blocking) isActive = true;
        if (name === 'dodge' && p.dodging) isActive = true;
      }

      // Outer ring / drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(bp.x + BTN_SIZE/2, bp.y + BTN_SIZE/2 + 2, BTN_SIZE/2 + 1, 0, Math.PI*2); ctx.fill();

      // Button background
      ctx.fillStyle = isActive ? def.color : 'rgba(12,9,5,0.68)';
      ctx.globalAlpha = isActive ? 0.9 : 0.75;
      ctx.beginPath(); ctx.arc(bp.x + BTN_SIZE/2, bp.y + BTN_SIZE/2, BTN_SIZE/2, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;

      // Color ring
      ctx.strokeStyle = isActive ? '#ffffff' : def.color;
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.globalAlpha = isActive ? 0.9 : 0.55;
      ctx.beginPath(); ctx.arc(bp.x + BTN_SIZE/2, bp.y + BTN_SIZE/2, BTN_SIZE/2 - 1, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = isActive ? '#ffffff' : 'rgba(230,210,170,0.88)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, bp.x + BTN_SIZE / 2, bp.y + BTN_SIZE / 2);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function renderDialogue() {
    ctx.save();
    var dW = Math.min(W - 30, 400);
    var dH = Math.min(H * 0.45, 320);
    var dX = (W - dW) / 2;
    var dY = H - dH - 50;

    // Background
    ctx.fillStyle = 'rgba(30,25,18,0.92)';
    roundRect(ctx, dX, dY, dW, dH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,100,0.6)';
    ctx.lineWidth = 2;
    roundRect(ctx, dX, dY, dW, dH, 8);
    ctx.stroke();

    var npc = Game.Dialogue.getCurrentNPC();
    var text = Game.Dialogue.getText();
    var options = Game.Dialogue.getOptions();

    // NPC name
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#d4a030';
    ctx.textAlign = 'left';
    if (npc) {
      var jobLabel = Game.NPC.getJobLabel ? Game.NPC.getJobLabel(npc.job) : (npc.job === 'tavernKeeper' ? 'Tavern Keeper' : npc.job.charAt(0).toUpperCase() + npc.job.slice(1));
      ctx.fillText(npc.name.full + ' (' + jobLabel + ')', dX + 15, dY + 22);
    }

    // Dialogue text
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e8dcc8';
    var lines = wrapText(ctx, text, dW - 30);
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], dX + 15, dY + 42 + i * 16);
    }

    // Options
    var optY = dY + 42 + lines.length * 16 + 15;
    ctx.font = '12px sans-serif';
    for (var i = 0; i < options.length; i++) {
      var oy = optY + i * 28;
      if (oy + 24 > dY + dH) break; // overflow protection

      // Option button
      ctx.fillStyle = 'rgba(80,70,50,0.6)';
      roundRect(ctx, dX + 10, oy, dW - 20, 24, 4);
      ctx.fill();

      ctx.fillStyle = '#e8dcc8';
      ctx.fillText((i + 1) + '. ' + options[i].text, dX + 18, oy + 16);

      // Register as touch target
      Game.Input.registerButton('dialogOpt' + i, dX + 10, oy, dW - 20, 24);
    }

    // Handle dialogue option selection via touch
    for (var i = 0; i < options.length; i++) {
      if (Game.Input.isAction('dialogOpt' + i)) {
        Game.Input.consumeAction('dialogOpt' + i);
        Game.Dialogue.selectOption(i);
        break;
      }
    }

    // Keyboard selection (1-9)
    for (var i = 0; i < options.length && i < 9; i++) {
      var digitKey = 'Digit' + (i + 1);
      if (Game.Input.isKeyDown(digitKey)) {
        Game.Input.clearKey(digitKey);
        Game.Dialogue.selectOption(i);
        break;
      }
    }

    ctx.restore();
  }

  function renderInventory() {
    ctx.save();
    var iW = Math.min(W - 20, 420);
    var iH = Math.min(H - 60, 500);
    var iX = (W - iW) / 2;
    var iY = (H - iH) / 2;

    var p = Game.Player.getState();

    // Background - parchment style
    ctx.fillStyle = 'rgba(18,13,7,0.97)';
    roundRect(ctx, iX, iY, iW, iH, 10); ctx.fill();
    // Parchment inner tint
    ctx.fillStyle = 'rgba(80,60,20,0.06)';
    roundRect(ctx, iX + 4, iY + 4, iW - 8, iH - 8, 8); ctx.fill();
    // Border
    ctx.strokeStyle = '#c8a840'; ctx.lineWidth = 2;
    roundRect(ctx, iX, iY, iW, iH, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,170,80,0.3)'; ctx.lineWidth = 1;
    roundRect(ctx, iX + 4, iY + 4, iW - 8, iH - 8, 8); ctx.stroke();

    // Title bar
    ctx.fillStyle = 'rgba(80,60,15,0.5)';
    roundRect(ctx, iX, iY, iW, 34, 10); ctx.fill();
    ctx.font = 'bold 15px serif'; ctx.fillStyle = '#e8c860'; ctx.textAlign = 'center';
    ctx.fillText('CHARACTER & INVENTORY', iX + iW / 2, iY + 22);

    var lx = iX + 12, rx = iX + iW / 2 + 8, y = iY + 46;
    var colW = iW / 2 - 20;

    // ══ LEFT COLUMN: Character ══
    ctx.font = 'bold 11px serif'; ctx.fillStyle = '#d4a030'; ctx.textAlign = 'left';
    ctx.fillText('◈ CHARACTER', lx, y); y += 14;

    // Gold
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#e8dcc8';
    ctx.fillText('⚙ Gold: ' + p.gold + 'g', lx, y); y += 14;

    // Social class & rep
    ctx.fillText('Class: ' + p.socialClass.charAt(0).toUpperCase() + p.socialClass.slice(1), lx, y); y += 14;
    var rep = p.reputation.global;
    ctx.fillStyle = rep > 10 ? '#70c070' : rep < -10 ? '#c07070' : '#e8dcc8';
    ctx.fillText('Reputation: ' + (rep >= 0 ? '+' : '') + rep, lx, y); y += 16;

    // Equipment section
    ctx.font = 'bold 11px serif'; ctx.fillStyle = '#d4a030';
    ctx.fillText('◈ EQUIPMENT', lx, y); y += 13;
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#e8dcc8';

    var wep = p.equipped.weapon;
    var wepStr = wep ? wep.name : 'Bare Fists';
    var wepDur = wep && wep.durability !== undefined ? ' [' + wep.durability + '%]' : '';
    ctx.fillText('⚔ ' + wepStr + wepDur, lx, y); y += 13;

    var arm = p.equipped.armor;
    var armStr = arm ? arm.name : 'None';
    var armDur = arm && arm.durability !== undefined ? ' [' + arm.durability + '%]' : '';
    ctx.fillText('🛡 ' + armStr + armDur, lx, y); y += 13;

    var hd = p.equipped.head;
    ctx.fillText('🪖 ' + (hd ? hd.name : 'None'), lx, y); y += 16;

    // Skills section
    ctx.font = 'bold 11px serif'; ctx.fillStyle = '#d4a030';
    ctx.fillText('◈ SKILLS', lx, y); y += 13;

    var skillIcons = { sword:'⚔', archery:'🏹', speech:'💬', stealth:'👁', herbalism:'🌿', alchemy:'⚗' };
    for (var skill in p.skills) {
      var sv = p.skills[skill] | 0;
      var si = skillIcons[skill] || '•';
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#c8b890';
      ctx.fillText(si + ' ' + skill.charAt(0).toUpperCase() + skill.slice(1), lx, y);
      // Mini skill bar
      var sbx = lx + 85, sby = y - 8, sbW = 55, sbH = 7;
      ctx.fillStyle = 'rgba(60,50,25,0.7)';
      roundRect(ctx, sbx, sby, sbW, sbH, 2); ctx.fill();
      ctx.fillStyle = '#8aba3a';
      roundRect(ctx, sbx, sby, Math.round(sbW * sv / 100), sbH, 2); ctx.fill();
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#a0b070'; ctx.textAlign = 'right';
      ctx.fillText(sv, lx + colW - 2, y);
      ctx.textAlign = 'left';
      y += 14;
    }

    // Needs
    if (Game.Needs) {
      var ns = Game.Needs.getState();
      y += 4;
      ctx.font = 'bold 11px serif'; ctx.fillStyle = '#d4a030';
      ctx.fillText('◈ CONDITION', lx, y); y += 13;
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#e8dcc8';
      ctx.fillText('Food:  ' + (ns.hunger | 0) + '%', lx, y); y += 13;
      ctx.fillText('Water: ' + (ns.thirst | 0) + '%', lx, y); y += 13;
      ctx.fillText('Fatigue: ' + (ns.fatigue | 0) + '%', lx, y);
    }

    // ══ RIGHT COLUMN: Items ══
    y = iY + 46;
    ctx.font = 'bold 11px serif'; ctx.fillStyle = '#d4a030'; ctx.textAlign = 'left';
    ctx.fillText('◈ ITEMS', rx, y); y += 14;

    if (p.inventory.length === 0) {
      ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(180,160,120,0.5)';
      ctx.fillText('(empty)', rx, y);
    }

    for (var i = 0; i < p.inventory.length; i++) {
      var item = p.inventory[i];
      if (y > iY + iH - 40) break;

      var txt = item.name;
      if (item.qty > 1) txt += ' ×' + item.qty;

      var isEquipped = (p.equipped.weapon === item || p.equipped.armor === item || p.equipped.head === item);
      var typeColor = item.type === 'weapon' ? '#c0a070' : item.type === 'armor' ? '#8090b0' :
                      item.type === 'food' ? '#80c080' : item.type === 'potion' ? '#c080c0' :
                      item.type === 'herb' ? '#60b060' : '#c8c0a0';

      // Row bg on hover not applicable; do subtle alternating
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(rx, y - 11, colW, 15);
      }

      ctx.font = '10px sans-serif';
      ctx.fillStyle = isEquipped ? '#d4a030' : typeColor;
      ctx.textAlign = 'left';
      ctx.fillText((isEquipped ? '▶ ' : '  ') + txt, rx, y);

      // Durability indicator for equipped weapons/armor
      if (item.durability !== undefined) {
        var dColor = item.durability > 60 ? '#60b060' : item.durability > 30 ? '#c09030' : '#c03030';
        ctx.fillStyle = dColor;
        ctx.fillText('[' + item.durability + '%]', rx + colW - 38, y);
      }

      // Action button
      var canUse = !isEquipped && (item.type === 'weapon' || item.type === 'armor' || item.healAmount || item.type === 'potion' || item.type === 'food');
      if (canUse) {
        var abLabel = item.type === 'weapon' ? 'Equip' : item.type === 'armor' ? 'Wear' : 'Use';
        var abx = rx + colW - 38, aby = y - 11, abw = 36, abh = 14;
        ctx.fillStyle = 'rgba(100,80,30,0.7)';
        roundRect(ctx, abx, aby, abw, abh, 3); ctx.fill();
        ctx.strokeStyle = '#c8a030'; ctx.lineWidth = 0.5;
        roundRect(ctx, abx, aby, abw, abh, 3); ctx.stroke();
        ctx.font = '9px sans-serif'; ctx.fillStyle = '#e8c060'; ctx.textAlign = 'center';
        ctx.fillText(abLabel, abx + abw / 2, aby + abh - 2);
        Game.Input.registerButton('invItem' + i, abx, aby, abw, abh);
      }
      ctx.textAlign = 'left';
      y += 16;
    }

    // Handle inventory item interactions
    for (var i = 0; i < p.inventory.length; i++) {
      if (Game.Input.isAction('invItem' + i)) {
        Game.Input.consumeAction('invItem' + i);
        var item = p.inventory[i];
        if ((item.type === 'food' || item.type === 'healing' || item.type === 'potion') && item.healAmount) {
          Game.Player.heal(item.healAmount);
          if (Game.Needs && item.satiation) Game.Needs.eat(item);
          Game.Player.removeItem(item.id, 1);
          showNotification('Used ' + item.name + '. +' + item.healAmount + ' HP.', 'success');
          if (Game.Renderer) {
            Game.Renderer.spawnParticle(p.x, p.y - 15, 'heal');
          }
        } else if (item.type === 'food' && item.satiation) {
          if (Game.Needs) Game.Needs.eat(item);
          Game.Player.removeItem(item.id, 1);
          showNotification('Ate ' + item.name + '.', 'success');
        } else if (item.type === 'weapon') {
          p.equipped.weapon = item;
          showNotification('Equipped ' + item.name + '.', 'info');
        } else if (item.type === 'armor') {
          p.equipped.armor = item;
          showNotification('Wearing ' + item.name + '.', 'info');
        } else if (item.type === 'herb') {
          showNotification(item.name + ' - bring to a healer to brew potions.', 'info');
        }
        break;
      }
    }

    // Close hint
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(180,160,110,0.5)'; ctx.textAlign = 'center';
    ctx.fillText('Press I to close', iX + iW / 2, iY + iH - 10);
    ctx.restore();
  }

  function renderNotifications() {
    if (notifications.length === 0) return;
    ctx.save();
    var maxShow = 4;
    var baseY = H - 160; // above action buttons
    for (var i = 0; i < Math.min(notifications.length, maxShow); i++) {
      var n = notifications[notifications.length - 1 - i]; // newest on top
      var alpha = Math.min(1, n.timer / 0.4) * Math.min(1, n.timer);
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px serif';
      var tw = ctx.measureText(n.text).width;
      var nw = Math.min(tw + 24, W * 0.6);
      var nh = 26;
      var nx = (W - nw) / 2;
      var ny = baseY - i * (nh + 6);

      // Slide-in from right (smooth entry)
      var slideOffset = Math.max(0, (0.3 - n.timer) * 200);

      ctx.fillStyle = 'rgba(10,8,5,0.85)';
      roundRect(ctx, nx + slideOffset, ny, nw, nh, 5); ctx.fill();

      // Color accent left border
      var borderCol = NOTIF_COLORS[n.type] || NOTIF_COLORS.info;
      ctx.fillStyle = borderCol;
      ctx.fillRect(nx + slideOffset, ny + 3, 3, nh - 6);

      // Text
      ctx.fillStyle = borderCol;
      ctx.textAlign = 'center';
      ctx.fillText(n.text, nx + nw / 2 + slideOffset, ny + nh / 2 + 5);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function renderDebug() {
    ctx.save();
    var p = Game.Player.getState();
    var tx = Math.floor(p.x / Game.World.TILE_SIZE);
    var ty = Math.floor(p.y / Game.World.TILE_SIZE);
    var cx = Math.floor(tx / Game.World.CHUNK_SIZE);
    var cy = Math.floor(ty / Game.World.CHUNK_SIZE);

    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(5, H - 165, 220, 160);
    ctx.fillStyle = '#0f0';
    ctx.textAlign = 'left';

    var y = H - 152;
    ctx.fillText('FPS: ' + (Game.fps || 0), 10, y); y += 13;
    ctx.fillText('Pos: ' + Math.round(p.x) + ',' + Math.round(p.y) + '  Tile:' + tx + ',' + ty, 10, y); y += 13;
    ctx.fillText('Chunk: ' + cx + ',' + cy, 10, y); y += 13;

    var npcs = Game.NPC.getNPCs();
    var aliveCount = 0;
    for (var i = 0; i < npcs.length; i++) if (npcs[i].alive) aliveCount++;
    ctx.fillText('NPCs: ' + aliveCount + '/' + npcs.length, 10, y); y += 13;

    var loc = Game.World.getLocationAt(p.x, p.y);
    ctx.fillText('Location: ' + loc, 10, y); y += 13;

    var hour = Game.time ? Math.floor((Game.time / 60) % 24) : 0;
    ctx.fillText('Hour: ' + hour + ' Day: ' + (Game.day || 1), 10, y); y += 13;
    ctx.fillText('Rep: ' + p.reputation.global + ' Bounty: ' + p.bounty, 10, y); y += 13;

    // Weather & wildlife
    if (Game.Ambient) {
      var w = Game.Ambient.getWeather();
      ctx.fillStyle = '#8cf';
      ctx.fillText('Weather: ' + w.type + ' (' + (w.intensity * 100 | 0) + '%) Wind:' + w.wind.toFixed(1), 10, y); y += 13;
      ctx.fillText('Wildlife: ' + Game.Ambient.getWildlife().length, 10, y); y += 13;
    }

    ctx.fillStyle = '#fc8';
    ctx.fillText('Skills: Sw' + (p.skills.sword|0) + ' Sp' + (p.skills.speech|0) + ' St' + (p.skills.stealth|0), 10, y);

    ctx.restore();
  }

  function renderDeath() {
    ctx.save();

    // Full black overlay with vignette
    ctx.fillStyle = 'rgba(5,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);

    // Red gradient vignette for death
    var deathGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.65);
    deathGrad.addColorStop(0, 'rgba(80,0,0,0)');
    deathGrad.addColorStop(1, 'rgba(80,0,0,0.5)');
    ctx.fillStyle = deathGrad;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px serif';
    ctx.fillStyle = 'rgba(180,20,20,0.9)';
    ctx.fillText('YOU HAVE DIED', W / 2, H / 2 - 60);

    // Horizontal rule
    ctx.strokeStyle = 'rgba(160,80,30,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2-120, H/2 - 38); ctx.lineTo(W/2+120, H/2 - 38); ctx.stroke();

    // Flavour text
    var deathLines = [
      'The frontier claims another soul.',
      'Your story ends here, forgotten by most.',
      'Death comes for all who seek glory.',
      'The kingdom mourns no strangers.',
      'Another soul lost to the frontier.'
    ];
    var p = Game.Player.getState();
    ctx.font = '14px serif'; ctx.fillStyle = '#a08060';
    ctx.fillText(deathLines[((p && p.killCount) || 0) % deathLines.length], W / 2, H / 2 - 15);

    // Stats
    ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(160,140,100,0.7)';
    ctx.fillText('Days survived: ' + ((p && p.daysAlive) || 0) + '   Enemies slain: ' + ((p && p.killCount) || 0), W / 2, H / 2 + 12);

    // Buttons
    var btnW = 170, btnH = 44, btnGap = 14;
    var totalBtnW = btnW * 2 + btnGap;
    var btnX1 = W / 2 - totalBtnW / 2;
    var btnX2 = btnX1 + btnW + btnGap;
    var btnY  = H / 2 + 50;

    // Load button
    ctx.fillStyle = 'rgba(70,45,20,0.85)';
    roundRect(ctx, btnX1, btnY, btnW, btnH, 6); ctx.fill();
    ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1.5;
    roundRect(ctx, btnX1, btnY, btnW, btnH, 6); ctx.stroke();
    ctx.fillStyle = '#e8d080'; ctx.font = 'bold 13px serif';
    ctx.fillText('↺  Load Last Save', btnX1 + btnW / 2, btnY + btnH / 2 + 5);
    Game.Input.registerButton('deathLoad', btnX1, btnY, btnW, btnH);

    // New game (restart) button
    ctx.fillStyle = 'rgba(50,20,20,0.85)';
    roundRect(ctx, btnX2, btnY, btnW, btnH, 6); ctx.fill();
    ctx.strokeStyle = '#804040'; ctx.lineWidth = 1.5;
    roundRect(ctx, btnX2, btnY, btnW, btnH, 6); ctx.stroke();
    ctx.fillStyle = '#d08080'; ctx.font = 'bold 13px serif';
    ctx.fillText('✦  New Journey', btnX2 + btnW / 2, btnY + btnH / 2 + 5);
    Game.Input.registerButton('deathRestart', btnX2, btnY, btnW, btnH);

    // Handle load
    if (Game.Input.isAction('deathLoad') || Game.Input.isAction('load')) {
      Game.Input.consumeAction('deathLoad'); Game.Input.consumeAction('load');
      if (Game.Save.hasSave()) {
        Game.Save.load(); deathScreen = false;
      } else {
        showNotification('No save found. Restarting...', 'warning');
        Game.Player.init(); deathScreen = false;
      }
    }
    if (Game.Input.isAction('deathRestart')) {
      Game.Input.consumeAction('deathRestart');
      Game.Player.init();
      if (Game.Needs) Game.Needs.init();
      deathScreen = false;
      showNotification('A new journey begins.', 'info');
    }

    ctx.restore();
  }

  function showNotification(text, type) {
    var t = type || 'info';
    // Avoid duplicate stacking
    for (var i = 0; i < notifications.length; i++) {
      if (notifications[i].text === text) {
        notifications[i].timer = 3.5;
        return;
      }
    }
    notifications.push({ text: text, timer: 3.5, maxTimer: 3.5, type: t });
    // Keep journal log
    journalEntries.push({ text: text, time: Game.time || 0 });
    if (journalEntries.length > 30) journalEntries.shift();
  }

  function isBlockingInput() {
    return Game.Dialogue.isActive() || showInventory || deathScreen ||
           (Game.Minigames && Game.Minigames.isActive());
  }

  function isInventoryOpen() { return showInventory; }
  function isDebugOpen() { return showDebug; }

  function setDeathScreen(v) { deathScreen = v; }

  // Helpers
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
    if (!text) return [''];
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

  return {
    init: init, resize: resize, update: update, render: render,
    showNotification: showNotification,
    isBlockingInput: isBlockingInput,
    isInventoryOpen: isInventoryOpen,
    isDebugOpen: isDebugOpen,
    setDeathScreen: setDeathScreen
  };
})();
