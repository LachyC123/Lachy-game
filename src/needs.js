var Game = Game || {};

// Kingdom Come: Deliverance-inspired needs system
// Hunger, Thirst, and Fatigue degrade over time and affect player stats
Game.Needs = (function () {
  var needs = {
    hunger: 80,    // 0-100: 100=full, 0=starving
    thirst: 85,    // 0-100: 100=hydrated, 0=dehydrated
    fatigue: 10,   // 0-100: 0=rested, 100=exhausted
    tiredness: 0   // internal: hours without sleep accumulator
  };

  // Per game-minute decay rates
  var HUNGER_DECAY  = 1.4;   // lose ~34 per 24h
  var THIRST_DECAY  = 2.2;   // lose ~53 per 24h (thirst faster than hunger)
  var FATIGUE_GAIN  = 0.9;   // gain ~22 per 24h when awake; sleep reverses it

  // Effect thresholds
  var HUNGRY_THRESHOLD    = 40;
  var STARVING_THRESHOLD  = 15;
  var THIRSTY_THRESHOLD   = 35;
  var PARCHED_THRESHOLD   = 10;
  var TIRED_THRESHOLD     = 65;
  var EXHAUSTED_THRESHOLD = 85;

  var notifyTimer = { hunger: 0, thirst: 0, fatigue: 0 };

  function init() {
    needs.hunger   = 80;
    needs.thirst   = 85;
    needs.fatigue  = 10;
    needs.tiredness = 0;
    notifyTimer = { hunger: 0, thirst: 0, fatigue: 0 };
  }

  function update(dt) {
    var p = Game.Player ? Game.Player.getState() : null;
    if (!p || !p.alive) return;

    var rate = Game.TIME_SCALE || 2; // game minutes per real second

    // Decay needs (scaled by game time speed)
    needs.hunger  = Math.max(0, needs.hunger  - HUNGER_DECAY * rate * dt / 60);
    needs.thirst  = Math.max(0, needs.thirst  - THIRST_DECAY * rate * dt / 60);
    needs.fatigue = Math.min(100, needs.fatigue + FATIGUE_GAIN * rate * dt / 60);

    // Starvation/dehydration health drain
    if (needs.hunger <= 0) {
      p.health -= 1.5 * dt;
      if (p.health < 0) p.health = 0;
    }
    if (needs.thirst <= 0) {
      p.health -= 2.5 * dt;
      if (p.health < 0) p.health = 0;
    }

    // Notify player about critical needs
    notifyTimer.hunger -= dt;
    notifyTimer.thirst -= dt;
    notifyTimer.fatigue -= dt;

    if (needs.hunger <= STARVING_THRESHOLD && notifyTimer.hunger <= 0) {
      notifyTimer.hunger = 45;
      if (Game.UI) Game.UI.showNotification('You are starving! Eat something urgently.', 'danger');
    } else if (needs.hunger <= HUNGRY_THRESHOLD && notifyTimer.hunger <= 0) {
      notifyTimer.hunger = 90;
      if (Game.UI) Game.UI.showNotification('You are getting hungry.', 'warning');
    }

    if (needs.thirst <= PARCHED_THRESHOLD && notifyTimer.thirst <= 0) {
      notifyTimer.thirst = 30;
      if (Game.UI) Game.UI.showNotification('You are parched! Drink something!', 'danger');
    } else if (needs.thirst <= THIRSTY_THRESHOLD && notifyTimer.thirst <= 0) {
      notifyTimer.thirst = 75;
      if (Game.UI) Game.UI.showNotification('You are getting thirsty.', 'warning');
    }

    if (needs.fatigue >= EXHAUSTED_THRESHOLD && notifyTimer.fatigue <= 0) {
      notifyTimer.fatigue = 60;
      if (Game.UI) Game.UI.showNotification('You are exhausted. You need to sleep.', 'warning');
    } else if (needs.fatigue >= TIRED_THRESHOLD && notifyTimer.fatigue <= 0) {
      notifyTimer.fatigue = 120;
      if (Game.UI) Game.UI.showNotification('You feel tired. Find a bed soon.', 'info');
    }
  }

  // Eating an item
  function eat(item) {
    var satiation  = item.satiation  || item.healAmount || 15;
    var hydration  = item.hydration  || 3;
    needs.hunger   = Math.min(100, needs.hunger  + satiation);
    needs.thirst   = Math.min(100, needs.thirst  + hydration);
    if (Game.UI) {
      Game.UI.showNotification('Ate ' + item.name + '. +' + satiation + ' food.', 'info');
    }
  }

  // Drinking something
  function drink(amount, name) {
    needs.thirst = Math.min(100, needs.thirst + (amount || 30));
    if (Game.UI && name) Game.UI.showNotification('Drank ' + name + '.', 'info');
  }

  // Sleeping for a number of hours
  function sleep(hours) {
    var restoreRate = 14; // fatigue points per hour of sleep
    needs.fatigue = Math.max(0, needs.fatigue - hours * restoreRate);
    // Small hunger/thirst drain while sleeping
    needs.hunger = Math.max(0, needs.hunger - hours * 1.5);
    needs.thirst = Math.max(0, needs.thirst - hours * 2);
  }

  // --- Stat Modifier Getters (applied by player.js) ---

  function getSpeedMod() {
    var mod = 1.0;
    if (needs.hunger  <= STARVING_THRESHOLD)  mod *= 0.80;
    else if (needs.hunger <= HUNGRY_THRESHOLD) mod *= 0.93;
    if (needs.thirst  <= PARCHED_THRESHOLD)    mod *= 0.80;
    if (needs.fatigue >= EXHAUSTED_THRESHOLD)  mod *= 0.72;
    else if (needs.fatigue >= TIRED_THRESHOLD) mod *= 0.87;
    return mod;
  }

  function getStaminaRegenMod() {
    var mod = 1.0;
    if (needs.hunger  <= STARVING_THRESHOLD)  mod *= 0.45;
    else if (needs.hunger <= HUNGRY_THRESHOLD) mod *= 0.70;
    if (needs.thirst  <= PARCHED_THRESHOLD)    mod *= 0.40;
    else if (needs.thirst <= THIRSTY_THRESHOLD) mod *= 0.65;
    if (needs.fatigue >= EXHAUSTED_THRESHOLD)  mod *= 0.55;
    else if (needs.fatigue >= TIRED_THRESHOLD) mod *= 0.75;
    return mod;
  }

  function getMaxHealthMod() {
    var mod = 1.0;
    if (needs.hunger  <= STARVING_THRESHOLD)  mod -= 0.22;
    else if (needs.hunger <= HUNGRY_THRESHOLD) mod -= 0.08;
    if (needs.thirst  <= PARCHED_THRESHOLD)    mod -= 0.18;
    return Math.max(0.4, mod);
  }

  function getAttackMod() {
    var mod = 1.0;
    if (needs.fatigue >= EXHAUSTED_THRESHOLD) mod *= 0.75;
    else if (needs.fatigue >= TIRED_THRESHOLD) mod *= 0.88;
    if (needs.hunger <= STARVING_THRESHOLD)   mod *= 0.80;
    return mod;
  }

  // Status string for HUD
  function getStatusText() {
    var parts = [];
    if (needs.hunger  <= STARVING_THRESHOLD)   parts.push('Starving');
    else if (needs.hunger <= HUNGRY_THRESHOLD)  parts.push('Hungry');
    if (needs.thirst  <= PARCHED_THRESHOLD)    parts.push('Parched');
    else if (needs.thirst <= THIRSTY_THRESHOLD) parts.push('Thirsty');
    if (needs.fatigue >= EXHAUSTED_THRESHOLD)   parts.push('Exhausted');
    else if (needs.fatigue >= TIRED_THRESHOLD)  parts.push('Tired');
    return parts.join(', ');
  }

  function isCritical() {
    return needs.hunger <= STARVING_THRESHOLD || needs.thirst <= PARCHED_THRESHOLD;
  }

  function getState()  { return needs; }
  function setState(s) { for (var k in s) if (s.hasOwnProperty(k)) needs[k] = s[k]; }

  return {
    init: init, update: update,
    eat: eat, drink: drink, sleep: sleep,
    getState: getState, setState: setState,
    getSpeedMod: getSpeedMod, getStaminaRegenMod: getStaminaRegenMod,
    getMaxHealthMod: getMaxHealthMod, getAttackMod: getAttackMod,
    getStatusText: getStatusText, isCritical: isCritical
  };
})();
