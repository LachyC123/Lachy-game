var Game = Game || {};

Game.Combat = (function () {
  var U = Game.Utils;
  var activeEffects = [];
  var damageNumbers = [];
  var combatLog = [];

  function init() {
    activeEffects = [];
    damageNumbers = [];
    combatLog = [];
  }

  function update(dt) {
    var player = Game.Player.getState();
    if (!player.alive) return;

    // Handle player attack input
    if (Game.Input.isAction('attack') && player.attackTimer <= 0) {
      Game.Input.consumeAction('attack');
      if (Game.Player.startAttack('light')) {
        performPlayerAttack('light');
      }
    }
    if (Game.Input.isAction('heavyAttack') && player.attackTimer <= 0) {
      Game.Input.consumeAction('heavyAttack');
      if (Game.Player.startAttack('heavy')) {
        performPlayerAttack('heavy');
      }
    }
    if (Game.Input.isAction('dodge')) {
      Game.Input.consumeAction('dodge');
      Game.Player.startDodge();
    }

    // Update damage numbers
    for (var i = damageNumbers.length - 1; i >= 0; i--) {
      var dn = damageNumbers[i];
      dn.timer -= dt;
      dn.y -= 30 * dt;
      dn.alpha = Math.max(0, dn.timer / dn.maxTimer);
      if (dn.timer <= 0) damageNumbers.splice(i, 1);
    }

    // Update effects
    for (var i = activeEffects.length - 1; i >= 0; i--) {
      var ef = activeEffects[i];
      ef.timer -= dt;
      if (ef.timer <= 0) activeEffects.splice(i, 1);
    }

    // Auto-combat cooldown decay
    if (player.combatCooldown <= 0) {
      player.inCombat = false;
    }
  }

  function performPlayerAttack(type) {
    var player = Game.Player.getState();
    var range  = Game.Player.getAttackRange();
    var arc    = Game.Player.getAttackArc();
    var baseDamage = Game.Player.getAttackDamage();

    // Heavy attacks are wider cleaves
    var arcWidth = type === 'heavy' ? arc.width * 1.3 : arc.width;

    // Combo bonus notification
    if (player.comboCount >= 3) {
      if (Game.UI) Game.UI.showNotification('Combo x' + player.comboCount + '!', 'success');
    }

    // Find NPCs in attack range and arc
    var nearby = Game.NPC.getNearPlayer(range + 12);
    var hit = false, hitCount = 0;

    for (var i = 0; i < nearby.length; i++) {
      var npc = nearby[i];
      if (!npc.alive) continue;

      var dist = U.dist(player.x, player.y, npc.x, npc.y);
      if (dist > range) continue;

      // Check angle
      var angleToNpc = U.angle(player.x, player.y, npc.x, npc.y);
      var angleDiff  = Math.abs(normalizeAngle(angleToNpc - arc.angle));
      if (angleDiff > arcWidth / 2) continue;

      var damage = baseDamage;

      // Edge of swing = glancing blow
      if (angleDiff > arcWidth * 0.36) damage *= 0.75;

      // Heavy cleave falloff across multiple targets
      if (type === 'heavy' && hitCount > 0) damage *= Math.max(0.5, 1 - hitCount * 0.2);

      // Critical chance scales with sword skill + combo
      var critChance = 0.08 + player.skills.sword * 0.002 + (player.comboCount > 1 ? 0.05 : 0);
      var crit = U.rng() < critChance;
      if (crit) damage *= 1.65;

      var actual = Game.NPC.takeDamage(npc, Math.round(damage), true);
      hit = true; hitCount++;

      // Blood particles from the NPC
      if (Game.Renderer && actual > 5) {
        var bloodCount = Math.min(10, Math.floor(actual / 4));
        for (var bi = 0; bi < bloodCount; bi++) {
          Game.Renderer.spawnParticle(npc.x + (Math.random()-0.5)*10, npc.y - 8, 'blood');
        }
        if (type === 'heavy') {
          for (var bi = 0; bi < 4; bi++) {
            Game.Renderer.spawnParticle(npc.x + (Math.random()-0.5)*12, npc.y - 5, 'impact');
          }
        }
      }

      // Damage number with crit/combo info
      addDamageNumber(npc.x, npc.y - 25, actual, crit, false);

      if (Game.Renderer.triggerShake) {
        Game.Renderer.triggerShake(type === 'heavy' ? (crit ? 12 : 7) : (crit ? 8 : 4));
      }

      // Add slash effect
      var eff = { type: 'slash', x: player.x, y: player.y, angle: arc.angle,
                  timer: 0.22, maxTimer: 0.22, isHeavy: type === 'heavy' };
      activeEffects.push(eff);

      if (crit) logCombat('⚡ Critical hit on ' + npc.name.full + ' for ' + actual + '!');
      else       logCombat('You hit ' + npc.name.full + ' for ' + actual + '.');

      if (npc.faction !== 'bandits') {
        Game.Law.reportCrime('assault', null, npc);
        if (!npc.alive) Game.Law.reportCrime('murder', null, npc);
      }

      Game.Player.gainSkill('sword', type === 'heavy' ? 0.12 : 0.06);
    }

    if (!hit) {
      // Miss slash
      activeEffects.push({ type: 'slash', x: player.x, y: player.y, angle: arc.angle,
                           timer: 0.15, maxTimer: 0.15, isHeavy: false });
      logCombat('Your swing misses.');
    } else if (hitCount > 1) {
      logCombat('Cleave! Hit ' + hitCount + ' targets.');
      if (Game.UI) Game.UI.showNotification('Cleave!', 'success');
    }
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function addDamageNumber(x, y, amount, isCrit, isHeal, isPlayer) {
    var dispAmount = typeof amount === 'number' ? amount : amount;
    damageNumbers.push({
      x: x + U.randFloat(-8, 8),
      y: y,
      amount: dispAmount,
      display: isCrit ? (dispAmount + '!!') : null,
      isCrit: !!isCrit,
      isHeal: !!isHeal,
      isPlayer: !!isPlayer,
      timer: isCrit ? 1.4 : 1.0,
      maxTimer: isCrit ? 1.4 : 1.0,
      alpha: 1
    });
  }

  function addEffect(type, x, y, angle, duration) {
    activeEffects.push({
      type: type, x: x, y: y, angle: angle,
      timer: duration, maxTimer: duration
    });
  }

  // Expose method for player damage numbers
  function addPlayerDamageNumber(x, y, amount) {
    addDamageNumber(x, y, amount, false, false, true);
  }

  function addHealNumber(x, y, amount) {
    addDamageNumber(x, y, amount, false, true, false);
  }

  function logCombat(msg) {
    combatLog.push({ msg: msg, time: Game.time || 0 });
    if (combatLog.length > 20) combatLog.shift();
  }

  function getDamageNumbers() { return damageNumbers; }
  function getEffects() { return activeEffects; }
  function getCombatLog() { return combatLog; }

  return {
    init: init, update: update,
    addDamageNumber: addDamageNumber, addEffect: addEffect,
    addPlayerDamageNumber: addPlayerDamageNumber, addHealNumber: addHealNumber,
    getDamageNumbers: getDamageNumbers, getEffects: getEffects,
    getCombatLog: getCombatLog, logCombat: logCombat
  };
})();
