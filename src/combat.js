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
    var range = Game.Player.getAttackRange();
    var arc = Game.Player.getAttackArc();
    var baseDamage = Game.Player.getAttackDamage();

    // Heavy attacks are wider cleaves
    var arcWidth = type === 'heavy' ? arc.width * 1.25 : arc.width;

    // Find NPCs in attack range and arc
    var nearby = Game.NPC.getNearPlayer(range + 10);
    var hit = false;
    var hitCount = 0;

    for (var i = 0; i < nearby.length; i++) {
      var npc = nearby[i];
      if (!npc.alive) continue;

      var dist = U.dist(player.x, player.y, npc.x, npc.y);
      if (dist > range) continue;

      // Check angle
      var angleToNpc = U.angle(player.x, player.y, npc.x, npc.y);
      var angleDiff = Math.abs(normalizeAngle(angleToNpc - arc.angle));
      if (angleDiff > arcWidth / 2) continue;

      var damage = baseDamage;

      // Edge of swing = glancing blow
      if (angleDiff > arcWidth * 0.36) damage *= 0.8;

      // Heavy cleave falloff across multiple targets
      if (type === 'heavy' && hitCount > 0) damage *= Math.max(0.55, 1 - hitCount * 0.18);

      // Critical chance scales with sword skill
      var critChance = 0.08 + player.skills.sword * 0.002;
      var crit = U.rng() < critChance;
      if (crit) damage *= 1.6;

      var actual = Game.NPC.takeDamage(npc, Math.round(damage), true);
      hit = true;
      hitCount++;

      // Damage number
      addDamageNumber(npc.x, npc.y - 20, actual + (crit ? '!' : ''));

      if (Game.Renderer.triggerShake) {
        Game.Renderer.triggerShake(type === 'heavy' ? 7 : 4);
      }

      addEffect('slash', player.x, player.y, arc.angle, 0.2);

      if (crit) logCombat('Critical hit on ' + npc.name.full + ' for ' + actual + '.');
      else logCombat('You hit ' + npc.name.full + ' for ' + actual + ' damage.');

      if (npc.faction !== 'bandits') {
        Game.Law.reportCrime('assault', null, npc);
        if (!npc.alive) Game.Law.reportCrime('murder', null, npc);
      }

      Game.Player.gainSkill('sword', type === 'heavy' ? 0.1 : 0.05);
    }

    if (!hit) {
      addEffect('slash', player.x, player.y, arc.angle, 0.15);
      logCombat('Your swing misses.');
    } else if (hitCount > 1) {
      logCombat('Cleave hit ' + hitCount + ' targets.');
    }
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function addDamageNumber(x, y, amount) {
    damageNumbers.push({
      x: x + U.randFloat(-10, 10),
      y: y,
      amount: amount,
      timer: 1.0,
      maxTimer: 1.0,
      alpha: 1
    });
  }

  function addEffect(type, x, y, angle, duration) {
    activeEffects.push({
      type: type, x: x, y: y, angle: angle,
      timer: duration, maxTimer: duration
    });
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
    getDamageNumbers: getDamageNumbers, getEffects: getEffects,
    getCombatLog: getCombatLog, logCombat: logCombat
  };
})();
