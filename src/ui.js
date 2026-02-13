var Game = Game || {};

Game.UI = (function () {
  var U = Game.Utils;
  var canvas, ctx;
  var W, H;
  var notifications = [];
  var showInventory = false;
  var showDebug = false;
  var menuOpen = false;
  var deathScreen = false;

  // Button definitions (will be positioned on resize)
  var BTN_SIZE = 56;
  var BTN_PAD = 12;
  var buttonDefs = {
    attack: { label: 'ATK', color: '#8a3030' },
    heavyAttack: { label: 'HVY', color: '#6a2020' },
    block: { label: 'BLK', color: '#3a5a8a' },
    dodge: { label: 'DGE', color: '#3a7a3a' },
    interact: { label: 'USE', color: '#7a6a30' }
  };
  var buttonPositions = {};

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
    buttonPositions.interact = { x: baseX - BTN_SIZE - BTN_PAD, y: baseY - BTN_SIZE * 2 - BTN_PAD * 2 };
    buttonPositions.attack = { x: baseX, y: baseY - BTN_SIZE - BTN_PAD };
    buttonPositions.heavyAttack = { x: baseX - BTN_SIZE - BTN_PAD, y: baseY };
    buttonPositions.block = { x: baseX - BTN_SIZE * 2 - BTN_PAD * 2, y: baseY - BTN_SIZE - BTN_PAD };
    buttonPositions.dodge = { x: baseX, y: baseY };

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
    var barW = 140, barH = 10;
    var x = 15, y = 15;

    // Safe area top padding
    y += 10;

    // Health bar
    ctx.fillStyle = 'rgba(20,10,5,0.7)';
    roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 3);
    ctx.fill();

    var hpPct = p.health / p.maxHealth;
    var hpColor = hpPct > 0.5 ? '#8a3030' : hpPct > 0.25 ? '#aa4a10' : '#cc2020';
    ctx.fillStyle = '#2a0a0a';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = hpColor;
    ctx.fillRect(x, y, Math.round(barW * hpPct), barH);

    // Stamina bar
    y += barH + 6;
    ctx.fillStyle = 'rgba(20,10,5,0.7)';
    roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 3);
    ctx.fill();

    var stPct = p.stamina / p.maxStamina;
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#3a7a3a';
    ctx.fillRect(x, y, Math.round(barW * stPct), barH);

    // Labels
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'left';
    ctx.fillText(Math.ceil(p.health) + '/' + p.maxHealth, x + barW + 8, y - barH + 2);
    ctx.fillText(Math.ceil(p.stamina) + '/' + p.maxStamina, x + barW + 8, y + barH - 2);

    // Bleeding indicator
    if (p.bleeding > 0) {
      ctx.fillStyle = '#cc3030';
      ctx.font = '10px sans-serif';
      ctx.fillText('BLEEDING', x, y + barH + 14);
    }

    // Weather icon (subtle)
    if (Game.Ambient) {
      var weather = Game.Ambient.getWeather();
      var wy = y + barH + (p.bleeding > 0 ? 28 : 14);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'rgba(200,200,220,0.6)';
      var wIcons = { clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Raining', storm: 'Storm' };
      ctx.fillText(wIcons[weather.type] || '', x, wy);
    }

    // Bounty
    if (p.bounty > 0) {
      ctx.fillStyle = '#cc8030';
      ctx.font = '11px sans-serif';
      ctx.fillText('BOUNTY: ' + p.bounty + 'g', x, y + barH + 28);
    }
  }

  function renderMiniInfo() {
    var p = Game.Player.getState();
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(250,240,220,0.9)';
    ctx.textAlign = 'right';

    var x = W - 15, y = 30;
    ctx.fillText('Gold: ' + p.gold, x, y);
    y += 16;

    // Time
    if (Game.time !== undefined) {
      var hour = Math.floor((Game.time / 60) % 24);
      var min = Math.floor(Game.time % 60);
      var timeStr = (hour < 10 ? '0' : '') + hour + ':' + (min < 10 ? '0' : '') + min;
      ctx.fillText('Day ' + (Game.day || 1) + '  ' + timeStr, x, y);
      y += 16;
    }

    // Location
    var loc = Game.World.getLocationAt(p.x, p.y);
    var locNames = {
      ashford: 'Ashford', millhaven: 'Millhaven', thornfield: 'Thornfield',
      banditCamp: 'Bandit Camp', forest: 'Forest', wilderness: 'Wilderness'
    };
    ctx.fillText(locNames[loc] || loc, x, y);
    y += 16;

    // Quick action buttons (mobile-friendly)
    var qbSize = 28;
    var qbX = W - qbSize - 10;
    var qbY = y + 4;

    // Inventory button
    ctx.fillStyle = 'rgba(60,50,30,0.6)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 4);
    ctx.fill();
    ctx.fillStyle = '#d4a030';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('I', qbX + qbSize / 2, qbY + qbSize / 2 + 4);
    Game.Input.registerButton('inventory', qbX, qbY, qbSize, qbSize);

    // Save button
    qbX -= qbSize + 6;
    ctx.fillStyle = 'rgba(60,50,30,0.6)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 4);
    ctx.fill();
    ctx.fillStyle = '#6a8a4a';
    ctx.fillText('S', qbX + qbSize / 2, qbY + qbSize / 2 + 4);
    Game.Input.registerButton('save', qbX, qbY, qbSize, qbSize);

    // Debug button
    qbX -= qbSize + 6;
    ctx.fillStyle = 'rgba(60,50,30,0.6)';
    roundRect(ctx, qbX, qbY, qbSize, qbSize, 4);
    ctx.fill();
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px sans-serif';
    ctx.fillText('DB', qbX + qbSize / 2, qbY + qbSize / 2 + 3);
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
    for (var name in buttonPositions) {
      var bp = buttonPositions[name];
      var def = buttonDefs[name];
      if (!def) continue;

      // Button background
      ctx.fillStyle = 'rgba(20,15,10,0.5)';
      roundRect(ctx, bp.x, bp.y, BTN_SIZE, BTN_SIZE, 8);
      ctx.fill();

      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.6;
      roundRect(ctx, bp.x + 2, bp.y + 2, BTN_SIZE - 4, BTN_SIZE - 4, 6);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = 'rgba(250,240,220,0.9)';
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
    var iW = Math.min(W - 30, 350);
    var iH = Math.min(H - 100, 400);
    var iX = (W - iW) / 2;
    var iY = (H - iH) / 2;

    // Background
    ctx.fillStyle = 'rgba(30,25,18,0.95)';
    roundRect(ctx, iX, iY, iW, iH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,100,0.6)';
    ctx.lineWidth = 2;
    roundRect(ctx, iX, iY, iW, iH, 8);
    ctx.stroke();

    var p = Game.Player.getState();

    // Title
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#d4a030';
    ctx.textAlign = 'center';
    ctx.fillText('INVENTORY', iX + iW / 2, iY + 22);

    // Gold
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e8dcc8';
    ctx.textAlign = 'left';
    ctx.fillText('Gold: ' + p.gold, iX + 15, iY + 42);

    // Equipment
    ctx.fillText('Weapon: ' + (p.equipped.weapon ? p.equipped.weapon.name : 'Fists'), iX + 15, iY + 60);
    ctx.fillText('Armor: ' + (p.equipped.armor ? p.equipped.armor.name : 'None'), iX + 15, iY + 76);

    // Skills
    ctx.fillStyle = '#d4a030';
    ctx.fillText('Skills:', iX + 15, iY + 98);
    ctx.fillStyle = '#e8dcc8';
    var sy = iY + 114;
    for (var skill in p.skills) {
      ctx.fillText(skill.charAt(0).toUpperCase() + skill.slice(1) + ': ' + Math.floor(p.skills[skill]), iX + 20, sy);
      // Skill bar
      ctx.fillStyle = 'rgba(80,70,50,0.6)';
      ctx.fillRect(iX + 100, sy - 8, 100, 8);
      ctx.fillStyle = '#6a8a3a';
      ctx.fillRect(iX + 100, sy - 8, p.skills[skill], 8);
      ctx.fillStyle = '#e8dcc8';
      sy += 18;
    }

    // Items
    ctx.fillStyle = '#d4a030';
    ctx.fillText('Items:', iX + 15, sy + 8);
    ctx.fillStyle = '#e8dcc8';
    sy += 24;
    for (var i = 0; i < p.inventory.length; i++) {
      var item = p.inventory[i];
      var txt = item.name;
      if (item.qty > 1) txt += ' x' + item.qty;
      var action = '';
      if (p.equipped.weapon === item) { txt += ' [Equipped]'; }
      else if (p.equipped.armor === item) { txt += ' [Worn]'; }
      else if (item.type === 'weapon') { action = '[Equip]'; }
      else if (item.type === 'armor') { action = '[Wear]'; }
      else if (item.healAmount) { action = '[Use]'; }

      ctx.fillText(txt, iX + 20, sy);

      // Action button for item
      if (action) {
        ctx.fillStyle = 'rgba(100,90,60,0.6)';
        var abx = iX + iW - 60, aby = sy - 12;
        ctx.fillRect(abx, aby, 50, 16);
        ctx.fillStyle = '#d4a030';
        ctx.font = '10px sans-serif';
        ctx.fillText(action, abx + 4, sy);
        Game.Input.registerButton('invItem' + i, abx, aby, 50, 16);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#e8dcc8';
      }

      sy += 18;
      if (sy > iY + iH - 30) break;
    }

    // Handle inventory item actions
    for (var i = 0; i < p.inventory.length; i++) {
      if (Game.Input.isAction('invItem' + i)) {
        Game.Input.consumeAction('invItem' + i);
        var item = p.inventory[i];
        if ((item.type === 'food' || item.type === 'healing') && item.healAmount > 0) {
          var missingHealth = p.maxHealth - p.health;
          if (missingHealth <= 0) {
            showNotification('You are already at full health.');
          } else {
            var healed = Math.min(item.healAmount, Math.ceil(missingHealth));
            Game.Player.heal(item.healAmount);
            Game.Player.removeItem(item.id, 1);
            showNotification('Used ' + item.name + '. +' + healed + ' health.');
          }
        } else if (item.type === 'weapon') {
          p.equipped.weapon = item;
          showNotification('Equipped ' + item.name + '.');
        } else if (item.type === 'armor') {
          p.equipped.armor = item;
          showNotification('Wearing ' + item.name + '.');
        }
        break;
      }
    }

    // Close hint
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(200,180,140,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('Press I to close | Tap items to use', iX + iW / 2, iY + iH - 10);

    ctx.restore();
  }

  function renderNotifications() {
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < notifications.length; i++) {
      var n = notifications[i];
      var alpha = Math.min(1, n.timer);
      ctx.fillStyle = 'rgba(250,240,220,' + alpha + ')';
      ctx.fillText(n.text, W / 2, H / 2 - 80 + i * 20);
    }
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
    ctx.fillStyle = 'rgba(20,5,5,0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#8a2020';
    ctx.textAlign = 'center';
    ctx.fillText('YOU HAVE DIED', W / 2, H / 2 - 30);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#aa8060';
    ctx.fillText('The frontier claims another soul.', W / 2, H / 2 + 10);

    // Load button
    var btnW = 160, btnH = 40;
    var btnX = W / 2 - btnW / 2;
    var btnY = H / 2 + 50;
    ctx.fillStyle = 'rgba(80,50,30,0.8)';
    roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.strokeStyle = '#aa8060';
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.stroke();
    ctx.fillStyle = '#e8dcc8';
    ctx.font = '14px sans-serif';
    ctx.fillText('Load Last Save', W / 2, btnY + 25);

    // Register button
    Game.Input.registerButton('deathLoad', btnX, btnY, btnW, btnH);

    // Handle load
    if (Game.Input.isAction('deathLoad') || Game.Input.isAction('load')) {
      Game.Input.consumeAction('deathLoad');
      Game.Input.consumeAction('load');
      if (Game.Save.hasSave()) {
        Game.Save.load();
        deathScreen = false;
      } else {
        showNotification('No save found. Restarting...');
        // Full restart
        Game.Player.init();
        deathScreen = false;
      }
    }

    ctx.restore();
  }

  function showNotification(text) {
    notifications.push({ text: text, timer: 3 });
  }

  function isBlockingInput() {
    return Game.Dialogue.isActive() || showInventory || deathScreen;
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
