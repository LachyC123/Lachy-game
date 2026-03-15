var Game = Game || {};

Game.NPC = (function () {
  var U = Game.Utils;
  var W, TS;
  var npcs = [];
  var spatialHash;
  var NPC_UPDATE_RANGE = 600;

  // ─── States ────────────────────────────────────────────────────────────────
  var STATE = {
    IDLE: 'idle', TRAVEL: 'travel', WORK: 'work', SOCIALIZE: 'socialize',
    SLEEP: 'sleep', FLEE: 'flee', FIGHT: 'fight', INVESTIGATE: 'investigate',
    PATROL: 'patrol', DEAD: 'dead', ARRESTED: 'arrested',
    WARN: 'warn',       // Guard verbally warning player
    PURSUE: 'pursue',   // Guard/NPC actively chasing player
    SCARED: 'scared',   // Cowering / panicking
    MOURN: 'mourn'      // Reacting to a nearby death
  };

  // ─── Job Schedules ─────────────────────────────────────────────────────────
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
        { start: 18, end: 22, state: STATE.SOCIALIZE },
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
    },
    carpenter: {
      label: 'Carpenter',
      schedule: [
        { start: 6, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 6, state: STATE.SLEEP }
      ]
    },
    mason: {
      label: 'Mason',
      schedule: [
        { start: 6, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 17, state: STATE.WORK },
        { start: 17, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 6, state: STATE.SLEEP }
      ]
    },
    fisherman: {
      label: 'Fisherman',
      schedule: [
        { start: 4, end: 5, state: STATE.TRAVEL, target: 'work' },
        { start: 5, end: 11, state: STATE.WORK },
        { start: 11, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 17, state: STATE.WORK },
        { start: 17, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 4, state: STATE.SLEEP }
      ]
    },
    baker: {
      label: 'Baker',
      schedule: [
        { start: 4, end: 5, state: STATE.TRAVEL, target: 'work' },
        { start: 5, end: 12, state: STATE.WORK },
        { start: 12, end: 14, state: STATE.SOCIALIZE },
        { start: 14, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.IDLE },
        { start: 21, end: 4, state: STATE.SLEEP }
      ]
    },
    tailor: {
      label: 'Tailor',
      schedule: [
        { start: 7, end: 8, state: STATE.TRAVEL, target: 'work' },
        { start: 8, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 7, state: STATE.SLEEP }
      ]
    },
    butcher: {
      label: 'Butcher',
      schedule: [
        { start: 6, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 13, state: STATE.WORK },
        { start: 13, end: 14, state: STATE.SOCIALIZE },
        { start: 14, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.IDLE },
        { start: 21, end: 6, state: STATE.SLEEP }
      ]
    },
    cooper: {
      label: 'Cooper',
      schedule: [
        { start: 6, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 17, state: STATE.WORK },
        { start: 17, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 6, state: STATE.SLEEP }
      ]
    },
    potter: {
      label: 'Potter',
      schedule: [
        { start: 7, end: 8, state: STATE.TRAVEL, target: 'work' },
        { start: 8, end: 12, state: STATE.WORK },
        { start: 12, end: 13, state: STATE.SOCIALIZE },
        { start: 13, end: 18, state: STATE.WORK },
        { start: 18, end: 21, state: STATE.IDLE },
        { start: 21, end: 7, state: STATE.SLEEP }
      ]
    },
    healer: {
      label: 'Healer',
      schedule: [
        { start: 6, end: 7, state: STATE.TRAVEL, target: 'work' },
        { start: 7, end: 12, state: STATE.WORK },
        { start: 12, end: 14, state: STATE.SOCIALIZE },
        { start: 14, end: 19, state: STATE.WORK },
        { start: 19, end: 22, state: STATE.IDLE },
        { start: 22, end: 6, state: STATE.SLEEP }
      ]
    },
    hunter: {
      label: 'Hunter',
      schedule: [
        { start: 4, end: 6, state: STATE.TRAVEL, target: 'work' },
        { start: 6, end: 14, state: STATE.WORK },
        { start: 14, end: 16, state: STATE.TRAVEL, target: 'home' },
        { start: 16, end: 20, state: STATE.SOCIALIZE },
        { start: 20, end: 4, state: STATE.SLEEP }
      ]
    },
    miner: {
      label: 'Miner',
      schedule: [
        { start: 5, end: 6, state: STATE.TRAVEL, target: 'work' },
        { start: 6, end: 15, state: STATE.WORK },
        { start: 15, end: 17, state: STATE.TRAVEL, target: 'home' },
        { start: 17, end: 21, state: STATE.SOCIALIZE },
        { start: 21, end: 5, state: STATE.SLEEP }
      ]
    }
  };

  var PERSONALITIES = ['brave', 'cowardly', 'friendly', 'hostile', 'greedy', 'honest', 'suspicious', 'calm'];
  var SOCIAL_CLASSES = { king: 5, noble: 4, guard: 3, merchant: 3, blacksmith: 2, tavernKeeper: 2, healer: 2, tailor: 2, baker: 2, butcher: 2, farmer: 1, villager: 1, woodcutter: 1, carpenter: 1, mason: 1, fisherman: 1, cooper: 1, potter: 1, hunter: 1, miner: 1, bandit: 0 };
  var LIFESTYLES = ['family', 'ambitious', 'devout', 'frugal', 'hedonist', 'outdoorsy', 'scholarly', 'community'];
  var RELATIONSHIP_TYPES = ['family', 'friend', 'rival', 'coworker', 'partner'];

  // ─── NPC Factory ───────────────────────────────────────────────────────────
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
      scheduledTarget: 'home',
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
      // Guard arrest system
      arrestDemandActive: false,
      arrestDemandTimer: 0,
      pursuitTimer: 0,
      lastKnownPlayerX: -1,
      lastKnownPlayerY: -1,
      warnTimer: 0,
      // Relationships
      playerRelation: opts.playerRelation || 0,
      faction: opts.faction || 'civilian',
      lifestyle: opts.lifestyle || pickLifestyle(opts.job),
      relationships: opts.relationships || [],
      // Memory & emotions
      memory: [],
      gossipMemory: [],       // hearsay from other NPCs
      lastSawPlayer: -1,
      lastSawCrime: -1,
      alarmed: false,
      alarmTimer: 0,
      // Emotional state
      emotion: 'neutral',       // neutral, happy, scared, angry, suspicious, disgusted
      emotionTimer: 0,
      emotionIntensity: 0,
      fearSource: null,
      // Group behavior
      groupRole: 'solo',        // solo, leader, follower
      panicSpreadCooldown: 0,
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
      // Location
      currentLocation: opts.location || 'wilderness',
      // Activity & immersion
      activityAnim: 0,
      workTaskTimer: 0,
      workTaskCooldown: 0,
      workAnchorX: 0,
      workAnchorY: 0,
      alertIcon: '',
      alertIconTimer: 0,
      greetedPlayer: false,
      greetCooldown: 0,
      timesMetPlayer: 0,
      lastPlayerDist: 999,
      // Shelter seeking (weather)
      seekingShelter: false,
      shelterX: 0,
      shelterY: 0,
      // Ambient variety
      idleActivityTimer: U.randFloat(0, 8),
      idleActivity: 'stand',    // stand, look_around, stretch, sit, hum
      mourningTimer: 0
    };
    npcs.push(npc);
    return npc;
  }

  function setEmotion(npc, emotion, intensity, duration) {
    if (!npc) return;
    npc.emotion = emotion;
    npc.emotionIntensity = Math.min(1, intensity);
    npc.emotionTimer = duration;
  }

  // ─── Guard Backup System ───────────────────────────────────────────────────
  function callGuardBackup(callingGuard, killOnSight) {
    var px = Game.Player.getState().x;
    var py = Game.Player.getState().y;
    var nearby = spatialHash.query(callingGuard.x, callingGuard.y, 350);
    for (var i = 0; i < nearby.length; i++) {
      var n = nearby[i];
      if (n.id === callingGuard.id || !n.alive || n.job !== 'guard') continue;
      if (n.state === STATE.FIGHT || n.state === STATE.PURSUE) continue;
      if (killOnSight) {
        n.state = STATE.FIGHT;
        n.combatTarget = 'player';
        setBark(n, Game.Law.getKosCallout());
      } else {
        n.state = STATE.PURSUE;
        n.lastKnownPlayerX = px;
        n.lastKnownPlayerY = py;
        n.pursuitTimer = 30;
        n.arrestDemandActive = true;
        n.arrestDemandTimer = 5;
        if (n.barkTimer <= 0) setBark(n, U.pick(['Move to intercept!', 'Block the exits!', 'Do not let them escape!', 'With me!']));
      }
    }
  }

  // ─── Color / Label Helpers ─────────────────────────────────────────────────
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
      case 'carpenter': return '#7a5a2f';
      case 'mason': return '#7a7a78';
      case 'fisherman': return '#3f5f7a';
      case 'baker': return '#8a6b3f';
      case 'tailor': return '#6a3f7a';
      case 'butcher': return '#7a3f3f';
      case 'cooper': return '#6a4c2a';
      case 'potter': return '#8a5b45';
      case 'healer': return '#2f7a6d';
      case 'hunter': return '#4a5f2c';
      case 'miner': return '#565656';
      default: return '#5a5040';
    }
  }

  function getJobLabel(job) {
    return JOBS[job] ? JOBS[job].label : (job ? job.charAt(0).toUpperCase() + job.slice(1) : 'Commoner');
  }

  function pickLifestyle(job) {
    if (job === 'bandit') return U.pick(['hedonist', 'ambitious', 'outdoorsy']);
    if (job === 'king' || job === 'noble') return U.pick(['ambitious', 'devout', 'hedonist']);
    if (job === 'guard') return U.pick(['community', 'devout', 'family']);
    if (job === 'healer') return U.pick(['scholarly', 'community', 'devout']);
    if (job === 'hunter' || job === 'woodcutter' || job === 'fisherman') return U.pick(['outdoorsy', 'frugal', 'family']);
    if (job === 'carpenter' || job === 'mason' || job === 'cooper') return U.pick(['family', 'frugal', 'community']);
    if (job === 'merchant' || job === 'tailor' || job === 'baker') return U.pick(['ambitious', 'frugal', 'community']);
    if (job === 'butcher' || job === 'potter') return U.pick(['community', 'frugal', 'family']);
    return U.pick(LIFESTYLES);
  }

  // ─── Relationships ─────────────────────────────────────────────────────────
  function buildSocialRelationships() {
    for (var i = 0; i < npcs.length; i++) npcs[i].relationships = [];

    for (var i = 0; i < npcs.length; i++) {
      var a = npcs[i];
      var candidates = npcs.filter(function (n) {
        return n.id !== a.id && (n.faction === a.faction || n.currentLocation === a.currentLocation);
      });

      var relCount = Math.min(candidates.length, U.randInt(1, 4));
      for (var r = 0; r < relCount; r++) {
        if (candidates.length === 0) break;
        var b = candidates.splice(U.randInt(0, candidates.length - 1), 1)[0];
        var type = U.pick(RELATIONSHIP_TYPES);
        if (a.job === b.job) type = 'coworker';
        if (a.age > 45 && b.age < 25 && U.rng() < 0.2) type = 'family';

        var affinity = U.randInt(-35, 35);
        if (type === 'friend' || type === 'family' || type === 'partner') affinity = U.randInt(15, 60);
        if (type === 'rival') affinity = U.randInt(-60, -15);

        a.relationships.push({ withId: b.id, type: type, affinity: affinity });
        if (!b.relationships.some(function (br) { return br.withId === a.id; })) {
          b.relationships.push({ withId: a.id, type: type, affinity: affinity + U.randInt(-8, 8) });
        }
      }
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    W = Game.World;
    TS = W.TILE_SIZE;
    npcs = [];
    spatialHash = new U.SpatialHash(128);
    U.resetNames();
    spawnAllNPCs();
    assignResidentialHomes();
    buildSocialRelationships();
  }

  // ─── NPC Spawning ─────────────────────────────────────────────────────────
  function spawnAllNPCs() {
    var locs = W.getLocations();

    // === ASHFORD TOWN ===
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

    // Guards - more varied patrol routes
    var guardPatrols = [
      [{ x: 110, y: 128 }, { x: 128, y: 128 }, { x: 146, y: 128 }, { x: 128, y: 128 }],
      [{ x: 128, y: 110 }, { x: 128, y: 128 }, { x: 128, y: 146 }, { x: 128, y: 128 }],
      [{ x: 110, y: 110 }, { x: 146, y: 110 }, { x: 146, y: 146 }, { x: 110, y: 146 }],
      [{ x: 128, y: 148 }, { x: 130, y: 150 }, { x: 126, y: 150 }, { x: 128, y: 148 }],
      [{ x: 108, y: 128 }, { x: 106, y: 130 }, { x: 108, y: 132 }, { x: 110, y: 130 }],
      [{ x: 120, y: 118 }, { x: 135, y: 118 }, { x: 135, y: 130 }, { x: 120, y: 130 }],
      [{ x: 113, y: 138 }, { x: 120, y: 138 }, { x: 120, y: 144 }, { x: 113, y: 144 }],
      [{ x: 140, y: 135 }, { x: 148, y: 135 }, { x: 148, y: 142 }, { x: 140, y: 142 }]
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

    createNPC({
      name: { first: 'Gerda', last: 'Holden', full: 'Gerda Holden' },
      job: 'tavernKeeper', gender: 'female', age: 45,
      x: 116 * TS, y: 127 * TS,
      home: { x: 116 * TS, y: 127 * TS },
      work: { x: 116 * TS, y: 127 * TS },
      faction: 'civilian', personality: 'friendly',
      playerRelation: 5, location: 'ashford',
      inventory: [
        { id: 'ale', name: 'Ale', type: 'food', value: 3, healAmount: 5, satiation: 8, hydration: 20 },
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 },
        { id: 'stew', name: 'Hearty Stew', type: 'food', value: 5, healAmount: 20, satiation: 35, hydration: 10 }
      ]
    });

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

    createNPC({
      name: { first: 'Edwin', last: 'Cale', full: 'Edwin Cale' },
      job: 'carpenter', gender: 'male', age: 34,
      x: 132 * TS, y: 126 * TS,
      home: { x: 132 * TS, y: 131 * TS },
      work: { x: 132 * TS, y: 126 * TS },
      faction: 'civilian', personality: 'honest',
      playerRelation: 2, location: 'ashford'
    });

    createNPC({
      name: { first: 'Vera', last: 'Needle', full: 'Vera Needle' },
      job: 'tailor', gender: 'female', age: 31,
      x: 120 * TS, y: 126 * TS,
      home: { x: 120 * TS, y: 131 * TS },
      work: { x: 120 * TS, y: 126 * TS },
      faction: 'civilian', personality: 'calm', location: 'ashford'
    });
    createNPC({
      name: { first: 'Brom', last: 'Malt', full: 'Brom Malt' },
      job: 'baker', gender: 'male', age: 44,
      x: 118 * TS, y: 129 * TS,
      home: { x: 118 * TS, y: 133 * TS },
      work: { x: 118 * TS, y: 129 * TS },
      faction: 'civilian', personality: 'friendly', location: 'ashford'
    });
    createNPC({
      name: { first: 'Hilda', last: 'Reeve', full: 'Hilda Reeve' },
      job: 'butcher', gender: 'female', age: 39,
      x: 126 * TS, y: 124 * TS,
      home: { x: 126 * TS, y: 131 * TS },
      work: { x: 126 * TS, y: 124 * TS },
      faction: 'civilian', personality: 'honest', location: 'ashford'
    });
    createNPC({
      name: { first: 'Tomas', last: 'Kiln', full: 'Tomas Kiln' },
      job: 'potter', gender: 'male', age: 36,
      x: 123 * TS, y: 132 * TS,
      home: { x: 123 * TS, y: 137 * TS },
      work: { x: 123 * TS, y: 132 * TS },
      faction: 'civilian', personality: 'calm', location: 'ashford'
    });
    createNPC({
      name: { first: 'Garrick', last: 'Stonehand', full: 'Garrick Stonehand' },
      job: 'mason', gender: 'male', age: 42,
      x: 140 * TS, y: 124 * TS,
      home: { x: 140 * TS, y: 131 * TS },
      work: { x: 140 * TS, y: 124 * TS },
      faction: 'civilian', personality: 'brave', location: 'ashford'
    });

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
          { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 }
        ]
      });
    }

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
    createNPC({
      name: { first: 'Edmund', last: 'Ashford', full: 'Edmund Ashford' },
      job: 'villager', gender: 'male', age: 62,
      x: mhx * TS, y: mhy * TS,
      home: { x: (mhx - 5) * TS, y: (mhy - 3) * TS },
      work: { x: mhx * TS, y: mhy * TS },
      faction: 'millhaven', personality: 'friendly',
      playerRelation: 10, location: 'millhaven'
    });

    for (var i = 0; i < 3; i++) {
      createNPC({
        job: 'farmer', age: U.randInt(20, 50),
        x: (mhx - 4 + i * 4) * TS, y: (mhy + 2) * TS,
        home: { x: (mhx - 5 + i * 8) * TS, y: (mhy - 3 + (i > 1 ? 6 : 0)) * TS },
        work: { x: (55 + i * 8) * TS, y: 178 * TS },
        faction: 'millhaven', location: 'millhaven'
      });
    }

    createNPC({
      name: { first: 'Maren', last: 'Cooper', full: 'Maren Cooper' },
      job: 'merchant', gender: 'female', age: 34,
      x: (mhx + 6) * TS, y: (mhy + 1) * TS,
      home: { x: (mhx + 5) * TS, y: (mhy + 4) * TS },
      work: { x: (mhx + 6) * TS, y: (mhy + 1) * TS },
      faction: 'millhaven', personality: 'friendly',
      playerRelation: 5, location: 'millhaven',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 },
        { id: 'grain', name: 'Sack of Grain', type: 'trade', value: 8 },
        { id: 'knife', name: 'Hunting Knife', type: 'weapon', damage: 8, speed: 1.2, value: 10 },
        { id: 'bandage', name: 'Linen Bandage', type: 'healing', value: 5, healAmount: 30 }
      ]
    });

    createNPC({
      name: { first: 'Sera', last: 'Willow', full: 'Sera Willow' },
      job: 'healer', gender: 'female', age: 29,
      x: (mhx + 2) * TS, y: (mhy + 2) * TS,
      home: { x: (mhx + 1) * TS, y: (mhy + 5) * TS },
      work: { x: (mhx + 2) * TS, y: (mhy + 2) * TS },
      faction: 'millhaven', location: 'millhaven', personality: 'friendly'
    });
    createNPC({
      name: { first: 'Jory', last: 'Barrel', full: 'Jory Barrel' },
      job: 'cooper', gender: 'male', age: 40,
      x: (mhx + 4) * TS, y: (mhy + 3) * TS,
      home: { x: (mhx + 3) * TS, y: (mhy + 6) * TS },
      work: { x: (mhx + 4) * TS, y: (mhy + 3) * TS },
      faction: 'millhaven', location: 'millhaven', personality: 'honest'
    });
    createNPC({
      name: { first: 'Mira', last: 'Reed', full: 'Mira Reed' },
      job: 'fisherman', gender: 'female', age: 28,
      x: (mhx - 1) * TS, y: (mhy + 1) * TS,
      home: { x: (mhx - 2) * TS, y: (mhy + 4) * TS },
      work: { x: 63 * TS, y: 184 * TS },
      faction: 'millhaven', location: 'millhaven', personality: 'friendly'
    });
    for (var i = 0; i < 2; i++) {
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
    createNPC({
      name: { first: 'Henrik', last: 'Sawyer', full: 'Henrik Sawyer' },
      job: 'woodcutter', gender: 'male', age: 35,
      x: tfx * TS, y: tfy * TS,
      home: { x: (tfx - 5) * TS, y: (tfy - 3) * TS },
      work: { x: 45 * TS, y: 40 * TS },
      faction: 'thornfield', personality: 'brave', location: 'thornfield'
    });

    createNPC({
      name: { first: 'Oswin', last: 'Thatcher', full: 'Oswin Thatcher' },
      job: 'villager', gender: 'male', age: 58,
      x: (tfx + 1) * TS, y: (tfy + 1) * TS,
      home: { x: (tfx + 4) * TS, y: (tfy - 3) * TS },
      work: { x: tfx * TS, y: tfy * TS },
      faction: 'thornfield', personality: 'honest',
      playerRelation: 0, location: 'thornfield'
    });

    createNPC({
      name: { first: 'Dain', last: 'Rowe', full: 'Dain Rowe' },
      job: 'hunter', gender: 'male', age: 31,
      x: (tfx - 4) * TS, y: (tfy + 3) * TS,
      home: { x: (tfx - 6) * TS, y: (tfy + 4) * TS },
      work: { x: 42 * TS, y: 47 * TS },
      faction: 'thornfield', location: 'thornfield'
    });
    createNPC({
      name: { first: 'Bran', last: 'Coal', full: 'Bran Coal' },
      job: 'miner', gender: 'male', age: 41,
      x: (tfx + 3) * TS, y: (tfy + 3) * TS,
      home: { x: (tfx + 5) * TS, y: (tfy + 5) * TS },
      work: { x: 74 * TS, y: 74 * TS },
      faction: 'thornfield', location: 'thornfield', personality: 'calm'
    });
    createNPC({
      job: 'villager', age: U.randInt(18, 50),
      x: (tfx + 1) * TS, y: (tfy + 2) * TS,
      home: { x: (tfx + 2) * TS, y: (tfy + 4) * TS },
      work: { x: (tfx + 1) * TS, y: tfy * TS },
      faction: 'thornfield', location: 'thornfield'
    });

    createNPC({
      job: 'merchant', age: U.randInt(25, 45),
      x: (tfx + 6) * TS, y: (tfy + 1) * TS,
      home: { x: (tfx + 5) * TS, y: (tfy + 4) * TS },
      work: { x: (tfx + 6) * TS, y: (tfy + 1) * TS },
      faction: 'thornfield', location: 'thornfield',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 },
        { id: 'wood', name: 'Bundle of Wood', type: 'trade', value: 5 },
        { id: 'hatchet', name: 'Hatchet', type: 'weapon', damage: 10, speed: 1.0, value: 15 }
      ]
    });

    // === BANDITS ===
    var bx = 200, by = 80;
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

    // === WANDERING TRADERS ===
    createNPC({
      name: { first: 'Ingram', last: 'Brennan', full: 'Ingram Brennan' },
      job: 'merchant', gender: 'male', age: 42,
      x: 90 * TS, y: 160 * TS,
      home: { x: 66 * TS, y: 190 * TS },
      work: { x: 128 * TS, y: 128 * TS },
      faction: 'civilian', personality: 'friendly',
      speed: 55, playerRelation: 0, location: 'wilderness',
      inventory: [
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 },
        { id: 'wine', name: 'Wine', type: 'food', value: 8, healAmount: 15, satiation: 10, hydration: 15 },
        { id: 'cloth', name: 'Fine Cloth', type: 'trade', value: 18 },
        { id: 'spice', name: 'Spices', type: 'trade', value: 25 }
      ]
    });
    createNPC({
      name: { first: 'Petra', last: 'Lang', full: 'Petra Lang' },
      job: 'merchant', gender: 'female', age: 35,
      x: 80 * TS, y: 90 * TS,
      home: { x: 66 * TS, y: 64 * TS },
      work: { x: 128 * TS, y: 128 * TS },
      faction: 'civilian', personality: 'honest',
      speed: 50, playerRelation: 0, location: 'wilderness',
      inventory: [
        { id: 'wood', name: 'Bundle of Wood', type: 'trade', value: 5 },
        { id: 'herbs', name: 'Healing Herbs', type: 'healing', value: 8, healAmount: 25, stopsBleeding: true },
        { id: 'pelts', name: 'Animal Pelts', type: 'trade', value: 15 },
        { id: 'bread', name: 'Bread', type: 'food', value: 2, healAmount: 8, satiation: 22, hydration: 5 }
      ]
    });
  }

  // ─── Residential Assignment ────────────────────────────────────────────────
  function getScheduleTargetPos(npc) {
    if (npc.scheduledTarget === 'work') return npc.work;
    return npc.home;
  }

  function assignResidentialHomes() {
    var buildings = W.getBuildings ? W.getBuildings() : [];
    if (!buildings || buildings.length === 0) return;

    function centerPx(b) {
      return { x: (b.x + b.w * 0.5) * TS, y: (b.y + b.h * 0.5) * TS };
    }

    var centers = {
      ashford: { x: 128 * TS, y: 128 * TS },
      millhaven: { x: 66 * TS, y: 190 * TS },
      thornfield: { x: 66 * TS, y: 64 * TS },
      banditCamp: { x: 200 * TS, y: 80 * TS }
    };

    function nearestSettlement(x, y) {
      var best = 'ashford', bestD = Infinity;
      for (var k in centers) {
        var c = centers[k];
        var d = U.distSq(x, y, c.x, c.y);
        if (d < bestD) { bestD = d; best = k; }
      }
      return best;
    }

    var housesBySettlement = { ashford: [], millhaven: [], thornfield: [] };
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (b.type !== 'house' && b.type !== 'noble_house') continue;
      var c = centerPx(b);
      var st = nearestSettlement(c.x, c.y);
      if (!housesBySettlement[st]) housesBySettlement[st] = [];
      housesBySettlement[st].push({ b: b, c: c, occ: 0 });
    }

    for (var i = 0; i < npcs.length; i++) {
      var npc = npcs[i];
      if (!npc.alive) continue;
      if (npc.faction === 'bandits' || npc.job === 'king') continue;

      var st = npc.location || nearestSettlement(npc.home.x, npc.home.y);
      var candidates = housesBySettlement[st] || [];
      if (candidates.length === 0) continue;

      var best = null, bestScore = Infinity;
      for (var j = 0; j < candidates.length; j++) {
        var h = candidates[j];
        var cap = h.b.type === 'noble_house' ? 3 : 2;
        if (h.occ >= cap && npc.job !== 'noble') continue;
        var score = U.distSq(npc.home.x, npc.home.y, h.c.x, h.c.y) + h.occ * 6000;
        if (npc.job === 'noble' && h.b.type === 'noble_house') score *= 0.6;
        if (score < bestScore) { bestScore = score; best = h; }
      }

      if (best) { npc.home = { x: best.c.x, y: best.c.y }; best.occ++; }
    }
  }

  // ─── Main Update Loop ──────────────────────────────────────────────────────
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

      if (distToPlayer < NPC_UPDATE_RANGE) {
        updateNPCAI(npc, dt, hour, px, py, distToPlayer);
      } else if (distToPlayer < NPC_UPDATE_RANGE * 3) {
        updateSchedule(npc, hour);
        if (npc.scheduledState === STATE.SLEEP) {
          npc.x = U.lerp(npc.x, npc.home.x, 0.01);
          npc.y = U.lerp(npc.y, npc.home.y, 0.01);
        } else if (npc.scheduledState === STATE.WORK || npc.scheduledState === STATE.TRAVEL) {
          var schedTarget = getScheduleTargetPos(npc);
          npc.x = U.lerp(npc.x, schedTarget.x, 0.01);
          npc.y = U.lerp(npc.y, schedTarget.y, 0.01);
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
          // Trigger mourning in nearby NPCs
          triggerMourningNearby(npc);
        }
      }

      // Timers
      if (npc.barkTimer > 0) npc.barkTimer -= dt;
      if (npc.speechTimer > 0) npc.speechTimer -= dt;
      if (npc.attackTimer > 0) npc.attackTimer -= dt;
      if (npc.hitCooldown > 0) npc.hitCooldown -= dt;
      if (npc.emotionTimer > 0) {
        npc.emotionTimer -= dt;
        if (npc.emotionTimer <= 0) { npc.emotion = 'neutral'; npc.emotionIntensity = 0; }
      }
      if (npc.panicSpreadCooldown > 0) npc.panicSpreadCooldown -= dt;
    }
  }

  function triggerMourningNearby(deadNpc) {
    var nearby = spatialHash.query(deadNpc.x, deadNpc.y, 150);
    for (var i = 0; i < nearby.length; i++) {
      var n = nearby[i];
      if (!n.alive || n.state === STATE.FIGHT) continue;
      // Check if they have a relationship with the dead NPC
      var hasRelation = n.relationships && n.relationships.some(function (r) { return r.withId === deadNpc.id && r.affinity > 0; });
      if (hasRelation || U.rng() < 0.2) {
        setEmotion(n, 'scared', 0.7, 30);
        if (n.state !== STATE.FLEE) {
          n.state = STATE.MOURN;
          n.mourningTimer = 8 + U.rng() * 6;
          if (n.barkTimer <= 0) {
            setBark(n, U.pick([
              deadNpc.name.first + '! No!',
              'Help! Someone has been killed!',
              'Gods, no... not like this.',
              'Murder! Guards!'
            ]));
          }
        }
      }
    }
  }

  // ─── Schedule Logic ────────────────────────────────────────────────────────
  function updateSchedule(npc, hour) {
    var job = JOBS[npc.job];
    if (!job) return;
    var sched = job.schedule;
    for (var i = 0; i < sched.length; i++) {
      var s = sched[i];
      var inRange = s.start < s.end ? (hour >= s.start && hour < s.end) : (hour >= s.start || hour < s.end);
      if (inRange) {
        npc.scheduledState = s.state;
        npc.scheduledTarget = s.target || (s.state === STATE.WORK || s.state === STATE.PATROL ? 'work' : 'home');
        break;
      }
    }
  }

  // ─── Core NPC AI ──────────────────────────────────────────────────────────
  function updateNPCAI(npc, dt, hour, px, py, distToPlayer) {
    updateSchedule(npc, hour);

    // === HIGH-PRIORITY OVERRIDES ===
    if (npc.state === STATE.FIGHT) { updateCombatAI(npc, dt, px, py); return; }
    if (npc.state === STATE.FLEE) { updateFleeAI(npc, dt, px, py); return; }
    if (npc.state === STATE.PURSUE) { updatePursueAI(npc, dt, px, py); return; }
    if (npc.state === STATE.WARN) { updateWarnAI(npc, dt, px, py, distToPlayer); return; }
    if (npc.state === STATE.INVESTIGATE) { updateInvestigateAI(npc, dt, px, py); return; }
    if (npc.state === STATE.SCARED) { updateScaredAI(npc, dt, px, py, distToPlayer); return; }
    if (npc.state === STATE.MOURN) { updateMournAI(npc, dt); return; }

    // === WEATHER-DRIVEN BEHAVIOR ===
    var weather = Game.Ambient ? Game.Ambient.getWeather() : null;
    if (weather && (weather.type === 'storm') && npc.job !== 'guard' && npc.faction !== 'bandits') {
      // In a storm, non-guards head home
      npc.scheduledState = STATE.SLEEP;
    } else if (weather && weather.type === 'rain' && U.rng() < 0.002) {
      // Rain: occasionally rush toward home
      if (npc.scheduledState === STATE.WORK || npc.scheduledState === STATE.SOCIALIZE) {
        if (npc.barkTimer <= 0) setBark(npc, U.pick(['This rain is miserable.', 'I am soaked through!', 'I need shelter.']));
      }
    }

    // === BANDIT AGGRESSION ===
    if (npc.faction === 'bandits' && distToPlayer < 200 && npc.alive) {
      var pState = Game.Player.getState();
      if (pState.alive && npc.aggression > 0.5) {
        npc.state = STATE.FIGHT;
        npc.combatTarget = 'player';
        setBark(npc, U.pick(['Hah! Your coin or your life!', 'Stand and deliver!', 'Another easy mark!', 'Empty your pockets!']));
        return;
      }
    }

    // === GUARD AI - TIERED ESCALATION ===
    if (npc.job === 'guard' && npc.alive) {
      var pState = Game.Player.getState();
      var bounty = pState.bounty;
      var tier = Game.Law.getGuardAlertTier(bounty);
      var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };

      if (tier === 0) {
        // Normal patrol - check restricted areas and social context
        if (distToPlayer < 180) {
          if (Game.World.isRestricted && Game.World.isRestricted(Math.floor(px / TS), Math.floor(py / TS)) &&
              Game.Player.getApparentClass() !== 'noble') {
            if (npc.barkTimer <= 0) setBark(npc, 'You do not belong here. Move along.');
          }
          // Guards acknowledge nobles
          var nearbyNobility = spatialHash.query(npc.x, npc.y, 80);
          for (var ni = 0; ni < nearbyNobility.length; ni++) {
            var nn = nearbyNobility[ni];
            if ((nn.job === 'noble' || nn.job === 'king') && nn.alive && npc.barkTimer <= 0 && U.rng() < 0.01) {
              npc.facing = nn.x < npc.x ? 'W' : 'E';
              setBark(npc, nn.job === 'king' ? 'Your Majesty.' : 'My lord.');
              break;
            }
          }
          // If global alert is elevated, guards scan more
          if (alertState.level >= 1 && distToPlayer < 120 && npc.barkTimer <= 0 && U.rng() < 0.005) {
            setBark(npc, U.pick(['Seen anything suspicious?', 'Stay alert.', 'On guard. There was trouble earlier.']));
          }
        }
      } else if (tier === 1) {
        // Minor offense: warn and monitor
        if (distToPlayer < 220) {
          npc.lastKnownPlayerX = px;
          npc.lastKnownPlayerY = py;
          if (npc.state !== STATE.WARN) {
            npc.state = STATE.WARN;
            npc.warnTimer = 10;
            npc.alertIcon = '!';
            npc.alertIconTimer = 3;
            setBark(npc, Game.Law.getWarnCallout());
          }
          return;
        }
      } else if (tier === 2) {
        // Moderate offense: arrest demand
        npc.lastKnownPlayerX = px;
        npc.lastKnownPlayerY = py;
        if (distToPlayer < 280) {
          if (!npc.arrestDemandActive) {
            npc.arrestDemandActive = true;
            npc.arrestDemandTimer = 6;
            npc.alertIcon = '!';
            npc.alertIconTimer = 4;
            setBark(npc, Game.Law.getArrestCallout());
            callGuardBackup(npc, false);
          }
          // Move toward player to make demand
          if (distToPlayer > 60) {
            moveToward(npc, px, py, dt, 1.1);
          } else {
            // Close enough - wait for surrender or escalate
            npc.vx = 0; npc.vy = 0;
            npc.facing = U.dirFromAngle(U.angle(npc.x, npc.y, px, py));
            if (npc.arrestDemandTimer > 0) {
              npc.arrestDemandTimer -= dt;
              if (npc.barkTimer <= 0 && npc.arrestDemandTimer > 0) {
                setBark(npc, U.pick([
                  'Do not make this harder than it needs to be.',
                  'Last chance. Come with me.',
                  'Surrender. Now.',
                  'You are surrounded. Give up.'
                ]));
              }
            } else {
              // Timer expired - escalate to combat
              npc.arrestDemandActive = false;
              npc.state = STATE.FIGHT;
              npc.combatTarget = 'player';
              setBark(npc, U.pick(['So be it! Take them!', 'Resist arrest, do you? Then fight!', 'Have it your way!']));
            }
          }
          return;
        } else if (distToPlayer < 500) {
          // Player is running - pursue
          npc.state = STATE.PURSUE;
          npc.lastKnownPlayerX = px;
          npc.lastKnownPlayerY = py;
          npc.pursuitTimer = 30;
          setBark(npc, U.pick(['Stop! You cannot run from the law!', 'Guards! After them!', 'Halt, criminal!']));
          callGuardBackup(npc, false);
          return;
        }
      } else {
        // tier 3: kill on sight
        if (distToPlayer < 350) {
          npc.state = STATE.FIGHT;
          npc.combatTarget = 'player';
          npc.arrestDemandActive = false;
          setBark(npc, Game.Law.getKosCallout());
          callGuardBackup(npc, true);
          return;
        } else if (distToPlayer < 600) {
          // Pursue KOS target
          npc.state = STATE.PURSUE;
          npc.lastKnownPlayerX = px;
          npc.lastKnownPlayerY = py;
          npc.pursuitTimer = 45;
          return;
        }
      }
    }

    // === PANIC SPREADING (scared emotion contagion) ===
    if (npc.emotion !== 'scared' && npc.panicSpreadCooldown <= 0) {
      var nearby = spatialHash.query(npc.x, npc.y, 80);
      for (var ni = 0; ni < nearby.length; ni++) {
        var n = nearby[ni];
        if (n.id === npc.id || !n.alive) continue;
        if ((n.state === STATE.FLEE || n.emotion === 'scared') && n.emotionIntensity > 0.5) {
          if (npc.personality !== 'brave' && npc.personality !== 'hostile' && U.rng() < 0.15) {
            setEmotion(npc, 'scared', n.emotionIntensity * 0.7, 15);
            npc.panicSpreadCooldown = 5;
            if (npc.barkTimer <= 0) {
              setBark(npc, U.pick(['What is happening?!', 'Run!', 'Something is wrong!', 'Get away!']));
            }
            break;
          }
        }
      }
    }

    // === GREETING & AWARENESS ===
    if (npc.greetCooldown > 0) npc.greetCooldown -= dt;
    if (npc.alertIconTimer > 0) npc.alertIconTimer -= dt;
    else npc.alertIcon = '';

    var wasClose = npc.lastPlayerDist < 100;
    var isClose = distToPlayer < 100;
    npc.lastPlayerDist = distToPlayer;

    if (isClose && !wasClose && npc.barkTimer <= 0 && npc.greetCooldown <= 0) {
      npc.timesMetPlayer++;
      npc.greetedPlayer = true;
      npc.greetCooldown = 30;

      var greeting;
      // Emotion-affected greetings
      if (npc.emotion === 'scared') {
        greeting = U.pick(['Please, just leave me alone.', 'Stay back!', 'I have nothing. Please.']);
      } else if (npc.emotion === 'angry') {
        greeting = U.pick(['What do YOU want?', 'Not now.', 'Keep your distance.']);
      } else if (npc.timesMetPlayer === 1) {
        greeting = U.pick(['Hm? I have not seen you before.', 'A new face around here.', 'Who might you be?']);
        npc.alertIcon = '?'; npc.alertIconTimer = 2;
      } else if (npc.timesMetPlayer < 4) {
        greeting = U.pick(['You again.', 'Back so soon?', 'I remember you.']);
      } else if (npc.playerRelation > 15) {
        greeting = U.pick(['Ah, my friend!', 'Welcome back!', 'Good to see you again.']);
      } else if (npc.playerRelation < -15) {
        greeting = U.pick(['Not you again.', 'What do you want?', 'Keep walking.']);
        npc.alertIcon = '!'; npc.alertIconTimer = 1.5;
      } else {
        greeting = U.pick(['Greetings.', 'Hello.', 'Day to you.']);
      }

      // Job-specific first meeting
      if (npc.timesMetPlayer === 1) {
        if (npc.job === 'guard') greeting = 'Halt. State your business.';
        else if (npc.job === 'merchant') greeting = 'A customer? Come, have a look!';
        else if (npc.job === 'tavernKeeper') greeting = 'Welcome, traveler. Hungry?';
        else if (npc.job === 'carpenter') greeting = 'Mind the shavings - I am shaping beams.';
        else if (npc.job === 'mason') greeting = 'Watch your step, stone dust everywhere.';
        else if (npc.job === 'fisherman') greeting = 'Tide waits for no one.';
        else if (npc.job === 'baker') greeting = 'Fresh loaves are nearly ready.';
        else if (npc.job === 'tailor') greeting = 'Stand still and I can size you up.';
        else if (npc.job === 'butcher') greeting = 'Best cuts in town, if you have coin.';
        else if (npc.job === 'cooper') greeting = 'A leaky barrel is wasted ale.';
        else if (npc.job === 'potter') greeting = 'Clay tells you what it wants to become.';
      }

      // Hearsay reaction: NPC heard about player's crimes
      if (npc.timesMetPlayer > 1) {
        var hasHeardBadThings = npc.gossipMemory && npc.gossipMemory.some(function (m) { return m.crime && m.severity >= 4; });
        var hasHeardGoodThings = npc.memory && npc.memory.some(function (m) { return m.type === 'playerHelped'; });
        if (hasHeardBadThings && npc.job !== 'guard') {
          greeting = U.pick(['I have heard things about you. Be careful.', 'Word travels in this town. I know what you did.', 'They say you are dangerous. Are you?']);
          npc.alertIcon = '!'; npc.alertIconTimer = 2;
        } else if (hasHeardGoodThings) {
          greeting = U.pick(['People speak well of you.', 'You have a good name here.', 'I heard you helped someone. That is rare.']);
        }
      }

      setBark(npc, greeting);
      var lookAng = U.angle(npc.x, npc.y, px, py);
      npc.facing = U.dirFromAngle(lookAng);
      npc.wanderTimer = Math.max(npc.wanderTimer, 3);
    }

    if (npc.barkTimer > 2.5 && distToPlayer < 100) {
      npc.facing = U.dirFromAngle(U.angle(npc.x, npc.y, px, py));
      npc.wanderTimer = Math.max(npc.wanderTimer, 2);
    }

    // === SCHEDULE-DRIVEN BEHAVIOR ===
    switch (npc.scheduledState) {
      case STATE.SLEEP:
        npc.state = STATE.SLEEP;
        moveToward(npc, npc.home.x, npc.home.y, dt, 0.5);
        break;

      case STATE.WORK:
        npc.state = STATE.WORK;
        var distToWork = U.distSq(npc.x, npc.y, npc.work.x, npc.work.y);

        if (distToWork >= 500) {
          npc.workTaskTimer = 0;
          moveToward(npc, npc.work.x, npc.work.y, dt, 1.0);
        } else {
          if (npc.workTaskCooldown > 0) npc.workTaskCooldown -= dt;
          if (npc.workTaskTimer > 0) npc.workTaskTimer -= dt;

          if (npc.workTaskTimer <= 0 && npc.workTaskCooldown <= 0) {
            npc.workAnchorX = npc.work.x + U.randFloat(-28, 28);
            npc.workAnchorY = npc.work.y + U.randFloat(-28, 28);
            npc.workTaskTimer = U.randFloat(2.8, 6.0);
            npc.workTaskCooldown = U.randFloat(0.8, 1.8);
            npc.hasTarget = false;
          }

          if (npc.workTaskTimer > 0) {
            if (U.distSq(npc.x, npc.y, npc.workAnchorX, npc.workAnchorY) > 64) {
              moveToward(npc, npc.workAnchorX, npc.workAnchorY, dt, 0.5);
            } else {
              npc.vx = 0; npc.vy = 0;
              if (U.rng() < 0.02) npc.facing = U.pick(['N', 'S', 'E', 'W']);
            }
          } else {
            if (npc.wanderTimer <= 0) {
              npc.targetX = npc.work.x + U.randFloat(-40, 40);
              npc.targetY = npc.work.y + U.randFloat(-40, 40);
              npc.hasTarget = true;
              npc.wanderTimer = U.randFloat(1.5, 3.5);
            } else {
              npc.wanderTimer -= dt;
              if (npc.hasTarget) moveToward(npc, npc.targetX, npc.targetY, dt, 0.45);
            }
          }

          if (npc.barkTimer <= 0 && U.rng() < 0.008) {
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
            // Occasional patrol barks
            if (npc.barkTimer <= 0 && U.rng() < 0.1) {
              setBark(npc, U.pick(getWorkBarks('guard')));
            }
          }
        }
        break;

      case STATE.SOCIALIZE:
        npc.state = STATE.SOCIALIZE;
        var socX, socY;
        if (npc.currentLocation === 'ashford') {
          if (hour >= 18) { socX = 116 * TS; socY = 128 * TS; }
          else { socX = 128 * TS; socY = 128 * TS; }
        } else {
          socX = npc.home.x + U.randFloat(-64, 64);
          socY = npc.home.y + U.randFloat(-64, 64);
        }
        // Emotional state affects social walk speed
        var socSpeed = npc.emotion === 'scared' ? 0.3 : (npc.emotion === 'happy' ? 0.7 : 0.6);
        moveToward(npc, socX, socY, dt, socSpeed);

        if (npc.barkTimer <= 0 && U.rng() < 0.004) {
          var ctxBark2 = Game.Ambient ? Game.Ambient.getContextBark(npc, 'social') : null;
          setBark(npc, ctxBark2 || U.pick(getSocialBarks(npc)));
        }

        // NPCs in social state occasionally share gossip
        if (U.rng() < 0.001 && npc.gossipMemory && npc.gossipMemory.length > 0) {
          var gossipTarget = spatialHash.query(npc.x, npc.y, 60);
          for (var gi = 0; gi < gossipTarget.length; gi++) {
            var gt = gossipTarget[gi];
            if (gt.id !== npc.id && gt.alive && gt.state === STATE.SOCIALIZE) {
              // Share a random gossip memory
              var gm = npc.gossipMemory[Math.floor(U.rng() * npc.gossipMemory.length)];
              addMemory(gt, { type: 'heardGossip', content: gm, time: Game.time || 0 });
              break;
            }
          }
        }
        break;

      case STATE.IDLE:
        npc.state = STATE.IDLE;
        updateIdleActivity(npc, dt, hour);
        break;

      case STATE.TRAVEL:
        npc.state = STATE.TRAVEL;
        var travelTarget = getScheduleTargetPos(npc);
        moveToward(npc, travelTarget.x, travelTarget.y, dt, 1.0);
        break;
    }

    // Activity anim
    if (npc.state === STATE.WORK) npc.activityAnim += dt * 3;

    // Ambient awareness barks
    if (npc.barkTimer <= 0 && distToPlayer < 120 && !isClose && U.rng() < 0.002) {
      var ctxBark3 = Game.Ambient ? Game.Ambient.getContextBark(npc, 'playerNear') : null;
      setBark(npc, ctxBark3 || U.pick(getAwarenessBarks(npc, hour)));
    }
  }

  // ─── Idle Activity System ─────────────────────────────────────────────────
  function updateIdleActivity(npc, dt, hour) {
    npc.idleActivityTimer -= dt;
    if (npc.idleActivityTimer <= 0) {
      var activities = ['stand', 'look_around', 'wander', 'sit', 'stretch'];
      if (hour >= 18) activities.push('look_around', 'wander'); // restless at night
      npc.idleActivity = U.pick(activities);
      npc.idleActivityTimer = U.randFloat(3, 9);
    }

    switch (npc.idleActivity) {
      case 'wander':
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
      case 'look_around':
        npc.vx = 0; npc.vy = 0;
        if (U.rng() < 0.03) npc.facing = U.pick(['N', 'S', 'E', 'W']);
        break;
      case 'stretch':
        npc.vx = 0; npc.vy = 0;
        // Visible through activityAnim but just stay put
        break;
      case 'sit':
        npc.vx = 0; npc.vy = 0;
        break;
      default: // stand
        npc.vx = 0; npc.vy = 0;
        break;
    }

    // Idle barks
    if (npc.barkTimer <= 0 && U.rng() < 0.003) {
      setBark(npc, U.pick(getSocialBarks(npc)));
    }
  }

  // ─── Special State AIs ─────────────────────────────────────────────────────

  function updateWarnAI(npc, dt, px, py, distToPlayer) {
    // Guard verbally warning player - watches and waits
    npc.warnTimer -= dt;
    npc.facing = U.dirFromAngle(U.angle(npc.x, npc.y, px, py));
    npc.vx = 0; npc.vy = 0;

    if (Game.Player.getState().bounty <= 0) {
      // Bounty cleared while being warned
      npc.state = STATE.IDLE;
      npc.warnTimer = 0;
      setBark(npc, U.pick(['Glad we sorted that.', 'Stay out of trouble.', 'Move along.']));
      return;
    }

    var tier = Game.Law.getGuardAlertTier(Game.Player.getState().bounty);
    if (tier >= 2) {
      // Escalate
      npc.state = STATE.FIGHT;
      npc.arrestDemandActive = true;
      npc.arrestDemandTimer = 5;
      npc.combatTarget = 'player';
      setBark(npc, Game.Law.getArrestCallout());
      return;
    }

    if (npc.warnTimer <= 0 || distToPlayer > 280) {
      // Warning expired - back to patrol but remain suspicious
      npc.state = STATE.PATROL;
      npc.warnTimer = 0;
      if (npc.barkTimer <= 0) setBark(npc, 'I am watching you.');
    }
  }

  function updatePursueAI(npc, dt, px, py) {
    npc.pursuitTimer -= dt;
    npc.lastKnownPlayerX = px;
    npc.lastKnownPlayerY = py;
    var dist = U.dist(npc.x, npc.y, px, py);

    if (npc.pursuitTimer <= 0 && dist > 400) {
      // Lost the player
      npc.state = STATE.INVESTIGATE;
      npc.targetX = npc.lastKnownPlayerX;
      npc.targetY = npc.lastKnownPlayerY;
      npc.hasTarget = true;
      npc.arrestDemandActive = false;
      setBark(npc, U.pick(['Where did they go?', 'I lost them!', 'They cannot have gone far.', 'Search the area!']));
      return;
    }

    if (dist < 60) {
      // Caught up
      if (npc.job === 'guard') {
        var tier = Game.Law.getGuardAlertTier(Game.Player.getState().bounty);
        if (tier >= 3) {
          npc.state = STATE.FIGHT;
          npc.combatTarget = 'player';
          setBark(npc, Game.Law.getKosCallout());
        } else {
          npc.state = STATE.FIGHT;
          npc.combatTarget = 'player';
          npc.arrestDemandActive = true;
          npc.arrestDemandTimer = 5;
          setBark(npc, Game.Law.getArrestCallout());
        }
      } else {
        npc.state = STATE.FIGHT;
        npc.combatTarget = 'player';
      }
      return;
    }

    // Chase - guards run faster than normal speed
    moveToward(npc, px, py, dt, npc.job === 'guard' ? 1.4 : 1.2);

    if (npc.barkTimer <= 0 && U.rng() < 0.005) {
      setBark(npc, U.pick(['Stop running!', 'You cannot outrun the law!', 'Guards! Intercept!', 'Block the road!']));
    }
  }

  function updateScaredAI(npc, dt, px, py, distToPlayer) {
    // NPC is cowering/panicking - slow, erratic movement
    npc.emotionTimer -= dt;
    if (npc.emotionTimer <= 0) {
      npc.emotion = 'neutral';
      npc.state = STATE.IDLE;
      return;
    }

    // Move away from whatever scared them
    if (distToPlayer < 120) {
      var fleeDist = 80;
      var ang = U.angle(px, py, npc.x, npc.y);
      var fx = npc.x + Math.cos(ang) * fleeDist;
      var fy = npc.y + Math.sin(ang) * fleeDist;
      moveToward(npc, fx, fy, dt, 0.6);
    } else {
      npc.vx = 0; npc.vy = 0;
    }

    if (npc.barkTimer <= 0 && U.rng() < 0.01) {
      setBark(npc, U.pick(['Please, no!', 'Stay away from me!', 'Help!', 'What is happening?!', 'Someone help!']));
    }
  }

  function updateMournAI(npc, dt) {
    npc.mourningTimer -= dt;
    npc.vx = 0; npc.vy = 0;
    if (U.rng() < 0.02) npc.facing = U.pick(['N', 'S', 'E', 'W']);
    if (npc.barkTimer <= 0 && U.rng() < 0.008) {
      setBark(npc, U.pick([
        'This is terrible...', 'Who could do such a thing?', 'I cannot believe this.',
        'We need the guards.', 'This town is not safe anymore.', 'May they rest in peace.'
      ]));
    }
    if (npc.mourningTimer <= 0) {
      npc.state = STATE.IDLE;
      npc.mourningTimer = 0;
    }
  }

  // ─── Combat AI ────────────────────────────────────────────────────────────
  function updateCombatAI(npc, dt, px, py) {
    var pState = Game.Player.getState();
    if (!pState.alive) {
      npc.state = STATE.IDLE;
      npc.combatTarget = null;
      npc._combatPhase = null;
      npc.arrestDemandActive = false;
      setBark(npc, U.pick(['That is done.', 'It is over.', 'Stay down.', 'Justice served.']));
      return;
    }

    var dist = U.dist(npc.x, npc.y, px, py);

    // Guard pursuing arrest: if player gets far, switch to pursue
    if (npc.job === 'guard' && npc.arrestDemandActive && dist > 400) {
      npc.state = STATE.PURSUE;
      npc.lastKnownPlayerX = px;
      npc.lastKnownPlayerY = py;
      npc.pursuitTimer = 35;
      return;
    }

    // Give up if too far (bandits give up sooner)
    var giveUpDist = npc.job === 'guard' ? 650 : 500;
    if (dist > giveUpDist) {
      npc.state = STATE.IDLE;
      npc.combatTarget = null;
      npc._combatPhase = null;
      npc.arrestDemandActive = false;
      setBark(npc, npc.job === 'guard' ? U.pick(['I will find you!', 'You cannot hide!', 'Coward ran off.']) : 'Coward ran off.');
      return;
    }

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

    // === FLEE / GIVE UP THRESHOLD ===
    var fleeThreshold = npc.personality === 'cowardly' ? 0.4 : npc.personality === 'brave' ? 0.1 : 0.2;
    if (hpRatio < fleeThreshold && allyCount === 0) {
      if (npc.job === 'guard' && npc.arrestDemandActive) {
        // Wounded guard calls for backup before retreating
        callGuardBackup(npc, false);
        npc.state = STATE.PURSUE;
        npc.pursuitTimer = 15;
        setBark(npc, U.pick(['Fall back! Get help!', 'Wounded! Need support!', 'Get the captain!']));
      } else {
        npc.state = STATE.FLEE;
        npc.combatTarget = null;
        npc._combatPhase = null;
        setBark(npc, U.pick(['I yield!', 'Mercy!', 'I surrender!', 'Enough!']));
      }
      return;
    }

    if (hpRatio < 0.5 && npc._combatPhase !== 'retreat' && U.rng() < 0.01) {
      npc._combatPhase = 'retreat';
      npc._phaseTimer = 1.5 + U.rng();
      setBark(npc, U.pick(['Back off!', 'Need room...', 'Tch...', 'Stand your ground!']));
    }

    // Arrest demand during combat: guard gives player one more chance
    if (npc.arrestDemandActive && npc.arrestDemandTimer > 0) {
      npc.arrestDemandTimer -= dt;
      if (npc.arrestDemandTimer <= 0) {
        npc.arrestDemandActive = false;
      }
    }

    switch (npc._combatPhase) {
      case 'approach':
        if (dist > 45) {
          moveToward(npc, px, py, dt, 1.2 + aggro * 0.3);
        } else {
          npc._combatPhase = (U.rng() < 0.4 + aggro * 0.3) ? 'attack' : 'circle';
          npc._phaseTimer = 0.3 + U.rng() * 0.5;
        }
        npc.blocking = false;
        break;

      case 'circle':
        var circleAngle = angleToPlayer + Math.PI / 2 * npc._circleDir;
        var cx = px + Math.cos(circleAngle) * 50;
        var cy = py + Math.sin(circleAngle) * 50;
        moveToward(npc, cx, cy, dt, 0.8);
        npc.blocking = U.rng() < 0.5;

        if (npc._phaseTimer <= 0) {
          if (U.rng() < 0.6 + aggro * 0.2) {
            npc._combatPhase = 'attack'; npc._phaseTimer = 0.1;
          } else {
            npc._circleDir *= -1;
            npc._phaseTimer = 1 + U.rng() * 1.5;
          }
        }
        if (isPlayerAttacking && dist < 50 && U.rng() < aggro * 0.4) {
          npc._combatPhase = 'dodge'; npc._phaseTimer = 0.3;
        }
        break;

      case 'attack':
        if (dist > 38) { moveToward(npc, px, py, dt, 1.6); npc.blocking = false; }
        if (dist < 42 && npc.attackTimer <= 0) {
          if (isPlayerBlocking && U.rng() < 0.35) {
            npc._combatPhase = 'feint'; npc._phaseTimer = 0.6; break;
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

          if (U.rng() < 0.4) { npc._combatPhase = 'retreat'; npc._phaseTimer = 0.5 + U.rng() * 0.5; }
          else { npc._combatPhase = 'circle'; npc._phaseTimer = 0.8 + U.rng(); }
        }
        if (npc._phaseTimer <= 0) { npc._combatPhase = 'circle'; npc._phaseTimer = 1; }
        break;

      case 'feint':
        if (npc._phaseTimer > 0.3) {
          moveToward(npc, px, py, dt, 1.4);
        } else {
          var retreatAngle = angleToPlayer + Math.PI;
          moveToward(npc, npc.x + Math.cos(retreatAngle) * 30, npc.y + Math.sin(retreatAngle) * 30, dt, 1.0);
        }
        npc.blocking = false;
        if (npc._phaseTimer <= 0) { npc._combatPhase = 'attack'; npc._phaseTimer = 0.3; }
        break;

      case 'dodge':
        var dodgeAngle = angleToPlayer + (Math.PI / 2) * npc._circleDir;
        moveToward(npc, npc.x + Math.cos(dodgeAngle) * 60, npc.y + Math.sin(dodgeAngle) * 60, dt, 2.0);
        npc.blocking = false;
        if (npc._phaseTimer <= 0) { npc._combatPhase = 'attack'; npc._phaseTimer = 0.2; }
        break;

      case 'retreat':
        var retAngle = angleToPlayer + Math.PI;
        moveToward(npc, npc.x + Math.cos(retAngle) * 80, npc.y + Math.sin(retAngle) * 80, dt, 0.9);
        npc.blocking = true;
        if (npc._phaseTimer <= 0) { npc._combatPhase = dist > 80 ? 'approach' : 'circle'; npc._phaseTimer = 1 + U.rng(); }
        break;

      default:
        npc._combatPhase = 'approach'; npc._phaseTimer = 0;
    }

    // Group flanking
    if (allyCount > 0 && npc._combatPhase !== 'dodge' && npc._combatPhase !== 'retreat') {
      var avgAllyAngle = 0, counted = 0;
      for (var ai = 0; ai < allies.length; ai++) {
        var al = allies[ai];
        if (al.id !== npc.id && al.alive && al.state === STATE.FIGHT) {
          avgAllyAngle += U.angle(px, py, al.x, al.y);
          counted++;
        }
      }
      if (counted > 0) {
        avgAllyAngle /= counted;
        var flankAngle = avgAllyAngle + Math.PI;
        npc.x += (px + Math.cos(flankAngle) * 45 - npc.x) * dt * 0.8;
        npc.y += (py + Math.sin(flankAngle) * 45 - npc.y) * dt * 0.8;
      }
    }

    // Combat barks
    if (npc.barkTimer <= 0 && U.rng() < 0.003) {
      var cBarks;
      if (npc.faction === 'bandits') {
        cBarks = ['Your gold is mine!', 'Stand still!', 'You picked the wrong fight!', 'Ha!', 'Die!'];
      } else if (npc.job === 'guard') {
        if (npc.arrestDemandActive) {
          cBarks = ['Surrender!', 'Give yourself up!', 'Come quietly!', 'One last chance!'];
        } else {
          cBarks = ['In the name of the King!', 'You will not escape!', 'Take them down!', 'No mercy for criminals!'];
        }
      } else {
        cBarks = ['Leave me alone!', 'Help!', 'Stay back!', 'Why are you doing this?'];
      }
      setBark(npc, U.pick(cBarks));
    }
  }

  function updateFleeAI(npc, dt, px, py) {
    var angle = U.angle(px, py, npc.x, npc.y);
    var fleeX = npc.x + Math.cos(angle) * 200;
    var fleeY = npc.y + Math.sin(angle) * 200;
    var speedMod = npc.emotion === 'scared' ? 1.8 : 1.5;
    moveToward(npc, fleeX, fleeY, dt, speedMod);

    if (npc.barkTimer <= 0 && U.rng() < 0.01) {
      setBark(npc, U.pick(['Run!', 'Get away!', 'Help!', 'Leave me alone!']));
    }

    // Spread panic to nearby fleeing NPCs
    if (npc.panicSpreadCooldown <= 0) {
      var nearbyFlee = spatialHash.query(npc.x, npc.y, 60);
      for (var i = 0; i < nearbyFlee.length; i++) {
        var n = nearbyFlee[i];
        if (n.id !== npc.id && n.alive && n.state !== STATE.FLEE && n.state !== STATE.FIGHT &&
            n.faction !== 'bandits' && n.personality !== 'brave') {
          if (U.rng() < 0.1) {
            setEmotion(n, 'scared', 0.6, 12);
            if (n.personality === 'cowardly') n.state = STATE.FLEE;
          }
        }
      }
      npc.panicSpreadCooldown = 3;
    }
    npc.panicSpreadCooldown -= dt;

    if (U.dist(npc.x, npc.y, px, py) > 400) {
      npc.state = STATE.IDLE;
      setEmotion(npc, 'scared', 0.4, 30); // residual fear after fleeing
    }
  }

  function updateInvestigateAI(npc, dt, px, py) {
    if (npc.hasTarget) {
      moveToward(npc, npc.targetX, npc.targetY, dt, 0.8);

      // Guards check for player while investigating
      if (npc.job === 'guard') {
        var pDist = U.dist(npc.x, npc.y, px, py);
        var bounty = Game.Player.getState().bounty;
        var tier = Game.Law.getGuardAlertTier(bounty);
        if (tier >= 2 && pDist < 250) {
          npc.state = STATE.PURSUE;
          npc.lastKnownPlayerX = px;
          npc.lastKnownPlayerY = py;
          npc.pursuitTimer = 30;
          setBark(npc, Game.Law.getArrestCallout());
          return;
        }
        if (npc.barkTimer <= 0 && U.rng() < 0.005) {
          setBark(npc, U.pick(['Where did they go?', 'Something happened here.', 'Check the area.', 'I can smell trouble.']));
        }
      }

      if (U.distSq(npc.x, npc.y, npc.targetX, npc.targetY) < 400) {
        npc.state = STATE.IDLE;
        npc.hasTarget = false;
        if (npc.job === 'guard' && npc.barkTimer <= 0) {
          setBark(npc, U.pick(['All clear here.', 'Nothing to report.', 'Seems quiet.']));
        }
      }
    } else {
      npc.state = STATE.IDLE;
    }
  }

  // ─── Movement ─────────────────────────────────────────────────────────────
  function moveToward(npc, tx, ty, dt, speedMod) {
    var dx = tx - npc.x;
    var dy = ty - npc.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) { npc.vx = 0; npc.vy = 0; return; }

    var spd = npc.speed * (speedMod || 1.0);
    // Emotion affects speed
    if (npc.emotion === 'scared') spd *= 1.15;
    if (npc.emotion === 'happy') spd *= 0.9;

    var nx = dx / dist, ny = dy / dist;
    var moveX = nx * spd * dt;
    var moveY = ny * spd * dt;

    var HB = 8;
    var testX = npc.x + moveX;
    var testY = npc.y + moveY;
    var tileX = Math.floor((testX + (moveX > 0 ? HB : -HB)) / TS);
    var tileY = Math.floor((testY + (moveY > 0 ? HB : -HB)) / TS);

    if (!W.isSolid(tileX, Math.floor(npc.y / TS)) && !W.hasTree(tileX, Math.floor(npc.y / TS))) {
      npc.x = testX;
    } else {
      npc.x += (dy > 0 ? 1 : -1) * spd * dt * 0.3;
    }
    if (!W.isSolid(Math.floor(npc.x / TS), tileY) && !W.hasTree(Math.floor(npc.x / TS), tileY)) {
      npc.y = testY;
    } else {
      npc.y += (dx > 0 ? 1 : -1) * spd * dt * 0.3;
    }

    npc.x = U.clamp(npc.x, TS, (W.WORLD_TILES - 1) * TS);
    npc.y = U.clamp(npc.y, TS, (W.WORLD_TILES - 1) * TS);

    if (Math.abs(dx) > Math.abs(dy)) { npc.facing = dx > 0 ? 'E' : 'W'; }
    else { npc.facing = dy > 0 ? 'S' : 'N'; }
    npc.vx = moveX; npc.vy = moveY;
  }

  // ─── Speech Helpers ────────────────────────────────────────────────────────
  function setBark(npc, text) {
    npc.bark = text;
    npc.barkTimer = 4;
  }

  function setSpeech(npc, text, duration) {
    npc.speechBubble = text;
    npc.speechTimer = duration || 3;
  }

  // ─── Bark Content ─────────────────────────────────────────────────────────
  function getWorkBarks(job) {
    switch (job) {
      case 'farmer': return ['Another long day...', 'Rain would be welcome.', 'The soil is good this year.', 'Back aches something fierce.', 'These fields never rest.'];
      case 'guard': return ['Stay out of trouble.', 'Keep moving.', 'All quiet.', 'Nothing to report.', 'Eyes on the road.', 'Stay sharp.'];
      case 'blacksmith': return ['*clang clang*', 'Fine steel, this.', 'Need more iron...', 'This edge will hold.', 'The anvil sings today.'];
      case 'merchant': return ['Best prices in town!', 'Come, see my wares!', 'Fair deals here!', 'Quality goods, honest price!'];
      case 'tavernKeeper': return ['What can I get you?', 'Ale is fresh today.', 'Welcome, friend.', 'Take a seat.', 'Warm fire, cold ale.'];
      case 'woodcutter': return ['Timber!', 'Good oak here.', 'One more tree...', 'These woods are deep.', 'My axe needs sharpening.'];
      case 'carpenter': return ['Measure twice, cut once.', 'This join needs a tighter fit.', '*scrape scrape*', 'A sturdy beam starts with straight grain.'];
      case 'mason': return ['Stone on stone.', 'Keep the line true.', '*tap tap*', 'This mortar should set by dusk.', 'Solid work, this.'];
      case 'fisherman': return ['Nets up!', 'Good catch today.', 'Mind the hooks.', 'River is generous this morning.', 'Fish are running.'];
      case 'baker': return ['Need more flour.', 'These loaves are rising well.', 'Oven heat is perfect.', 'Bread for the whole square.'];
      case 'tailor': return ['Fine stitching takes patience.', 'Hold still for measurements.', '*snip snip*', 'This seam needs reinforcing.'];
      case 'butcher': return ['Sharp blade, clean cut.', 'Nothing goes to waste.', 'Order for the tavern next.', 'Need fresh salt for curing.'];
      case 'cooper': return ['Hoop it tight.', 'This barrel must not leak.', '*thunk thunk*', 'Good oak staves, good barrel.'];
      case 'potter': return ['Steady hands at the wheel.', 'This clay is too wet.', 'Kiln is almost ready.', 'That glaze should shine.'];
      default: return ['...', 'Hmm.', '*sigh*', 'What a day.'];
    }
  }

  function getSocialBarks(npc) {
    var barks = ['Have you heard the news?', 'Weather is turning.', 'Times are tough.', 'Stay safe out there.', 'Long day today.'];

    // Crime gossip
    if (Game.Law && Game.Law.getRecentCrimes) {
      var crimes = Game.Law.getRecentCrimes();
      if (crimes.length > 0) {
        barks.push('Did you hear about the trouble?');
        barks.push('Someone committed a crime recently...');
        barks.push('The guards are on alert, I hear.');
        barks.push('I do not feel safe out here lately.');
      }
    }

    // Gossip from memory
    if (npc.gossipMemory && npc.gossipMemory.length > 0) {
      barks.push('Word has it something bad happened nearby.');
      barks.push('People have been talking... stay careful.');
    }

    if (npc.lifestyle === 'family') barks.push('I should get home to my family soon.', 'Family comes first.');
    if (npc.lifestyle === 'ambitious') barks.push('One day I will rise above this station.', 'There is always opportunity for those who look.');
    if (npc.lifestyle === 'devout') barks.push('May the gods watch over us.', 'I keep to my prayers and my work.');
    if (npc.lifestyle === 'outdoorsy') barks.push('The fresh air clears the mind.', 'I would rather be in the wilds than inside.');
    if (npc.lifestyle === 'scholarly') barks.push('There is always more to learn.', 'A wise person learns from everyone.');
    if (npc.lifestyle === 'community') barks.push('Look after your neighbors.', 'We are stronger together.');

    if (npc.relationships && npc.relationships.length > 0 && U.rng() < 0.3) {
      var rel = U.pick(npc.relationships);
      var other = npcs[rel.withId];
      if (other) {
        if (rel.type === 'friend') barks.push(other.name.first + ' is good company.');
        if (rel.type === 'rival') barks.push('I still do not trust ' + other.name.first + '.');
        if (rel.type === 'family') barks.push('I should check in on ' + other.name.first + '.');
        if (rel.type === 'coworker') barks.push(other.name.first + ' works hard, I will give them that.');
      }
    }

    if (npc.emotion === 'scared') barks = ['Something is very wrong here.', 'I do not like this.', 'Stay alert.', 'Did you hear that?'];
    if (npc.emotion === 'angry') barks = ['Someone is going to pay for this.', 'I have had enough.', 'This is outrageous.'];
    if (npc.emotion === 'happy') barks = ['What a fine day!', 'I feel good today.', 'Life is good sometimes.', 'A moment to enjoy.'];

    if (npc.faction === 'bandits') {
      barks = ['When is the next raid?', 'I need more coin.', 'Lothar says we move at dawn.', 'This forest hides us well.', 'Keep your eyes open.'];
    }
    return barks;
  }

  function getAwarenessBarks(npc, hour) {
    var barks = [];
    if (hour >= 20 || hour < 5) {
      barks.push('Dark out tonight.', 'I should head home.', 'Strange hour to be about.', 'Watch yourself in the dark.');
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
    // Reaction to player wounds
    if (Game.Player.getState().bleeding > 0) {
      barks.push('You are bleeding - see the healer!', 'Those wounds need tending.', 'By the saints, are you alright?');
    }
    // Reaction to crime gossip
    if (npc.gossipMemory && npc.gossipMemory.length > 0 && U.rng() < 0.3) {
      barks.push('I have heard some troubling things.', 'Stay safe - there has been trouble.', 'The guards should know about this.');
    }
    return barks.length > 0 ? barks : ['...'];
  }

  // ─── Damage & Reactions ────────────────────────────────────────────────────
  function takeDamage(npc, amount, fromPlayer) {
    if (npc.hitCooldown > 0) return 0;
    var actual = amount;
    if (npc.blocking) actual *= 0.25;
    actual = Math.max(1, Math.round(actual * (1 - npc.armor * 0.01)));
    npc.health -= actual;
    npc.hitCooldown = 0.3;

    if (actual > 10 && U.rng() < 0.25) npc.bleeding += 2;
    npc.hitFlashTimer = 0.12;

    if (Game.Renderer && actual > 4) {
      var cnt = Math.min(8, Math.floor(actual / 4));
      for (var bi = 0; bi < cnt; bi++) {
        Game.Renderer.spawnParticle(npc.x + (Math.random() - 0.5) * 8, npc.y - 8, 'blood');
      }
    }

    if (npc.health <= 0) {
      npc.health = 0;
      npc.alive = false;
      npc.state = STATE.DEAD;
      if (fromPlayer) Game.Player.getState().killCount++;
      triggerMourningNearby(npc);
    } else {
      if (fromPlayer) {
        npc.playerRelation -= 30;
        setEmotion(npc, npc.personality === 'brave' ? 'angry' : 'scared', 0.9, 20);

        if (npc.state !== STATE.FIGHT && npc.state !== STATE.FLEE) {
          if (npc.personality === 'cowardly' || npc.health < npc.maxHealth * 0.3) {
            npc.state = STATE.FLEE;
          } else {
            npc.state = STATE.FIGHT;
            npc.combatTarget = 'player';
          }
        }

        // Alert nearby NPCs with group panic
        var nearby = spatialHash.query(npc.x, npc.y, 220);
        for (var i = 0; i < nearby.length; i++) {
          var n = nearby[i];
          if (n.id !== npc.id && n.alive) {
            n.alarmed = true;
            n.alarmTimer = 12;
            if (n.job === 'guard') {
              if (n.state !== STATE.FIGHT && n.state !== STATE.PURSUE) {
                n.state = STATE.FIGHT;
                n.combatTarget = 'player';
                setBark(n, U.pick(['To arms! Defend the people!', 'Criminal! Stop them!', 'Attack!']));
              }
            } else if (n.personality !== 'hostile' && n.faction !== 'bandits') {
              // Panic contagion: scared NPCs can spread fear
              if (n.panicSpreadCooldown <= 0) {
                setEmotion(n, 'scared', 0.7, 20);
                n.panicSpreadCooldown = 4;
                if (n.state !== STATE.FLEE && n.state !== STATE.FIGHT) {
                  if (U.rng() < 0.6) {
                    n.state = STATE.FLEE;
                    setBark(n, U.pick(['Run!', 'Help! Murder!', 'Get away!', 'Gods, no!']));
                  } else {
                    n.state = STATE.SCARED;
                    if (n.barkTimer <= 0) setBark(n, U.pick(['Help!', 'Someone help!', 'No!']));
                  }
                }
              }
            }
          }
        }

        // If a guard was injured, escalate globally
        if (npc.job === 'guard') {
          callGuardBackup(npc, false);
          setBark(npc, U.pick(['Guard down!', 'I am hit!', 'Officer needs help!']));
        }
      }
    }
    return actual;
  }

  // ─── Memory ───────────────────────────────────────────────────────────────
  function addMemory(npc, event) {
    npc.memory.push({ event: event, time: Game.time || 0 });
    if (npc.memory.length > 15) npc.memory.shift();

    // Also store crime-related memories in gossipMemory for spreading
    if (event.type === 'witnessedCrime' || event.type === 'heardAboutCrime') {
      npc.gossipMemory = npc.gossipMemory || [];
      npc.gossipMemory.push(event);
      if (npc.gossipMemory.length > 8) npc.gossipMemory.shift();
    }
  }

  // ─── Activity Label ────────────────────────────────────────────────────────
  function getActivityLabel(npc) {
    if (!npc || !npc.alive) return '';
    if (npc.state === STATE.SLEEP) return 'Sleeping';
    if (npc.state === STATE.WORK) return 'Working as ' + getJobLabel(npc.job);
    if (npc.state === STATE.PATROL) return 'On patrol';
    if (npc.state === STATE.TRAVEL) return npc.scheduledTarget === 'work' ? 'Going to work' : 'Heading home';
    if (npc.state === STATE.SOCIALIZE) return 'Socializing';
    if (npc.state === STATE.FIGHT) return 'In combat';
    if (npc.state === STATE.FLEE) return 'Fleeing';
    if (npc.state === STATE.WARN) return 'Issuing a warning';
    if (npc.state === STATE.PURSUE) return 'In pursuit';
    if (npc.state === STATE.SCARED) return 'Frightened';
    if (npc.state === STATE.MOURN) return 'In distress';
    if (npc.state === STATE.INVESTIGATE) return 'Investigating';
    if (npc.state === STATE.ARRESTED) return 'Under arrest';
    return 'At ease';
  }

  // ─── Public Accessors ──────────────────────────────────────────────────────
  function getNearPlayer(radius) {
    var p = Game.Player.getState();
    return spatialHash.query(p.x, p.y, radius);
  }

  function getNearest(x, y, radius) { return spatialHash.query(x, y, radius); }
  function getNPCs() { return npcs; }
  function getByFaction(faction) { return npcs.filter(function (n) { return n.faction === faction && n.alive; }); }

  function getSerializable() {
    return npcs.map(function (n) {
      return {
        id: n.id, x: n.x, y: n.y, health: n.health, alive: n.alive,
        state: n.state, playerRelation: n.playerRelation, memory: n.memory,
        gossipMemory: n.gossipMemory || [],
        bleeding: n.bleeding, bounty: n.bounty || 0,
        lifestyle: n.lifestyle, relationships: n.relationships,
        emotion: n.emotion, emotionTimer: n.emotionTimer
      };
    });
  }

  function loadState(data) {
    for (var i = 0; i < data.length && i < npcs.length; i++) {
      var d = data[i], n = npcs[i];
      n.x = d.x; n.y = d.y; n.health = d.health; n.alive = d.alive;
      n.state = d.state; n.playerRelation = d.playerRelation;
      n.memory = d.memory || []; n.gossipMemory = d.gossipMemory || [];
      n.bleeding = d.bleeding || 0;
      n.lifestyle = d.lifestyle || n.lifestyle;
      n.relationships = d.relationships || n.relationships || [];
      n.emotion = d.emotion || 'neutral';
      n.emotionTimer = d.emotionTimer || 0;
    }
  }

  return {
    STATE: STATE,
    init: init, update: update,
    createNPC: createNPC, getNPCs: getNPCs, getNearPlayer: getNearPlayer,
    getNearest: getNearest, takeDamage: takeDamage,
    addMemory: addMemory, getByFaction: getByFaction,
    setBark: setBark, setSpeech: setSpeech, setEmotion: setEmotion,
    callGuardBackup: callGuardBackup,
    getJobLabel: getJobLabel,
    getActivityLabel: getActivityLabel,
    getSerializable: getSerializable, loadState: loadState
  };
})();
