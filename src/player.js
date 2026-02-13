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
    // Skills (0-100)
    skills: {
      sword: 5, archery: 2, speech: 5, stealth: 3
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
    daysAlive: 0
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
    player.inventory = [
      { id: 'bread', name: 'Bread', type: 'food', value: 2, qty: 3, healAmount: 8 },
      { id: 'knife', name: 'Hunting Knife', type: 'weapon', damage: 8, speed: 1.2, value: 10, qty: 1 }
    ];
    player.equipped.weapon = player.inventory[1];
  }

  function update(dt) {
    if (!player.alive) return;

    // Combat cooldowns
    if (player.attackTimer > 0) player.attackTimer -= dt;
    if (player.combatCooldown > 0) player.combatCooldown -= dt;
    if (player.dodgeCooldown > 0) player.dodgeCooldown -= dt;
    if (player.hitCooldown > 0) player.hitCooldown -= dt;

    // Bleeding still ticks while dodging
    if (player.bleeding > 0) {
      player.health -= player.bleeding * dt;
      player.bleeding = Math.max(0, player.bleeding - 0.5 * dt);
      if (player.health <= 0) {
        player.health = 0;
        player.alive = false;
        return;
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

    // Stamina regen
    if (!player.blocking && player.attackTimer <= 0) {
      player.stamina = Math.min(player.maxStamina, player.stamina + player.staminaRegen * dt);
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

      var spd = player.speed * speedMod;

      if (moving) {
        player.vx = input.x * spd;
        player.vy = input.y * spd;
        movePlayer(input.x * spd * dt, input.y * spd * dt);
        var a = Math.atan2(input.y, input.x);
        player.facing = U.dirFromAngle(a);

        // Stealth skill gain
        if (W.isForest(tx, ty) && Game.time) {
          var hour = (Game.time / 60) % 24;
          if (hour >= 20 || hour < 5) {
            gainSkill('stealth', 0.002 * dt);
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
    var cost = type === 'heavy' ? 25 : 12;
    if (player.stamina < cost) return false;
    player.stamina -= cost;
    player.attackType = type;
    player.attackTimer = type === 'heavy' ? 0.6 : 0.3;
    player.inCombat = true;
    player.combatCooldown = 5;

    // Skill gain
    gainSkill('sword', type === 'heavy' ? 0.05 : 0.02);
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
    var actual = amount;
    if (player.blocking) {
      actual *= 0.2;
      player.stamina -= amount * 0.5;
      // Block shake (small)
      if (Game.Renderer && Game.Renderer.triggerShake) Game.Renderer.triggerShake(2);
    } else {
      // Hit shake
      if (Game.Renderer && Game.Renderer.triggerShake) Game.Renderer.triggerShake(actual > 15 ? 8 : 4);
    }
    if (player.equipped.armor) {
      actual *= (1 - (player.equipped.armor.defense || 0) * 0.01);
    }
    actual = Math.max(1, Math.round(actual));
    player.health -= actual;
    player.hitCooldown = 0.3;
    player.inCombat = true;
    player.combatCooldown = 5;

    // Bleeding chance
    if (actual > 15 && U.rng() < 0.3) {
      player.bleeding += 2;
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
      player.skills[skill] = Math.min(100, player.skills[skill] + amount);
    }
  }

  function getAttackDamage() {
    var base = 5;
    if (player.equipped.weapon) base = player.equipped.weapon.damage || 8;
    var skillMod = 1 + player.skills.sword * 0.01;
    if (player.attackType === 'heavy') base *= 1.8;
    return Math.round(base * skillMod);
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
    getApparentClass: getApparentClass, movePlayer: movePlayer
  };
})();
