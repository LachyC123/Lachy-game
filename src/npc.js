var Game = Game || {};

Game.NPC = (function () {
  var U = Game.Utils;
  var W, TS;
  var npcs = [];
  var spatialHash;
  var NPC_UPDATE_RANGE = 600; // pixels - only update nearby NPCs AI

  // NPC behavior states
  var STATE = {
    IDLE: 'idle', TRAVEL: 'travel', WORK: 'work', SOCIALIZE: 'socialize',
    SLEEP: 'sleep', FLEE: 'flee', FIGHT: 'fight', INVESTIGATE: 'investigate',
    PATROL: 'patrol', DEAD: 'dead', ARRESTED: 'arrested'
  };

  // Job definitions with schedules
  var JOBS = {
    farmer: {
      label: 'Farmer',
      schedule: [
        { start: 5, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.TRAVEL, target: 'home' },
        { start: 13, end: 18, state: STATE.WORK },
        { start: 18, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 5, state: STATE.SLEEP }
      ]
    },
    guard: {
      label: 'Guard',
      schedule: [
        { start: 6, end: 18, state: STATE.PATROL },
        { start: 18, end: 22, state: STATE.IDLE },
        { start: 22, end: 6, state: STATE.SLEEP }
      ]
    },
    merchant: {
      label: 'Merchant',
      schedule: [
        { start: 7, end: 8, state: STATE.TRAVEL, target: 'work' },
        { start: 8, end: 18, state: STATE.WORK },
        { start: 18, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 7, state: STATE.SLEEP }
      ]
    },
    blacksmith: {
      label: 'Blacksmith',
      schedule: [
        { start: 6, end: 17, state: STATE.WORK },
        { start: 17, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 6, state: STATE.SLEEP }
      ]
    },
    tavernKeeper: {
      label: 'Tavern Keeper',
      schedule: [
        { start: 9, end: 23, state: STATE.WORK },
        { start: 23, end: 9, state: STATE.SLEEP }
      ]
    },
    noble: {
      label: 'Noble',
      schedule: [
        { start: 9, end: 11, state: STATE.TRAVEL, target: 'work' },
        { start: 11, end: 14, state: STATE.SOCIALIZE },
        { start: 14, end: 17, state: STATE.IDLE },
        { start: 17, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 9, state: STATE.SLEEP }
      ]
    },
    king: {
      label: 'King',
      schedule: [
        { start: 8, end: 12, state: STATE.WORK },
        { start: 12, end: 14, state: STATE.IDLE },
        { start: 14, end: 18, state: STATE.WORK },
        { start: 18, end: 22, state: STATE.SOCIALIZE },
        { start: 22, end: 8, state: STATE.SLEEP }
      ]
    },
    bandit: {
      label: 'Bandit',
      schedule: [
        { start: 0, end: 24, state: STATE.IDLE }
      ]
    },
    villager: {
      label: 'Villager',
      schedule: [
        { start: 6, end: 8, state: STATE.IDLE },
        { start: 8, end: 12, state: STATE.WORK },
        { start: 12, end: 14, state: STATE.SOCIALIZE },
        { start: 14, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 6, state: STATE.SLEEP }
      ]
    },
    woodcutter: {
      label: 'Woodcutter',
      schedule: [
        { start: 5, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 16, state: STATE.WORK },
        { start: 16, end: 18, state: STATE.TRAVEL, target: 'home' },
        { start: 18, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 5, state: STATE.SLEEP }
      ]
    }
  };

  var PERSONALITIES = ['brave', 'cowardly', 'friendly', 'hostile', 'greedy', 'honest', 'suspicious', 'calm'];
  var SOCIAL_CLASSES = { king: 5, noble: 4, guard: 3, merchant: 3, blacksmith: 2, tavernKeeper: 2, farmer: 1, villager: 1, woodcutter: 1, bandit: 0 };

  function createNPC(opts) {
    var gender = opts.gender || (U.rng() < 0.5 ? 'male' : 'female');
    var name = opts.name || U.generateName(gender);
    var npc = {
      id: npcs.length,
      name: name,
      gender: gender,
      age: opts.age || U.randInt(18, 65),
      job: opts.job || 'villager',
      home: opts.home || { x: 0, y: 0 },
      work: opts.work || opts.home || { x: 0, y: 0 },
      socialClass: SOCIAL_CLASSES[opts.job] || 1,
      personality: opts.personality || U.pick(PERSONALITIES),
      x: opts.x || 0,
      y: opts.y || 0,
      vx: 0, vy: 0,
      facing: 'S',
      speed: opts.speed || 60,
      health: opts.health || 80,
      maxHealth: opts.maxHealth || 80,
      stamina: 80,
      maxStamina: 80,
      alive: true,
      state: STATE.IDLE,
      scheduledState: STATE.IDLE,
      stateTimer: 0,
      targetX: 0, targetY: 0,
      hasTarget: false,
      wanderTimer: 0,
      // Combat
      damage: opts.damage || 8,
      armor: opts.armor || 0,
      combatTarget: null,
      attackTimer: 0,
      hitCooldown: 0,
      blocking: false,
      aggression: opts.aggression || 0.3,
      bleeding: 0,
      // Relationships
      playerRelation: opts.playerRelation || 0, // -100 to 100
      faction: opts.faction || 'civilian',
      // Memory
      memory: [],
      lastSawPlayer: -1,
      lastSawCrime: -1,
      alarmed: false,
      alarmTimer: 0,
      // Speech
      bark: '',
      barkTimer: 0,
      speechBubble: '',
      speechTimer: 0,
      // Appearance
      bodyColor: opts.bodyColor || getJobColor(opts.job),
      headColor: opts.headColor || '#e8c4a0',
      // Patrol data (for guards)
      patrolPoints: opts.patrolPoints || [],
      patrolIndex: 0,
      // Merchant data
      inventory: opts.inventory || [],
      // state
      currentLocation: opts.location || 'wilderness',
      // Activity & immersion
      activityAnim: 0,       // phase counter for tool use animation
      alertIcon: '',         // '!' or '?' shown above head
      alertIconTimer: 0,
      greetedPlayer: false,  // has greeted player this encounter
      greetCooldown: 0,      // cooldown before greeting again
      timesMetPlayer: 0,     // how many times player approached
      lastPlayerDist: 999    // track approach/leave
    };
    npcs.push(npc);
    return npc;
  }

  function getJobColor(job) {
    switch (job) {
      case 'guard': return '#2c4a8a';
      case 'noble': return '#8a2c2c';
      case 'king': return '#8a6a2c';
      case 'merchant': return '#2c6a3a';
      case 'blacksmith': return '#4a4a4a';
      case 'tavernKeeper': return '#6a4a2c';
      case 'bandit': return '#3a3a3a';
      case 'farmer': return '#6a5a3a';
      case 'woodcutter': return '#5a4a2a';
      default: return '#5a5040';
    }
  }

  function init() {
    W = Game.World;
    TS = W.TILE_SIZE;
    npcs = [];
    spatialHash = new U.SpatialHash(128);
    U.resetNames();
    spawnAllNPCs();
  }

  function spawnAllNPCs() {
    var locs = W.getLocations();

    // === ASHFORD TOWN ===
    // King
    createNPC({
      name: { first: 'Aldric', last: 'Valdren', full: 'King Aldric Valdren' },
      job: 'king', gender: 'male', age: 52,
      x: 141 * TS, y: 114 * TS,
      home: { x: 141 * TS, y: 114 * TS },
      work: { x: 141 * TS, y: 114 * TS },
      health: 120, maxHealth: 120, damage: 15, armor: 30,
      faction: 'crown', personality: 'calm',
      bodyColor: '#8a6a2c', playerRelation: 0,
      location: 'ashford'
    });

    // Nobles
    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'noble', age: U.randInt(30, 60),
        x: (140 + i * 2) * TS, y: (121 + i) * TS,
        home: { x: (140 + i * 2) * TS, y: (121 + i) * TS },
        work: { x: 141 * TS, y: 114 * TS },
        faction: 'nobles', personality: U.pick(['suspicious', 'greedy', 'calm']),
        armor: 10, playerRelation: -5, location: 'ashford'
      });
    }

    // Guards (patrol town)
    var guardPatrols = [
      [{ x: 110, y: 128 }, { x: 128, y: 128 }, { x: 146, y: 128 }, { x: 128, y: 128 }],
      [{ x: 128, y: 110 }, { x: 128, y: 128 }, { x: 128, y: 146 }, { x: 128, y: 128 }],
      [{ x: 110, y: 110 }, { x: 146, y: 110 }, { x: 146, y: 146 }, { x: 110, y: 146 }],
      [{ x: 128, y: 148 }, { x: 128, y: 150 }, { x: 130, y: 150 }, { x: 126, y: 150 }],
      [{ x: 108, y: 128 }, { x: 106, y: 128 }, { x: 106, y: 130 }, { x: 108, y: 130 }]
    ];
    for (var i = 0; i < 8; i++) {
      var pp = guardPatrols[i % guardPatrols.length].map(function (p) {
        return { x: p.x * TS, y: p.y * TS };
      });
      createNPC({
        job: 'guard', gender: 'male', age: U.randInt(22, 45),
        x: pp[0].x, y: pp[0].y,
        home: { x: 113 * TS, y: 139 * TS },
        work: { x: pp[0].x, y: pp[0].y },
        health: 100, maxHealth: 100, damage: 12, armor: 20,
        faction: 'guards', personality: U.pick(['brave', 'calm', 'suspicious']),
        speed: 70, patrolPoints: pp, aggression: 0.7,
        location: 'ashford'
      });
    }

    // Tavern keeper
    createNPC({
      name: { first: 'Gerda', last: 'Holden', full: 'Gerda Holden' },
      job: 'tavernKeeper', gender: 'female', age: 45,
      x: 116 * TS, y: 127 * TS,
      home: { x: 116 * TS, y: 127 * TS },
      work: { x: 116 * TS, y: 127 * TS },
      faction: 'civilian', personality: 'friendly',
      playerRelation: 5, location: 'ashford',
      inventory: [
        { id: 'ale', name: 'Ale', type: 'food', value: 3, healAmount: 5 },
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 },
        { id: 'stew', name: 'Hearty Stew', type: 'food', value: 5, healAmount: 20 }
      ]
    });

    // Blacksmith
    createNPC({
      name: { first: 'Roderic', last: 'Stone', full: 'Roderic Stone' },
      job: 'blacksmith', gender: 'male', age: 38,
      x: 137 * TS, y: 127 * TS,
      home: { x: 137 * TS, y: 130 * TS },
      work: { x: 137 * TS, y: 127 * TS },
      faction: 'civilian', personality: 'honest',
      playerRelation: 0, location: 'ashford',
      inventory: [
        { id: 'sword', name: 'Iron Sword', type: 'weapon', damage: 15, speed: 1.0, value: 40 },
        { id: 'axe', name: 'Battle Axe', type: 'weapon', damage: 20, speed: 0.8, value: 55 },
        { id: 'shield', name: 'Wooden Shield', type: 'shield', defense: 15, value: 25 },
        { id: 'leather_armor', name: 'Leather Armor', type: 'armor', defense: 15, weight: 10, value: 35, classAppearance: 'commoner' },
        { id: 'chain_armor', name: 'Chainmail', type: 'armor', defense: 30, weight: 25, value: 80, classAppearance: 'guard' }
      ]
    });

    // Town merchants
    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'merchant', age: U.randInt(25, 55),
        x: (124 + i * 3) * TS, y: 121 * TS,
        home: { x: (113 + i * 10) * TS, y: 114 * TS },
        work: { x: (124 + i * 3) * TS, y: 121 * TS },
        faction: 'civilian', personality: U.pick(['friendly', 'greedy', 'honest']),
        location: 'ashford',
        inventory: [
          { id: 'grain', name: 'Sack of Grain', type: 'trade', value: 8 },
          { id: 'tools', name: 'Iron Tools', type: 'trade', value: 15 },
          { id: 'cloth', name: 'Bolt of Cloth', type: 'trade', value: 12 },
          { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 }
        ]
      });
    }

    // Town commoners
    for (var i = 0; i < 8; i++) {
      var hx = [114, 121, 114, 135, 141, 135, 121, 141][i];
      var hy = [114, 114, 119, 135, 135, 119, 135, 121][i];
      createNPC({
        job: 'villager', age: U.randInt(16, 60),
        x: (hx + 2) * TS, y: (hy + 2) * TS,
        home: { x: (hx + 2) * TS, y: (hy + 2) * TS },
        work: { x: (U.randInt(112, 145)) * TS, y: (U.randInt(112, 145)) * TS },
        faction: 'civilian', location: 'ashford'
      });
    }

    // === MILLHAVEN VILLAGE ===
    var mhx = 66, mhy = 190;
    // Village elder
    createNPC({
      name: { first: 'Edmund', last: 'Ashford', full: 'Edmund Ashford' },
      job: 'villager', gender: 'male', age: 62,
      x: mhx * TS, y: mhy * TS,
      home: { x: (mhx - 5) * TS, y: (mhy - 3) * TS },
      work: { x: mhx * TS, y: mhy * TS },
      faction: 'millhaven', personality: 'friendly',
      playerRelation: 10, location: 'millhaven'
    });

    // Farmers
    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'farmer', age: U.randInt(20, 50),
        x: (mhx - 4 + i * 4) * TS, y: (mhy + 2) * TS,
        home: { x: (mhx - 5 + i * 8) * TS, y: (mhy - 3 + (i > 1 ? 6 : 0)) * TS },
        work: { x: (55 + i * 8) * TS, y: 178 * TS },
        faction: 'millhaven', location: 'millhaven'
      });
    }

    // Village shop keeper
    createNPC({
      name: { first: 'Maren', last: 'Cooper', full: 'Maren Cooper' },
      job: 'merchant', gender: 'female', age: 34,
      x: (mhx + 6) * TS, y: (mhy + 1) * TS,
      home: { x: (mhx + 5) * TS, y: (mhy + 4) * TS },
      work: { x: (mhx + 6) * TS, y: (mhy + 1) * TS },
      faction: 'millhaven', personality: 'friendly',
      playerRelation: 5, location: 'millhaven',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 },
        { id: 'grain', name: 'Sack of Grain', type: 'trade', value: 8 },
        { id: 'knife', name: 'Hunting Knife', type: 'weapon', damage: 8, speed: 1.2, value: 10 },
        { id: 'bandage', name: 'Linen Bandage', type: 'healing', value: 5, healAmount: 30 }
      ]
    });

    // Villagers
    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'villager', age: U.randInt(16, 55),
        x: (mhx - 2 + i * 3) * TS, y: (mhy - 1 + i) * TS,
        home: { x: (mhx - 5 + i * 8) * TS, y: (mhy + 4) * TS },
        work: { x: (mhx + i * 2) * TS, y: mhy * TS },
        faction: 'millhaven', location: 'millhaven'
      });
    }

    // === THORNFIELD VILLAGE ===
    var tfx = 66, tfy = 64;
    // Woodcutter
    createNPC({
      name: { first: 'Henrik', last: 'Sawyer', full: 'Henrik Sawyer' },
      job: 'woodcutter', gender: 'male', age: 35,
      x: tfx * TS, y: tfy * TS,
      home: { x: (tfx - 5) * TS, y: (tfy - 3) * TS },
      work: { x: 45 * TS, y: 40 * TS },
      faction: 'thornfield', personality: 'brave', location: 'thornfield'
    });

    // Village elder
    createNPC({
      name: { first: 'Oswin', last: 'Thatcher', full: 'Oswin Thatcher' },
      job: 'villager', gender: 'male', age: 58,
      x: (tfx + 1) * TS, y: (tfy + 1) * TS,
      home: { x: (tfx + 4) * TS, y: (tfy - 3) * TS },
      work: { x: tfx * TS, y: tfy * TS },
      faction: 'thornfield', personality: 'honest',
      playerRelation: 0, location: 'thornfield'
    });

    // Thornfield villagers
    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'villager', age: U.randInt(18, 50),
        x: (tfx - 3 + i * 4) * TS, y: (tfy + 2) * TS,
        home: { x: (tfx - 5 + i * 8) * TS, y: (tfy + 4) * TS },
        work: { x: (tfx - 2 + i * 3) * TS, y: tfy * TS },
        faction: 'thornfield', location: 'thornfield'
      });
    }

    // Thornfield shop
    createNPC({
      job: 'merchant', age: U.randInt(25, 45),
      x: (tfx + 6) * TS, y: (tfy + 1) * TS,
      home: { x: (tfx + 5) * TS, y: (tfy + 4) * TS },
      work: { x: (tfx + 6) * TS, y: (tfy + 1) * TS },
      faction: 'thornfield', location: 'thornfield',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 },
        { id: 'wood', name: 'Bundle of Wood', type: 'trade', value: 5 },
        { id: 'hatchet', name: 'Hatchet', type: 'weapon', damage: 10, speed: 1.0, value: 15 }
      ]
    });

    // === BANDITS ===
    var bx = 200, by = 80;
    // Bandit leader
    createNPC({
      name: { first: 'Lothar', last: 'Voss', full: 'Lothar Voss' },
      job: 'bandit', gender: 'male', age: 40,
      x: bx * TS, y: by * TS,
      home: { x: bx * TS, y: by * TS },
      work: { x: bx * TS, y: by * TS },
      health: 110, maxHealth: 110, damage: 16, armor: 15,
      faction: 'bandits', personality: 'hostile',
      aggression: 0.9, speed: 65, playerRelation: -20,
      location: 'banditCamp'
    });

    for (var i = 0; i < 5; i++) {
      createNPC({
        job: 'bandit', age: U.randInt(20, 40),
        x: (bx - 4 + i * 2) * TS, y: (by - 2 + (i % 3)) * TS,
        home: { x: (bx - 3 + i * 2) * TS, y: (by - 1) * TS },
        work: { x: (bx - 3 + i * 2) * TS, y: (by - 1) * TS },
        health: 70, maxHealth: 70, damage: 10 + i, armor: 5,
        faction: 'bandits', personality: 'hostile',
        aggression: 0.8, speed: 55 + i * 3, playerRelation: -15,
        location: 'banditCamp'
      });
    }

    // === WANDERING TRADERS (travel between settlements) ===
    createNPC({
      name: { first: 'Ingram', last: 'Brennan', full: 'Ingram Brennan' },
      job: 'merchant', gender: 'male', age: 42,
      x: 90 * TS, y: 160 * TS,
      home: { x: 66 * TS, y: 190 * TS },   // Millhaven
      work: { x: 128 * TS, y: 128 * TS },   // Ashford market
      faction: 'civilian', personality: 'friendly',
      speed: 55, playerRelation: 0, location: 'wilderness',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 },
        { id: 'wine', name: 'Wine', type: 'food', value: 8, healAmount: 15 },
        { id: 'cloth', name: 'Fine Cloth', type: 'trade', value: 18 },
        { id: 'spice', name: 'Spices', type: 'trade', value: 25 }
      ]
    });
    createNPC({
      name: { first: 'Petra', last: 'Lang', full: 'Petra Lang' },
      job: 'merchant', gender: 'female', age: 35,
      x: 80 * TS, y: 90 * TS,
      home: { x: 66 * TS, y: 64 * TS },    // Thornfield
      work: { x: 128 * TS, y: 128 * TS },   // Ashford market
      faction: 'civilian', personality: 'honest',
      speed: 50, playerRelation: 0, location: 'wilderness',
      inventory: [
        { id: 'wood', name: 'Bundle of Wood', type: 'trade', value: 5 },
        { id: 'herbs', name: 'Healing Herbs', type: 'healing', value: 8, healAmount: 25 },
        { id: 'pelts', name: 'Animal Pelts', type: 'trade', value: 15 },
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8 }
      ]
    });
  }

  function update(dt) {
    var px = Game.Player.getState().x;
    var py = Game.Player.getState().y;

    spatialHash.clear();
    for (var i = 0; i < npcs.length; i++) {
      if (npcs[i].alive) spatialHash.insert(npcs[i]);
    }

    var hour = Game.time ? ((Game.time / 60) % 24) : 12;

    for (var i = 0; i < npcs.length; i++) {
      var npc = npcs[i];
      if (!npc.alive) continue;

      var distToPlayer = U.dist(npc.x, npc.y, px, py);

      // Only do full AI for nearby NPCs
      if (distToPlayer < NPC_UPDATE_RANGE) {
        updateNPCAI(npc, dt, hour, px, py, distToPlayer);
      } else if (distToPlayer < NPC_UPDATE_RANGE * 3) {
        // Simplified update: just handle schedule
        updateSchedule(npc, hour);
        // Teleport to scheduled position slowly
        if (npc.scheduledState === STATE.SLEEP) {
          npc.x = U.lerp(npc.x, npc.home.x, 0.01);
          npc.y = U.lerp(npc.y, npc.home.y, 0.01);
        } else if (npc.scheduledState === STATE.WORK) {
          npc.x = U.lerp(npc.x, npc.work.x, 0.01);
          npc.y = U.lerp(npc.y, npc.work.y, 0.01);
        }
      }

      // Bleeding
      if (npc.bleeding > 0) {
        npc.health -= npc.bleeding * dt;
        npc.bleeding = Math.max(0, npc.bleeding - 0.3 * dt);
        if (npc.health <= 0) {
          npc.health = 0;
          npc.alive = false;
          npc.state = STATE.DEAD;
        }
      }

      // Bark timer
      if (npc.barkTimer > 0) npc.barkTimer -= dt;
      if (npc.speechTimer > 0) npc.speechTimer -= dt;

      // Attack cooldown
      if (npc.attackTimer > 0) npc.attackTimer -= dt;
      if (npc.hitCooldown > 0) npc.hitCooldown -= dt;
    }
  }

  function updateSchedule(npc, hour) {
    var job = JOBS[npc.job];
    if (!job) return;
    var sched = job.schedule;
    for (var i = 0; i < sched.length; i++) {
      var s = sched[i];
      var inRange;
      if (s.start < s.end) {
        inRange = hour >= s.start && hour < s.end;
      } else {
        inRange = hour >= s.start || hour < s.end;
      }
      if (inRange) {
        npc.scheduledState = s.state;
        break;
      }
    }
  }

  function updateNPCAI(npc, dt, hour, px, py, distToPlayer) {
    updateSchedule(npc, hour);

    // Override states for combat / alarm
    if (npc.state === STATE.FIGHT) {
      updateCombatAI(npc, dt, px, py);
      return;
    }
    if (npc.state === STATE.FLEE) {
      updateFleeAI(npc, dt, px, py);
      return;
    }
    if (npc.state === STATE.INVESTIGATE) {
      updateInvestigateAI(npc, dt, px, py);
      return;
    }

    // Bandits: attack player on sight
    if (npc.faction === 'bandits' && distToPlayer < 200 && npc.alive) {
      var pState = Game.Player.getState();
      if (pState.alive && npc.aggression > 0.5) {
        npc.state = STATE.FIGHT;
        npc.combatTarget = 'player';
        setBark(npc, 'Hah! Your coin or your life!');
        return;
      }
    }

    // Guards: check for crimes / suspicious behavior / react to social class
    if (npc.job === 'guard' && distToPlayer < 180) {
      var pState = Game.Player.getState();
      if (pState.bounty > 0) {
        npc.state = STATE.FIGHT;
        npc.combatTarget = 'player';
        setBark(npc, 'Halt! You are wanted for crimes!');
        return;
      }
      if (Game.World.isRestricted(Math.floor(px / TS), Math.floor(py / TS)) && Game.Player.getApparentClass() !== 'noble') {
        setBark(npc, 'You do not belong here. Move along.');
      }
      // Salute/acknowledge nobles passing by
      var nearbyNobility = spatialHash.query(npc.x, npc.y, 80);
      for (var ni = 0; ni < nearbyNobility.length; ni++) {
        var nn = nearbyNobility[ni];
        if ((nn.job === 'noble' || nn.job === 'king') && nn.alive && npc.barkTimer <= 0 && U.rng() < 0.01) {
          if (nn.x < npc.x) npc.facing = 'W'; else npc.facing = 'E';
          setBark(npc, nn.job === 'king' ? 'Your Majesty.' : 'My lord.');
          break;
        }
      }
    }

    // NPCs pause and look at player when greeting
    if (npc.barkTimer > 2.5 && distToPlayer < 100) {
      var lookAngle = U.angle(npc.x, npc.y, px, py);
      npc.facing = U.dirFromAngle(lookAngle);
      npc.wanderTimer = Math.max(npc.wanderTimer, 2);
    }

    // Follow schedule
    switch (npc.scheduledState) {
      case STATE.SLEEP:
        npc.state = STATE.SLEEP;
        moveToward(npc, npc.home.x, npc.home.y, dt, 0.5);
        break;
      case STATE.WORK:
        npc.state = STATE.WORK;
        moveToward(npc, npc.work.x, npc.work.y, dt, 1.0);
        if (U.distSq(npc.x, npc.y, npc.work.x, npc.work.y) < 400) {
          // Wander near work
          if (npc.wanderTimer <= 0) {
            npc.targetX = npc.work.x + U.randFloat(-48, 48);
            npc.targetY = npc.work.y + U.randFloat(-48, 48);
            npc.hasTarget = true;
            npc.wanderTimer = U.randFloat(3, 8);
          } else {
            npc.wanderTimer -= dt;
            if (npc.hasTarget) moveToward(npc, npc.targetX, npc.targetY, dt, 0.5);
          }
          // Work barks (now context-aware)
          if (npc.barkTimer <= 0 && U.rng() < 0.006) {
            var ctxBark = Game.Ambient ? Game.Ambient.getContextBark(npc, 'work') : null;
            setBark(npc, ctxBark || U.pick(getWorkBarks(npc.job)));
          }
        }
        break;
      case STATE.PATROL:
        npc.state = STATE.PATROL;
        if (npc.patrolPoints.length > 0) {
          var pp = npc.patrolPoints[npc.patrolIndex];
          moveToward(npc, pp.x, pp.y, dt, 1.0);
          if (U.distSq(npc.x, npc.y, pp.x, pp.y) < 400) {
            npc.patrolIndex = (npc.patrolIndex + 1) % npc.patrolPoints.length;
          }
        }
        break;
      case STATE.SOCIALIZE:
        npc.state = STATE.SOCIALIZE;
        // Move to a social spot (market or tavern if in town)
        var socX, socY;
        if (npc.currentLocation === 'ashford') {
          if (hour >= 18) {
            socX = 116 * TS; socY = 128 * TS; // tavern area
          } else {
            socX = 128 * TS; socY = 128 * TS; // market
          }
        } else {
          socX = npc.home.x + U.randFloat(-64, 64);
          socY = npc.home.y + U.randFloat(-64, 64);
        }
        moveToward(npc, socX, socY, dt, 0.6);
        // Social barks (context-aware)
        if (npc.barkTimer <= 0 && U.rng() < 0.004) {
          var ctxBark = Game.Ambient ? Game.Ambient.getContextBark(npc, 'social') : null;
          setBark(npc, ctxBark || U.pick(getSocialBarks(npc)));
        }
        break;
      case STATE.IDLE:
        npc.state = STATE.IDLE;
        if (npc.wanderTimer <= 0) {
          npc.targetX = npc.home.x + U.randFloat(-64, 64);
          npc.targetY = npc.home.y + U.randFloat(-64, 64);
          npc.hasTarget = true;
          npc.wanderTimer = U.randFloat(2, 6);
        } else {
          npc.wanderTimer -= dt;
          if (npc.hasTarget) moveToward(npc, npc.targetX, npc.targetY, dt, 0.4);
        }
        break;
      case STATE.TRAVEL:
        npc.state = STATE.TRAVEL;
        moveToward(npc, npc.work.x, npc.work.y, dt, 1.0);
        break;
    }

    // === GREETING MEMORY & ALERT SYSTEM ===
    if (npc.greetCooldown > 0) npc.greetCooldown -= dt;
    if (npc.alertIconTimer > 0) npc.alertIconTimer -= dt;
    else npc.alertIcon = '';

    // Track player approach/leave
    var wasClose = npc.lastPlayerDist < 100;
    var isClose = distToPlayer < 100;
    npc.lastPlayerDist = distToPlayer;

    // Player just entered NPC awareness range
    if (isClose && !wasClose && npc.barkTimer <= 0 && npc.greetCooldown <= 0) {
      npc.timesMetPlayer++;
      npc.greetedPlayer = true;
      npc.greetCooldown = 30; // don't greet again for 30s

      var greeting;
      if (npc.timesMetPlayer === 1) {
        // First meeting ever
        greeting = U.pick(['Hm? I have not seen you before.', 'A new face around here.', 'Who might you be?']);
        npc.alertIcon = '?';
        npc.alertIconTimer = 2;
      } else if (npc.timesMetPlayer < 4) {
        greeting = U.pick(['You again.', 'Back so soon?', 'I remember you.']);
      } else if (npc.playerRelation > 15) {
        greeting = U.pick(['Ah, my friend!', 'Welcome back!', 'Good to see you, ' + (Game.Player.getState().socialClass === 'peasant' ? 'friend' : 'sir') + '.']);
      } else if (npc.playerRelation < -15) {
        greeting = U.pick(['Not you again.', 'What do you want?', 'Keep walking.']);
        npc.alertIcon = '!';
        npc.alertIconTimer = 1.5;
      } else {
        greeting = U.pick(['Greetings.', 'Hello.', 'Day to you.']);
      }

      // Job-specific first greeting
      if (npc.timesMetPlayer === 1) {
        if (npc.job === 'guard') greeting = 'Halt. State your business here.';
        else if (npc.job === 'merchant') greeting = 'A customer? Come, have a look!';
        else if (npc.job === 'tavernKeeper') greeting = 'Welcome, traveler. Hungry?';
      }

      setBark(npc, greeting);

      // Face the player
      var lookAng = U.angle(npc.x, npc.y, px, py);
      npc.facing = U.dirFromAngle(lookAng);
      npc.wanderTimer = Math.max(npc.wanderTimer, 3);
    }

    // Activity animation counter (used by renderer for tool-use)
    if (npc.state === STATE.WORK) npc.activityAnim += dt * 3;

    // Ambient awareness barks (now rich and contextual) - less frequent since greetings handle proximity
    if (npc.barkTimer <= 0 && distToPlayer < 120 && !isClose && U.rng() < 0.002) {
      var ctxBark = Game.Ambient ? Game.Ambient.getContextBark(npc, 'playerNear') : null;
      setBark(npc, ctxBark || U.pick(getAwarenessBarks(npc, hour)));
    }
  }

  function updateCombatAI(npc, dt, px, py) {
    var pState = Game.Player.getState();
    if (!pState.alive) {
      npc.state = STATE.IDLE;
      npc.combatTarget = null;
      setBark(npc, U.pick(['That is done.', 'It is over.', 'Stay down.']));
      return;
    }

    var dist = U.dist(npc.x, npc.y, px, py);

    // Give up if too far
    if (dist > 500) {
      npc.state = STATE.IDLE;
      npc.combatTarget = null;
      setBark(npc, 'Coward ran off.');
      return;
    }

    // Initialize combat sub-state if needed
    if (!npc._combatPhase) npc._combatPhase = 'approach';
    if (!npc._circleDir) npc._circleDir = U.rng() < 0.5 ? 1 : -1;
    if (!npc._phaseTimer) npc._phaseTimer = 0;
    npc._phaseTimer -= dt;

    var angleToPlayer = U.angle(npc.x, npc.y, px, py);
    var aggro = npc.aggression || 0.5;
    var hpRatio = npc.health / npc.maxHealth;
    var isPlayerAttacking = pState.attackTimer > 0;
    var isPlayerBlocking = pState.blocking;
    var allies = spatialHash.query(npc.x, npc.y, 150);
    var allyCount = 0;
    for (var ai = 0; ai < allies.length; ai++) {
      if (allies[ai].id !== npc.id && allies[ai].alive && allies[ai].state === STATE.FIGHT) allyCount++;
    }

    // === TACTICAL PHASE MACHINE ===

    // Flee if low HP (cowards flee earlier, brave fight to the end)
    var fleeThreshold = npc.personality === 'cowardly' ? 0.4 : npc.personality === 'brave' ? 0.1 : 0.2;
    if (hpRatio < fleeThreshold && allyCount === 0) {
      npc.state = STATE.FLEE;
      npc.combatTarget = null;
      npc._combatPhase = null;
      setBark(npc, U.pick(['I yield!', 'Mercy!', 'I surrender!', 'Enough! I give up!']));
      return;
    }

    // Retreat to heal if hurt but not critical
    if (hpRatio < 0.5 && npc._combatPhase !== 'retreat' && U.rng() < 0.01) {
      npc._combatPhase = 'retreat';
      npc._phaseTimer = 1.5 + U.rng();
      setBark(npc, U.pick(['Back off!', 'Need room...', 'Tch...']));
    }

    switch (npc._combatPhase) {
      case 'approach':
        // Close distance
        if (dist > 45) {
          moveToward(npc, px, py, dt, 1.2 + aggro * 0.3);
        } else {
          // In range — decide next action
          npc._combatPhase = (U.rng() < 0.4 + aggro * 0.3) ? 'attack' : 'circle';
          npc._phaseTimer = 0.3 + U.rng() * 0.5;
        }
        npc.blocking = false;
        break;

      case 'circle':
        // Strafe around player to find an opening
        var circleAngle = angleToPlayer + Math.PI / 2 * npc._circleDir;
        var cx = px + Math.cos(circleAngle) * 50;
        var cy = py + Math.sin(circleAngle) * 50;
        moveToward(npc, cx, cy, dt, 0.8);
        npc.blocking = U.rng() < 0.5; // guard while circling

        if (npc._phaseTimer <= 0) {
          // After circling, attack or keep circling
          if (U.rng() < 0.6 + aggro * 0.2) {
            npc._combatPhase = 'attack';
            npc._phaseTimer = 0.1;
          } else {
            npc._circleDir *= -1; // switch direction
            npc._phaseTimer = 1 + U.rng() * 1.5;
          }
        }
        // Dodge if player is attacking us
        if (isPlayerAttacking && dist < 50 && U.rng() < aggro * 0.4) {
          npc._combatPhase = 'dodge';
          npc._phaseTimer = 0.3;
        }
        break;

      case 'attack':
        // Rush in and strike
        if (dist > 38) {
          moveToward(npc, px, py, dt, 1.6);
          npc.blocking = false;
        }
        if (dist < 42 && npc.attackTimer <= 0) {
          // Don't attack into a block — feint sometimes
          if (isPlayerBlocking && U.rng() < 0.35) {
            npc._combatPhase = 'feint';
            npc._phaseTimer = 0.6;
            break;
          }
          var damage = npc.damage;
          var skillMod = 0.8 + U.rng() * 0.4;
          damage = Math.round(damage * skillMod);
          var actual = Game.Player.takeDamage(damage, npc);
          npc.attackTimer = 0.6 + U.rng() * 0.5;

          if (actual > 10 && U.rng() < 0.2) pState.bleeding += 1.5;
          if (npc.job !== 'guard' && npc.faction !== 'bandits') {
            Game.Law.reportCrime('assault', npc, npc);
          }

          // After attacking, back off or press advantage
          if (U.rng() < 0.4) {
            npc._combatPhase = 'retreat';
            npc._phaseTimer = 0.5 + U.rng() * 0.5;
          } else {
            npc._combatPhase = 'circle';
            npc._phaseTimer = 0.8 + U.rng();
          }
        }
        if (npc._phaseTimer <= 0) {
          npc._combatPhase = 'circle';
          npc._phaseTimer = 1;
        }
        break;

      case 'feint':
        // Fake approach then pull back, wait for player to drop guard
        if (npc._phaseTimer > 0.3) {
          moveToward(npc, px, py, dt, 1.4);
        } else {
          // Pull back
          var retreatAngle = angleToPlayer + Math.PI;
          moveToward(npc, npc.x + Math.cos(retreatAngle) * 30, npc.y + Math.sin(retreatAngle) * 30, dt, 1.0);
        }
        npc.blocking = false;
        if (npc._phaseTimer <= 0) {
          npc._combatPhase = 'attack'; // now actually strike
          npc._phaseTimer = 0.3;
        }
        break;

      case 'dodge':
        // Quick sidestep
        var dodgeAngle = angleToPlayer + (Math.PI / 2) * npc._circleDir;
        moveToward(npc, npc.x + Math.cos(dodgeAngle) * 60, npc.y + Math.sin(dodgeAngle) * 60, dt, 2.0);
        npc.blocking = false;
        if (npc._phaseTimer <= 0) {
          npc._combatPhase = 'attack';
          npc._phaseTimer = 0.2;
        }
        break;

      case 'retreat':
        // Back away while blocking
        var retAngle = angleToPlayer + Math.PI;
        moveToward(npc, npc.x + Math.cos(retAngle) * 80, npc.y + Math.sin(retAngle) * 80, dt, 0.9);
        npc.blocking = true;
        if (npc._phaseTimer <= 0) {
          npc._combatPhase = dist > 80 ? 'approach' : 'circle';
          npc._phaseTimer = 1 + U.rng();
        }
        break;

      default:
        npc._combatPhase = 'approach';
        npc._phaseTimer = 0;
    }

    // Group flanking: if allies present, try to position on opposite side
    if (allyCount > 0 && npc._combatPhase !== 'dodge' && npc._combatPhase !== 'retreat') {
      var avgAllyAngle = 0;
      var counted = 0;
      for (var ai = 0; ai < allies.length; ai++) {
        var al = allies[ai];
        if (al.id !== npc.id && al.alive && al.state === STATE.FIGHT) {
          avgAllyAngle += U.angle(px, py, al.x, al.y);
          counted++;
        }
      }
      if (counted > 0) {
        avgAllyAngle /= counted;
        // Position on opposite side from allies
        var flankAngle = avgAllyAngle + Math.PI;
        var idealX = px + Math.cos(flankAngle) * 45;
        var idealY = py + Math.sin(flankAngle) * 45;
        // Blend toward flanking position
        npc.x += (idealX - npc.x) * dt * 0.8;
        npc.y += (idealY - npc.y) * dt * 0.8;
      }
    }

    // Combat barks
    if (npc.barkTimer <= 0 && U.rng() < 0.003) {
      var cBarks = npc.faction === 'bandits' ?
        ['Your gold is mine!', 'Stand still!', 'You picked the wrong fight!', 'Ha!'] :
        npc.job === 'guard' ?
        ['Halt, criminal!', 'You will not escape!', 'In the name of the King!', 'Surrender!'] :
        ['Leave me alone!', 'Help!', 'Stay back!', 'Why are you doing this?'];
      setBark(npc, U.pick(cBarks));
    }
  }

  function updateFleeAI(npc, dt, px, py) {
    var angle = U.angle(px, py, npc.x, npc.y);
    var fleeX = npc.x + Math.cos(angle) * 200;
    var fleeY = npc.y + Math.sin(angle) * 200;
    moveToward(npc, fleeX, fleeY, dt, 1.5);

    if (U.dist(npc.x, npc.y, px, py) > 400) {
      npc.state = STATE.IDLE;
    }
  }

  function updateInvestigateAI(npc, dt, px, py) {
    if (npc.hasTarget) {
      moveToward(npc, npc.targetX, npc.targetY, dt, 0.8);
      if (U.distSq(npc.x, npc.y, npc.targetX, npc.targetY) < 400) {
        npc.state = STATE.IDLE;
        npc.hasTarget = false;
      }
    } else {
      npc.state = STATE.IDLE;
    }
  }

  function moveToward(npc, tx, ty, dt, speedMod) {
    var dx = tx - npc.x;
    var dy = ty - npc.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      npc.vx = 0; npc.vy = 0;
      return;
    }
    var spd = npc.speed * (speedMod || 1.0);
    var nx = dx / dist, ny = dy / dist;
    var moveX = nx * spd * dt;
    var moveY = ny * spd * dt;

    // Simple collision
    var HB = 8;
    var testX = npc.x + moveX;
    var testY = npc.y + moveY;
    var tileX = Math.floor((testX + (moveX > 0 ? HB : -HB)) / TS);
    var tileY = Math.floor((testY + (moveY > 0 ? HB : -HB)) / TS);

    if (!W.isSolid(tileX, Math.floor(npc.y / TS)) && !W.hasTree(tileX, Math.floor(npc.y / TS))) {
      npc.x = testX;
    } else {
      // Try perpendicular
      npc.x += (dy > 0 ? 1 : -1) * spd * dt * 0.3;
    }
    if (!W.isSolid(Math.floor(npc.x / TS), tileY) && !W.hasTree(Math.floor(npc.x / TS), tileY)) {
      npc.y = testY;
    } else {
      npc.y += (dx > 0 ? 1 : -1) * spd * dt * 0.3;
    }

    // Clamp to world
    npc.x = U.clamp(npc.x, TS, (W.WORLD_TILES - 1) * TS);
    npc.y = U.clamp(npc.y, TS, (W.WORLD_TILES - 1) * TS);

    // Update facing
    if (Math.abs(dx) > Math.abs(dy)) {
      npc.facing = dx > 0 ? 'E' : 'W';
    } else {
      npc.facing = dy > 0 ? 'S' : 'N';
    }
    npc.vx = moveX; npc.vy = moveY;
  }

  function setBark(npc, text) {
    npc.bark = text;
    npc.barkTimer = 4;
  }

  function setSpeech(npc, text, duration) {
    npc.speechBubble = text;
    npc.speechTimer = duration || 3;
  }

  function getWorkBarks(job) {
    switch (job) {
      case 'farmer': return ['Another long day...', 'Rain would be welcome.', 'The soil is good this year.', 'Back aches something fierce.'];
      case 'guard': return ['Stay out of trouble.', 'Keep moving.', 'All quiet.', 'Nothing to report.'];
      case 'blacksmith': return ['*clang clang*', 'Fine steel, this.', 'Need more iron...', 'This edge will hold.'];
      case 'merchant': return ['Best prices in town!', 'Come, see my wares!', 'Fair deals here!', 'Quality goods!'];
      case 'tavernKeeper': return ['What can I get you?', 'Ale is fresh today.', 'Welcome, friend.', 'Take a seat.'];
      case 'woodcutter': return ['Timber!', 'Good oak here.', 'One more tree...', 'These woods are deep.'];
      default: return ['...', 'Hmm.', '*sigh*', 'What a day.'];
    }
  }

  function getSocialBarks(npc) {
    var barks = ['Have you heard the news?', 'Weather is turning.', 'Times are tough.', 'Stay safe out there.'];
    // Add rumor-based barks
    if (Game.Law && Game.Law.getRecentCrimes) {
      var crimes = Game.Law.getRecentCrimes();
      if (crimes.length > 0) {
        barks.push('Did you hear about the trouble?');
        barks.push('Someone committed a crime recently...');
        barks.push('The guards are on alert.');
      }
    }
    if (npc.faction === 'bandits') {
      barks = ['When is the next raid?', 'I need more coin.', 'Lothar says we move at dawn.', 'This forest hides us well.'];
    }
    return barks;
  }

  function getAwarenessBarks(npc, hour) {
    var barks = [];
    if (hour >= 20 || hour < 5) {
      barks.push('Dark out tonight.', 'I should head home.', 'Strange hour to be about.');
    } else if (hour < 8) {
      barks.push('Early riser, eh?', 'Morning.', 'Dawn breaks.');
    } else {
      barks.push('Fine day.', 'Greetings.', 'Watch yourself.');
    }
    var pClass = Game.Player.getApparentClass();
    if (pClass === 'peasant' && npc.socialClass >= 3) {
      barks.push('What brings a peasant here?', 'Mind your place.');
    }
    var pRep = Game.Player.getState().reputation.global;
    if (pRep < -20) {
      barks.push('I know your kind.', 'Keep your distance.', 'Trouble follows you.');
    } else if (pRep > 20) {
      barks.push('Good to see you.', 'You are well-known around here.', 'A friend of the people.');
    }
    return barks.length > 0 ? barks : ['...'];
  }

  function getNearPlayer(radius) {
    var p = Game.Player.getState();
    return spatialHash.query(p.x, p.y, radius);
  }

  function getNearest(x, y, radius) {
    return spatialHash.query(x, y, radius);
  }

  function takeDamage(npc, amount, fromPlayer) {
    if (npc.hitCooldown > 0) return 0;
    var actual = amount;
    if (npc.blocking) {
      actual *= 0.25;
    }
    actual = Math.max(1, Math.round(actual * (1 - npc.armor * 0.01)));
    npc.health -= actual;
    npc.hitCooldown = 0.3;

    // Bleeding
    if (actual > 10 && U.rng() < 0.25) {
      npc.bleeding += 2;
    }

    if (npc.health <= 0) {
      npc.health = 0;
      npc.alive = false;
      npc.state = STATE.DEAD;
      if (fromPlayer) {
        Game.Player.getState().killCount++;
      }
    } else {
      // React
      if (fromPlayer) {
        npc.playerRelation -= 30;
        if (npc.state !== STATE.FIGHT && npc.state !== STATE.FLEE) {
          if (npc.personality === 'cowardly' || npc.health < npc.maxHealth * 0.3) {
            npc.state = STATE.FLEE;
          } else {
            npc.state = STATE.FIGHT;
            npc.combatTarget = 'player';
          }
        }
        // Alert nearby NPCs
        var nearby = spatialHash.query(npc.x, npc.y, 200);
        for (var i = 0; i < nearby.length; i++) {
          var n = nearby[i];
          if (n.id !== npc.id && n.alive) {
            n.alarmed = true;
            n.alarmTimer = 10;
            if (n.job === 'guard') {
              n.state = STATE.FIGHT;
              n.combatTarget = 'player';
              setBark(n, 'To arms! Defend the people!');
            } else if (n.personality !== 'hostile' && n.faction !== 'bandits') {
              n.state = STATE.FLEE;
              setBark(n, 'Help! Murder!');
            }
          }
        }
      }
    }
    return actual;
  }

  function addMemory(npc, event) {
    npc.memory.push({ event: event, time: Game.time || 0 });
    if (npc.memory.length > 10) npc.memory.shift();
  }

  function getNPCs() { return npcs; }
  function getByFaction(faction) {
    return npcs.filter(function (n) { return n.faction === faction && n.alive; });
  }

  function getSerializable() {
    return npcs.map(function (n) {
      return {
        id: n.id, x: n.x, y: n.y, health: n.health, alive: n.alive,
        state: n.state, playerRelation: n.playerRelation, memory: n.memory,
        bleeding: n.bleeding, bounty: n.bounty || 0
      };
    });
  }

  function loadState(data) {
    for (var i = 0; i < data.length && i < npcs.length; i++) {
      var d = data[i];
      var n = npcs[i];
      n.x = d.x; n.y = d.y; n.health = d.health; n.alive = d.alive;
      n.state = d.state; n.playerRelation = d.playerRelation;
      n.memory = d.memory || []; n.bleeding = d.bleeding || 0;
    }
  }

  return {
    STATE: STATE,
    init: init, update: update,
    createNPC: createNPC, getNPCs: getNPCs, getNearPlayer: getNearPlayer,
    getNearest: getNearest, takeDamage: takeDamage,
    addMemory: addMemory, getByFaction: getByFaction,
    setBark: setBark, setSpeech: setSpeech,
    getSerializable: getSerializable, loadState: loadState
  };
})();
