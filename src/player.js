var Game = Game || {};

Game.Player = (function () {
  var U = Game.Utils;
  var W, TS;

  var player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    facing: 'S',
    speed: 96, // pixels per second
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    staminaRegen: 15, // per second
    bleeding: 0, // damage per second
    alive: true,
    // Combat state
    inCombat: false,
    combatCooldown: 0,
    blocking: false,
    dodging: false,
    dodgeCooldown: 0,
    dodgeTimer: 0,
    attackTimer: 0,
    attackType: null, // 'light', 'heavy'
    hitCooldown: 0,
    // Combo system
    comboTimer: 0,    // window to chain combo
    comboCount: 0,    // attacks in current chain
    lastAttackType: null,
    // Parry timing
    parryWindow: 0,   // >0 = perfect parry frame active
    // Stamina exhaustion
    exhausted: false, // true when stamina hits 0
    exhaustTimer: 0,  // how long exhausted
    // Wounds
    wounds: [],       // [{type:'cut'|'bruise', severity:1-3, timer}]
    // Skills (0-100)
    skills: {
      sword: 5, archery: 2, speech: 5, stealth: 3, herbalism: 1
    },
    // Reputation
    reputation: {
      global: 0, // -100 to 100
      ashford: 0,
      millhaven: 5,
      thornfield: 0,
      guards: 0,
      nobles: 0,
      bandits: 0
    },
    // Social
    socialClass: 'peasant', // peasant, commoner, merchant, noble
    disguise: null,
    // Inventory
    inventory: [],
    equipped: {
      weapon: null,
      armor: null,
      head: null
    },
    gold: 5,
    // Crimes
    bounty: 0,
    crimesWitnessed: [],
    // Stats
    killCount: 0,
    daysAlive: 0,
    // Forage cooldown
    forageCooldown: 0
  };

  function init() {
    W = Game.World;
    TS = W.TILE_SIZE;
    var start = W.getLocations().playerStart;
    player.x = start.x * TS + TS / 2;
    player.y = start.y * TS + TS / 2;
    player.health = player.maxHealth;
    player.stamina = player.maxStamina;
    player.alive = true;
    player.bleeding = 0;
    player.wounds = [];
    player.comboTimer = 0; player.comboCount = 0;
    player.exhausted = false; player.exhaustTimer = 0;
    player.forageCooldown = 0;
    player.inventory = [
      { id: 'bread', name: 'Bread', type: 'food', value: 2, qty: 3, healAmount: 8, satiation: 20, hydration: 5 },
      { id: 'waterskin', name: 'Waterskin', type: 'drink', value: 3, qty: 1, hydration: 35 },
      { id: 'knife', name: 'Hunting Knife', type: 'weapon', damage: 8, speed: 1.2, value: 10, qty: 1, durability: 100, maxDurability: 100 }
    ];
    player.equipped.weapon = player.inventory[2];
  }

  function update(dt) {
    if (!player.alive) return;

    // Combat cooldowns
    if (player.attackTimer > 0) player.attackTimer -= dt;
    if (player.combatCooldown > 0) player.combatCooldown -= dt;
    if (player.dodgeCooldown > 0) player.dodgeCooldown -= dt;
    if (player.hitCooldown > 0) player.hitCooldown -= dt;
    if (player.forageCooldown > 0) player.forageCooldown -= dt;

    // Parry window
    if (player.parryWindow > 0) player.parryWindow -= dt;

    // Combo timer (chain within 0.6s)
    if (player.comboTimer > 0) {
      player.comboTimer -= dt;
      if (player.comboTimer <= 0) player.comboCount = 0;
    }

    // Bleeding still ticks while dodging
    if (player.bleeding > 0) {
      player.health -= player.bleeding * dt;
      player.bleeding = Math.max(0, player.bleeding - 0.4 * dt);
      if (player.health <= 0) {
        player.health = 0;
        player.alive = false;
        return;
      }
    }

    // Wound tick effects
    for (var wi = player.wounds.length - 1; wi >= 0; wi--) {
      var wound = player.wounds[wi];
      wound.timer -= dt;
      if (wound.timer <= 0) { player.wounds.splice(wi, 1); continue; }
      // Bruise: slows stamina regen
      if (wound.type === 'bruise' && wound.severity >= 2) {
        // Handled in regen below
      }
    }

    var input = Game.Input.getMovement();
    var moving = input.x !== 0 || input.y !== 0;

    // Dodge roll
    if (player.dodgeTimer > 0) {
      player.dodgeTimer -= dt;
      var dodgeSpeed = player.speed * 3;
      var ang = U.angle(0, 0, player.vx || 0.001, player.vy || 0.001);
      input.x = Math.cos(ang);
      input.y = Math.sin(ang);
      movePlayer(input.x * dodgeSpeed * dt, input.y * dodgeSpeed * dt);
      if (player.dodgeTimer <= 0) {
        player.dodging = false;
      }
      return;
    }

    // ── Needs stat modifiers ──
    var needsSpeedMod  = Game.Needs ? Game.Needs.getSpeedMod()        : 1;
    var needsRegenMod  = Game.Needs ? Game.Needs.getStaminaRegenMod() : 1;
    var needsMaxHpMod  = Game.Needs ? Game.Needs.getMaxHealthMod()    : 1;

    // Effective max health (can be reduced by starvation)
    var effectiveMaxHp = Math.floor(player.maxHealth * needsMaxHpMod);
    if (player.health > effectiveMaxHp) player.health = effectiveMaxHp;

    // Stamina regen (modified by needs + wounds)
    if (!player.blocking && player.attackTimer <= 0) {
      var bruisePenalty = 1;
      for (var wi = 0; wi < player.wounds.length; wi++) {
        if (player.wounds[wi].type === 'bruise') bruisePenalty *= (1 - player.wounds[wi].severity * 0.12);
      }
      var regen = player.staminaRegen * needsRegenMod * bruisePenalty;
      player.stamina = Math.min(player.maxStamina, player.stamina + regen * dt);
    }

    // Stamina exhaustion state
    if (player.stamina <= 0 && !player.exhausted) {
      player.exhausted = true;
      player.exhaustTimer = 2.0; // 2s exhaustion penalty
      if (Game.UI) Game.UI.showNotification('Exhausted! Catch your breath.', 'warning');
    }
    if (player.exhausted) {
      player.exhaustTimer -= dt;
      if (player.exhaustTimer <= 0 && player.stamina > 15) {
        player.exhausted = false;
      }
    }

    // Drinking waterskin from inventory (quick-use Q key)
    if (Game.Input.isKeyDown('KeyQ')) {
      Game.Input.clearKey('KeyQ');
      var ws = hasItem('waterskin');
      if (ws) {
        if (Game.Needs) Game.Needs.drink(ws.hydration || 35, 'Waterskin');
        removeItem('waterskin', 1);
      } else {
        var ale = hasItem('ale');
        if (ale) {
          if (Game.Needs) Game.Needs.drink(25, 'Ale');
          removeItem('ale', 1);
        }
      }
    }

    // Movement
    if (player.attackTimer <= 0 && !player.blocking) {
      var speedMod = 1.0;
      var tx = Math.floor(player.x / TS);
      var ty = Math.floor(player.y / TS);
      speedMod *= W.getSpeedMod(tx, ty);

      // Armor slows
      if (player.equipped.armor) {
        speedMod *= (1 - (player.equipped.armor.weight || 0) * 0.01);
      }

      // Needs and exhaustion slow down
      speedMod *= needsSpeedMod;
      if (player.exhausted) speedMod *= 0.55;

      var spd = player.speed * speedMod;

      if (moving) {
        player.vx = input.x * spd;
        player.vy = input.y * spd;
        movePlayer(input.x * spd * dt, input.y * spd * dt);
        var a = Math.atan2(input.y, input.x);
        player.facing = U.dirFromAngle(a);

        // Stealth skill gain: in forests at night
        if (W.isForest(tx, ty) && Game.time) {
          var hour = (Game.time / 60) % 24;
          if (hour >= 20 || hour < 5) {
            gainSkill('stealth', 0.003 * dt);
          }
        }
      } else {
        player.vx = 0;
        player.vy = 0;
      }
    }

    // Blocking
    player.blocking = Game.Input.isAction('block') && player.stamina > 5;
    if (player.blocking) {
      player.stamina = Math.max(0, player.stamina - 8 * dt);
      // Perfect parry window: first 0.18s of blocking
      if (player.parryWindow <= 0) player.parryWindow = 0.18;
    } else {
      player.parryWindow = 0;
    }
  }

  // ── Herbalism: try to forage herbs in forest tiles ──
  function tryForage() {
    var tx = Math.floor(player.x / TS);
    var ty = Math.floor(player.y / TS);
    if (!W.isForest(tx, ty)) {
      if (Game.UI) Game.UI.showNotification('Forage in forests to find herbs.', 'info');
      return;
    }

    if (Game.Minigames && !Game.Minigames.isActive()) {
      Game.Minigames.startForage(function () {
        var herbs = [
          { id: 'yarrow',     name: 'Yarrow',      type: 'herb', value: 4, qty: 1, desc: 'Stops bleeding' },
          { id: 'valerian',   name: 'Valerian',    type: 'herb', value: 6, qty: 1, desc: 'Aids sleep' },
          { id: 'chamomile',  name: 'Chamomile',   type: 'herb', value: 4, qty: 1, desc: 'Calming herb' },
          { id: 'garlic',     name: 'Wild Garlic', type: 'herb', value: 3, qty: 1, desc: 'Fights infection' },
          { id: 'elderflower',name: 'Elderflower', type: 'herb', value: 5, qty: 1, desc: 'Health tonic' }
        ];
        var skillMod = player.skills.herbalism / 100;
        // Higher skill = more likely to find rarer herbs
        var found = U.pick(herbs.slice(0, Math.floor(3 + skillMod * 2)));
        addItem(found);
        gainSkill('herbalism', 0.5 + Math.random() * 1.0);
        if (Game.Renderer) {
          for (var i = 0; i < 6; i++) {
            Game.Renderer.spawnParticle(
              player.x + (Math.random() - 0.5) * 30,
              player.y - Math.random() * 20,
              'herb'
            );
          }
        }
        if (Game.UI) Game.UI.showNotification('Found ' + found.name + '!', 'success');
        player.forageCooldown = 8; // 8 second cooldown between forages
      });
    }
  }

  function movePlayer(dx, dy) {
    var HB = 10; // half hitbox
    // Try X
    var nx = player.x + dx;
    var ty1 = Math.floor((player.y - HB) / TS);
    var ty2 = Math.floor((player.y + HB) / TS);
    var txn = Math.floor((nx + (dx > 0 ? HB : -HB)) / TS);
    var canX = true;
    for (var ty = ty1; ty <= ty2; ty++) {
      if (W.isSolid(txn, ty) || W.hasTree(txn, ty)) { canX = false; break; }
    }
    if (canX) player.x = nx;

    // Try Y
    var ny = player.y + dy;
    var tx1 = Math.floor((player.x - HB) / TS);
    var tx2 = Math.floor((player.x + HB) / TS);
    var tyn = Math.floor((ny + (dy > 0 ? HB : -HB)) / TS);
    var canY = true;
    for (var tx = tx1; tx <= tx2; tx++) {
      if (W.isSolid(tx, tyn) || W.hasTree(tx, tyn)) { canY = false; break; }
    }
    if (canY) player.y = ny;

    // World bounds
    player.x = U.clamp(player.x, TS, (W.WORLD_TILES - 1) * TS);
    player.y = U.clamp(player.y, TS, (W.WORLD_TILES - 1) * TS);
  }

  function startAttack(type) {
    if (player.attackTimer > 0 || !player.alive) return false;

    // Exhaustion check: can still attack but at higher cost
    var cost = type === 'heavy' ? 25 : 12;
    if (player.exhausted) cost = Math.floor(cost * 0.5); // costs less when already exhausted
    if (player.stamina < (player.exhausted ? 1 : cost)) return false;

    player.stamina -= cost;
    player.attackType = type;
    player.attackTimer = type === 'heavy' ? 0.6 : 0.3;
    player.inCombat = true;
    player.combatCooldown = 5;

    // Combo tracking
    if (player.comboTimer > 0 && type === (player.lastAttackType === 'light' ? 'heavy' : 'light')) {
      player.comboCount = Math.min(player.comboCount + 1, 4);
    } else {
      player.comboCount = 1;
    }
    player.comboTimer = 0.6;
    player.lastAttackType = type;

    // Weapon durability degradation
    if (player.equipped.weapon && player.equipped.weapon.durability !== undefined) {
      player.equipped.weapon.durability = Math.max(0, player.equipped.weapon.durability - 0.5);
      if (player.equipped.weapon.durability <= 20 && player.equipped.weapon.durability > 18) {
        if (Game.UI) Game.UI.showNotification(player.equipped.weapon.name + ' is getting worn. Repair it.', 'warning');
      }
      if (player.equipped.weapon.durability <= 0) {
        if (Game.UI) Game.UI.showNotification(player.equipped.weapon.name + ' has broken!', 'danger');
        player.equipped.weapon = null;
      }
    }

    // Skill gain
    gainSkill('sword', type === 'heavy' ? 0.06 : 0.025);
    return true;
  }

  function startDodge() {
    if (player.dodgeCooldown > 0 || player.stamina < 20 || !player.alive) return false;

    // Set dodge direction from current input, movement velocity, then facing fallback
    var input = Game.Input.getMovement();
    if (input.x !== 0 || input.y !== 0) {
      player.vx = input.x;
      player.vy = input.y;
    } else {
      var speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (speed < 0.1) {
        var fv = getFacingVector();
        player.vx = fv.x;
        player.vy = fv.y;
      }
    }

    player.stamina -= 20;
    player.dodging = true;
    player.dodgeTimer = 0.25;
    player.dodgeCooldown = 0.8;
    return true;
  }

  function takeDamage(amount, attacker) {
    if (player.hitCooldown > 0 || player.dodging) return 0;

    // Perfect parry: absorb hit completely and stagger attacker
    if (player.blocking && player.parryWindow > 0) {
      if (Game.Renderer) {
        Game.Renderer.triggerShake(2);
        if (Game.Combat && Game.Combat.addEffect) {
          var fv = getFacingVector();
          Game.Combat.addEffect('parry', player.x + fv.x * 15, player.y + fv.y * 15, 0, 0.5);
        }
      }
      if (Game.UI) Game.UI.showNotification('Perfect parry!', 'success');
      // Stagger attacker
      if (attacker && attacker.staggerTimer !== undefined) attacker.staggerTimer = 0.8;
      player.parryWindow = 0;
      return 0;
    }

    var actual = amount;
    if (player.blocking) {
      // Regular block: reduce damage, but not eliminate
      actual *= 0.15;
      player.stamina -= amount * 0.4;
      if (Game.Renderer && Game.Renderer.triggerShake) Game.Renderer.triggerShake(3);
      if (Game.Combat && Game.Combat.addEffect) {
        Game.Combat.addEffect('block', player.x, player.y, 0, 0.3);
      }
    } else {
      if (Game.Renderer && Game.Renderer.triggerShake) Game.Renderer.triggerShake(actual > 15 ? 10 : 5);
      if (Game.Renderer && Game.Renderer.triggerHitFlash) Game.Renderer.triggerHitFlash(actual > 20);
    }

    if (player.equipped.armor) {
      actual *= (1 - (player.equipped.armor.defense || 0) * 0.01);
      // Armor durability degradation
      if (player.equipped.armor.durability !== undefined && !player.blocking) {
        player.equipped.armor.durability = Math.max(0, player.equipped.armor.durability - 1);
        if (player.equipped.armor.durability === 0) {
          if (Game.UI) Game.UI.showNotification(player.equipped.armor.name + ' is destroyed!', 'danger');
          player.equipped.armor = null;
        }
      }
    }
    actual = Math.max(1, Math.round(actual));
    player.health -= actual;
    player.hitCooldown = 0.3;
    player.inCombat = true;
    player.combatCooldown = 5;

    // Wound system: cut causes bleeding, blunt causes bruise
    var woundType = (attacker && attacker.weaponType === 'blunt') ? 'bruise' : 'cut';
    var severity  = actual > 20 ? 3 : actual > 10 ? 2 : 1;
    if (!player.blocking) {
      player.wounds.push({ type: woundType, severity: severity, timer: 30 + severity * 20 });
    }

    // Bleeding chance from cuts
    if (woundType === 'cut' && actual > 10 && U.rng() < 0.3 + severity * 0.1) {
      player.bleeding += 1.5 + severity * 0.5;
    }

    // Blood particle spray
    if (Game.Renderer && actual > 5 && !player.blocking) {
      var count = Math.min(8, Math.floor(actual / 3));
      for (var bi = 0; bi < count; bi++) {
        Game.Renderer.spawnParticle(player.x + (Math.random() - 0.5) * 8, player.y - 10, 'blood');
      }
      if (actual > 10) {
        for (var bi = 0; bi < 4; bi++) {
          Game.Renderer.spawnParticle(player.x + (Math.random() - 0.5) * 6, player.y - 5, 'impact');
        }
      }
    }

    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
    }
    return actual;
  }

  function heal(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  function gainSkill(skill, amount) {
    if (player.skills[skill] !== undefined) {
      var before = player.skills[skill];
      player.skills[skill] = Math.min(100, player.skills[skill] + amount);
      var after = player.skills[skill];

      // Milestone progression boosts
      var milestones = [20, 40, 60, 80];
      for (var i = 0; i < milestones.length; i++) {
        var m = milestones[i];
        if (before < m && after >= m) {
          if (skill === 'sword') {
            player.maxStamina += 3;
            player.stamina = Math.min(player.maxStamina, player.stamina + 8);
          } else if (skill === 'stealth') {
            player.speed += 2;
          } else if (skill === 'speech') {
            player.reputation.global = U.clamp(player.reputation.global + 1, -100, 100);
          } else if (skill === 'herbalism') {
            player.maxHealth += 2; // herbal knowledge improves constitution
          }
          if (Game.UI && Game.UI.showNotification) {
            Game.UI.showNotification('◈ ' + skill.charAt(0).toUpperCase() + skill.slice(1) + ' reached level ' + m + '!', 'skill');
          }
        }
      }
    }
  }

  function getAttackDamage() {
    var base = 5;
    var weapon = player.equipped.weapon;
    if (weapon) base = weapon.damage || 8;

    // Weapon durability reduces damage when degraded
    if (weapon && weapon.durability !== undefined) {
      base *= Math.max(0.5, weapon.durability / 100);
    }

    var skillMod = 1 + player.skills.sword * 0.01;
    if (player.attackType === 'heavy') base *= 1.8;

    // Combo bonus: consecutive hits deal more damage
    if (player.comboCount >= 2) base *= (1 + player.comboCount * 0.12);

    // Stamina exhaustion penalty
    var needsMod = Game.Needs ? Game.Needs.getAttackMod() : 1;
    if (player.exhausted) needsMod *= 0.7;

    return Math.round(base * skillMod * needsMod);
  }

  function getAttackRange() {
    return 40; // pixels
  }

  function getAttackArc() {
    // Returns angle and arc width based on facing
    var facingAngles = {
      'N': -Math.PI / 2, 'S': Math.PI / 2, 'E': 0, 'W': Math.PI,
      'NE': -Math.PI / 4, 'NW': -3 * Math.PI / 4,
      'SE': Math.PI / 4, 'SW': 3 * Math.PI / 4
    };
    return { angle: facingAngles[player.facing] || 0, width: Math.PI / 2 };
  }

  function getFacingVector() {
    var m = {
      'N': { x: 0, y: -1 }, 'S': { x: 0, y: 1 }, 'E': { x: 1, y: 0 }, 'W': { x: -1, y: 0 },
      'NE': { x: 0.7071, y: -0.7071 }, 'NW': { x: -0.7071, y: -0.7071 },
      'SE': { x: 0.7071, y: 0.7071 }, 'SW': { x: -0.7071, y: 0.7071 }
    };
    return m[player.facing] || { x: 1, y: 0 };
  }

  function addItem(item) {
    for (var i = 0; i < player.inventory.length; i++) {
      if (player.inventory[i].id === item.id) {
        player.inventory[i].qty += (item.qty || 1);
        return;
      }
    }
    var copy = {};
    for (var k in item) copy[k] = item[k];
    if (!copy.qty) copy.qty = 1;
    player.inventory.push(copy);
  }

  function removeItem(itemId, qty) {
    for (var i = 0; i < player.inventory.length; i++) {
      if (player.inventory[i].id === itemId) {
        player.inventory[i].qty -= (qty || 1);
        if (player.inventory[i].qty <= 0) {
          player.inventory.splice(i, 1);
        }
        return true;
      }
    }
    return false;
  }

  function hasItem(itemId) {
    for (var i = 0; i < player.inventory.length; i++) {
      if (player.inventory[i].id === itemId) return player.inventory[i];
    }
    return null;
  }

  function getApparentClass() {
    if (player.equipped.armor && player.equipped.armor.classAppearance) {
      return player.equipped.armor.classAppearance;
    }
    return player.socialClass;
  }

  function getState() {
    return player;
  }

  function setState(state) {
    for (var k in state) {
      if (state.hasOwnProperty(k)) player[k] = state[k];
    }
  }

  return {
    init: init, update: update, getState: getState, setState: setState,
    startAttack: startAttack, startDodge: startDodge,
    takeDamage: takeDamage, heal: heal,
    gainSkill: gainSkill, getAttackDamage: getAttackDamage,
    getAttackRange: getAttackRange, getAttackArc: getAttackArc,
    addItem: addItem, removeItem: removeItem, hasItem: hasItem,
    getApparentClass: getApparentClass, movePlayer: movePlayer,
    tryForage: tryForage, getFacingVector: getFacingVector
  };
})();
