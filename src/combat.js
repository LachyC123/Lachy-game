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
    var damage = Game.Player.getAttackDamage();

    // Find NPCs in attack range and arc
    var nearby = Game.NPC.getNearPlayer(range + 10);
    var hit = false;

    for (var i = 0; i < nearby.length; i++) {
      var npc = nearby[i];
      if (!npc.alive) continue;

      var dist = U.dist(player.x, player.y, npc.x, npc.y);
      if (dist > range) continue;

      // Check angle
      var angleToNpc = U.angle(player.x, player.y, npc.x, npc.y);
      var angleDiff = Math.abs(normalizeAngle(angleToNpc - arc.angle));
      if (angleDiff > arc.width / 2) continue;

      // Hit this NPC
      var actual = Game.NPC.takeDamage(npc, damage, true);
      hit = true;

      // Damage number
      addDamageNumber(npc.x, npc.y - 20, actual);

      // Screen shake on hit (heavier for heavy attacks)
      if (Game.Renderer.triggerShake) {
        Game.Renderer.triggerShake(type === 'heavy' ? 6 : 3);
      }

      // Swing effect
      addEffect('slash', player.x, player.y, arc.angle, 0.2);

      // Combat log
      logCombat('You hit ' + npc.name.full + ' for ' + actual + ' damage.');

      // Report crime
      if (npc.faction !== 'bandits') {
        Game.Law.reportCrime('assault', null, npc);
        if (!npc.alive) {
          Game.Law.reportCrime('murder', null, npc);
        }
      }

      // Skill gain
      Game.Player.gainSkill('sword', type === 'heavy' ? 0.08 : 0.04);
    }

    if (!hit) {
      // Swing effect anyway
      addEffect('slash', player.x, player.y, arc.angle, 0.15);
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
