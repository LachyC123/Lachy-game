var Game = Game || {};

Game.Law = (function () {
  var U = Game.Utils;
  var recentCrimes = [];
  var witnessReports = [];
  var gossipQueue = [];      // {fromNpcId, memory, radius, timer}
  var alertState = {
    level: 0,              // 0=normal, 1=elevated, 2=manhunt
    timer: 0,              // decays back to 0
    lastCrimeLocation: null
  };

  // Jail/holding cell position in Ashford (near guard barracks)
  var JAIL_POSITION = { x: 112, y: 141 }; // tile coords

  function init() {
    recentCrimes = [];
    witnessReports = [];
    gossipQueue = [];
    alertState = { level: 0, timer: 0, lastCrimeLocation: null };
  }

  // ─── Alert Tier ───────────────────────────────────────────────────────────
  // Returns 0=no action, 1=warn/watch, 2=arrest, 3=kill on sight
  function getGuardAlertTier(bounty) {
    if (bounty <= 0) return 0;
    if (bounty <= 20) return 1;
    if (bounty <= 80) return 2;
    return 3;
  }

  // ─── Crime Callouts ───────────────────────────────────────────────────────
  function getWarnCallout(type) {
    var lines = {
      theft: 'Watch yourself, thief. I am keeping an eye on you.',
      trespass: 'You are in a restricted area. Step back, now.',
      assault: 'I know what you did. One more step wrong and I take you in.',
      murder: 'You think I do not know? Give yourself up.',
      pickpocket: 'Word has it you have been picking pockets. Keep your hands visible.'
    };
    if (type && lines[type]) return lines[type];
    return U.pick([
      'I have heard about you. Stay out of trouble.',
      'Keep your nose clean while I am watching.',
      'Do not make me regret letting you walk free.',
      'You have a mark against you. One more and I act.'
    ]);
  }

  function getArrestCallout(type) {
    var lines = {
      theft: 'Halt, thief! In the name of the King, surrender yourself!',
      trespass: 'You are under arrest for trespassing! On your knees!',
      assault: 'Drop your weapon! You are under arrest for assault!',
      murder: 'Murderer! Surrender or die where you stand!',
      pickpocket: 'Pickpocket! Hands where I can see them - you are coming with me!'
    };
    if (type && lines[type]) return lines[type];
    return U.pick([
      'Halt! You are wanted - surrender now!',
      'In the name of the King, you are under arrest!',
      'Stop right there, criminal! Come with me quietly.',
      'You are coming with me, wanted. Resist and I will make it worse.'
    ]);
  }

  function getKosCallout() {
    return U.pick([
      'Kill the murderous wretch!',
      'No mercy! Cut them down!',
      'That one is marked for death by the crown!',
      'Dangerous criminal - do not let them escape!'
    ]);
  }

  // ─── Witness Report Callout ───────────────────────────────────────────────
  function getCrimeCallout(type) {
    switch (type) {
      case 'theft': return 'Stop right there, thief!';
      case 'trespass': return 'You are not allowed here!';
      case 'assault': return 'Drop your weapon! You are under arrest!';
      case 'murder': return 'Murderer! You will pay for this!';
      case 'pickpocket': return 'Thief! Keep your hands to yourself!';
      default: return 'Halt! You have committed a crime!';
    }
  }

  // ─── Crime Severity ────────────────────────────────────────────────────────
  function getCrimeSeverity(type) {
    switch (type) {
      case 'theft': return 2;
      case 'trespass': return 1;
      case 'assault': return 4;
      case 'murder': return 8;
      case 'pickpocket': return 2;
      case 'burglary': return 3;
      case 'poaching': return 2;
      default: return 1;
    }
  }

  // ─── Report Crime ─────────────────────────────────────────────────────────
  function reportCrime(type, witness, victim) {
    var player = Game.Player.getState();
    var severity = getCrimeSeverity(type);

    var crime = {
      type: type,
      time: Game.time || 0,
      x: player.x, y: player.y,
      severity: severity,
      witnessed: false,
      reported: false,
      victimName: victim ? (victim.name ? victim.name.full : 'unknown') : 'unknown'
    };

    // Check for witnesses
    var nearby = Game.NPC.getNearPlayer(200);
    var witnesses = [];
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var nightPenalty = (hour >= 21 || hour < 5) ? 0.5 : 1.0;
    var forestPenalty = Game.World.isForest(
      Math.floor(player.x / Game.World.TILE_SIZE),
      Math.floor(player.y / Game.World.TILE_SIZE)
    ) ? 0.7 : 1.0;
    var detectionRange = 160 * nightPenalty * forestPenalty;
    var stealthChance = player.skills.stealth / 180;

    for (var i = 0; i < nearby.length; i++) {
      var npc = nearby[i];
      if (!npc.alive) continue;
      if (npc === victim) continue;
      if (npc.state === Game.NPC.STATE.SLEEP) continue;

      var dist = U.dist(npc.x, npc.y, player.x, player.y);
      if (dist < detectionRange && U.rng() > stealthChance) {
        witnesses.push(npc);
        crime.witnessed = true;
        Game.NPC.addMemory(npc, { type: 'witnessedCrime', crime: type, severity: severity, time: Game.time || 0 });

        // Emotional reaction to witnessing crime
        if (Game.NPC.setEmotion) {
          var fearDuration = 30 + severity * 10;
          if (npc.job === 'guard') {
            Game.NPC.setEmotion(npc, 'angry', 0.8, fearDuration);
          } else {
            Game.NPC.setEmotion(npc, 'scared', 0.6 + severity * 0.05, fearDuration);
          }
        }

        npc.playerRelation -= severity * 5;

        if (npc.job === 'guard') {
          var tier = getGuardAlertTier(player.bounty + severity * 10);
          if (tier >= 3 || severity >= 8) {
            npc.state = Game.NPC.STATE.FIGHT;
            npc.combatTarget = 'player';
            Game.NPC.setBark(npc, severity >= 8 ? getKosCallout() : getArrestCallout(type));
          } else {
            npc.state = Game.NPC.STATE.FIGHT;
            npc.combatTarget = 'player';
            npc.arrestDemandActive = true;
            npc.arrestDemandTimer = 6;
            Game.NPC.setBark(npc, getArrestCallout(type));
          }
          crime.reported = true;
          // Alert nearby guards immediately
          if (Game.NPC.callGuardBackup) Game.NPC.callGuardBackup(npc, tier >= 3);
        } else if (npc.personality !== 'hostile' && npc.faction !== 'bandits') {
          npc.state = Game.NPC.STATE.FLEE;
          Game.NPC.setBark(npc, U.pick(['Help! Guards!', 'Stop! Thief!', 'Murder!', 'Someone, help!', 'Criminal! Catch them!']));

          // Schedule report to guards after a delay
          witnessReports.push({
            witness: npc,
            crime: type,
            time: Game.time || 0,
            reportDelay: U.randFloat(8, 25),
            timer: 0
          });

          // Immediately gossip to nearby NPCs
          scheduleGossip(npc.id, { type: 'witnessedCrime', crime: type, severity: severity, time: Game.time || 0 }, 100, 0.5);
        }
      }
    }

    if (crime.witnessed) {
      player.bounty += severity * 10;
      // Raise alert state
      if (severity >= 4) {
        alertState.level = Math.min(2, alertState.level + 1);
        alertState.timer = Math.max(alertState.timer, 180);
        alertState.lastCrimeLocation = { x: player.x, y: player.y };
      } else if (severity >= 2) {
        alertState.level = Math.max(alertState.level, 1);
        alertState.timer = Math.max(alertState.timer, 90);
      }
    }

    // Reputation hit
    player.reputation.global -= severity * 3;
    var location = Game.World.getLocationAt(player.x, player.y);
    if (player.reputation[location] !== undefined) {
      player.reputation[location] -= severity * 5;
    }
    if (type === 'murder' || type === 'assault') {
      player.reputation.guards -= severity * 4;
    }

    recentCrimes.push(crime);
    if (recentCrimes.length > 50) recentCrimes.shift();

    player.crimesWitnessed.push({ type: type, time: Game.time || 0 });
    if (player.crimesWitnessed.length > 20) player.crimesWitnessed.shift();

    // Notify ambient system for gossip injection
    if (Game.Ambient && Game.Ambient.addNews) {
      var crimeDesc = {
        theft: 'A theft was committed here.',
        assault: 'Someone was assaulted!',
        murder: 'There has been a murder!',
        pickpocket: 'A pickpocket is on the loose.',
        trespass: 'Someone was caught trespassing.',
        burglary: 'A building was broken into.',
        poaching: 'Illegal poaching was reported.'
      };
      if (crime.witnessed && crimeDesc[type]) {
        Game.Ambient.addNews(crimeDesc[type]);
      }
    }

    return crime;
  }

  // ─── Gossip System ─────────────────────────────────────────────────────────
  function scheduleGossip(fromNpcId, memory, radius, delay) {
    gossipQueue.push({ fromNpcId: fromNpcId, memory: memory, radius: radius, timer: delay });
  }

  function propagateGossip(fromNpc, memory, radius) {
    var nearby = Game.NPC.getNearest(fromNpc.x, fromNpc.y, radius);
    for (var i = 0; i < nearby.length; i++) {
      var n = nearby[i];
      if (n.id === fromNpc.id || !n.alive) continue;
      if (n.state === Game.NPC.STATE.SLEEP || n.state === Game.NPC.STATE.FIGHT) continue;
      // Hearsay: reduced impact version of memory
      var hearsay = {
        type: 'heardAboutCrime',
        crime: memory.crime,
        severity: memory.severity,
        time: Game.time || 0,
        hearsay: true
      };
      Game.NPC.addMemory(n, hearsay);
      // If serious crime, make civilians alarmed
      if (memory.severity >= 4 && n.job !== 'guard' && n.faction !== 'bandits') {
        if (Game.NPC.setEmotion) {
          Game.NPC.setEmotion(n, 'scared', 0.4, 20);
        }
        if (n.barkTimer <= 0) {
          Game.NPC.setBark(n, U.pick([
            'Did you hear? There is trouble nearby!',
            'Stay close - something happened.',
            'I heard shouting. Stay safe.',
            'Someone said there was a crime just now.'
          ]));
        }
      }
    }
  }

  // ─── Arrest Player ─────────────────────────────────────────────────────────
  function arrestPlayer() {
    var player = Game.Player.getState();
    var fine = Math.min(player.bounty, player.gold);
    var TS = Game.World.TILE_SIZE;

    // Confiscate stolen goods from inventory
    var stolen = [];
    var kept = [];
    for (var i = 0; i < player.inventory.length; i++) {
      var item = player.inventory[i];
      if (item.stolen) {
        stolen.push(item);
      } else {
        kept.push(item);
      }
    }
    player.inventory = kept;

    // Take fine (50% of bounty, up to all gold they have)
    player.gold = Math.max(0, player.gold - fine);

    // Clear bounty
    player.bounty = 0;
    alertState.level = 0;
    alertState.timer = 0;

    // Reputation hit for being arrested
    player.reputation.global -= 10;
    player.reputation.guards -= 5;

    // Advance time (served sentence - 4-8 hours)
    var hoursJailed = Math.floor(4 + Math.random() * 4);
    if (Game.advanceTime) Game.advanceTime(hoursJailed * 60);

    // Teleport player to jail/outside town
    player.x = (JAIL_POSITION.x + 1) * TS;
    player.y = (JAIL_POSITION.y + 1) * TS;

    // Heal fully - time passed
    player.health = player.maxHealth;
    player.bleeding = 0;
    player.wounds = [];
    if (player.stamina !== undefined) player.stamina = player.maxStamina;

    // Calm all guards
    calmGuards();

    // Notify via UI
    if (Game.UI) {
      var msg = 'You were arrested. Fine paid: ' + fine + 'g. Imprisoned for ' + hoursJailed + ' hours.';
      if (stolen.length > 0) msg += ' Stolen goods confiscated.';
      Game.UI.showNotification(msg, 'danger');
    }

    return { fine: fine, stolenConfiscated: stolen.length, hoursJailed: hoursJailed };
  }

  function calmGuards() {
    var guards = Game.NPC.getByFaction('guards');
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i];
      if ((g.state === Game.NPC.STATE.FIGHT || g.state === Game.NPC.STATE.PURSUE) && g.combatTarget === 'player') {
        g.state = Game.NPC.STATE.IDLE;
        g.combatTarget = null;
        g.arrestDemandActive = false;
        g.arrestDemandTimer = 0;
        Game.NPC.setBark(g, U.pick(['They have been dealt with.', 'Justice is served.', 'Back to patrol.', 'The matter is settled.']));
      }
    }
  }

  // ─── Clear Bounty ─────────────────────────────────────────────────────────
  function clearBounty() {
    Game.Player.getState().bounty = 0;
    alertState.level = 0;
    alertState.timer = 0;
    calmGuards();
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  function update(dt) {
    // Decay alert state
    if (alertState.timer > 0) {
      alertState.timer -= dt;
      if (alertState.timer <= 0) {
        alertState.level = Math.max(0, alertState.level - 1);
        alertState.timer = alertState.level > 0 ? 120 : 0;
      }
    }

    // Process witness reports
    for (var i = witnessReports.length - 1; i >= 0; i--) {
      var wr = witnessReports[i];
      wr.timer += dt;
      if (wr.timer >= wr.reportDelay) {
        // Alert nearby guards to last known crime position
        var guards = Game.NPC.getByFaction('guards');
        for (var g = 0; g < guards.length; g++) {
          var guard = guards[g];
          if (guard.alive && guard.state !== Game.NPC.STATE.FIGHT && guard.state !== Game.NPC.STATE.PURSUE) {
            guard.state = Game.NPC.STATE.INVESTIGATE;
            guard.targetX = wr.witness.x + U.randFloat(-20, 20);
            guard.targetY = wr.witness.y + U.randFloat(-20, 20);
            guard.hasTarget = true;
            Game.NPC.addMemory(guard, { type: 'crimeReport', crime: wr.crime, time: Game.time || 0 });
          }
        }
        witnessReports.splice(i, 1);
      }
    }

    // Process gossip queue
    for (var j = gossipQueue.length - 1; j >= 0; j--) {
      var gq = gossipQueue[j];
      gq.timer -= dt;
      if (gq.timer <= 0) {
        var fromNpc = Game.NPC.getNPCs()[gq.fromNpcId];
        if (fromNpc && fromNpc.alive) {
          propagateGossip(fromNpc, gq.memory, gq.radius);
        }
        gossipQueue.splice(j, 1);
      }
    }

    // Decay old crimes
    var currentTime = Game.time || 0;
    for (var k = recentCrimes.length - 1; k >= 0; k--) {
      // Crimes older than 20 real minutes fade from gossip (not from bounty though)
      if (currentTime - recentCrimes[k].time > 1200) {
        recentCrimes.splice(k, 1);
      }
    }
  }

  // ─── Accessors ────────────────────────────────────────────────────────────
  function getRecentCrimes() { return recentCrimes; }
  function getPlayerBounty() { return Game.Player.getState().bounty; }
  function getAlertState() { return alertState; }

  function getSerializable() {
    return {
      recentCrimes: recentCrimes.map(function (c) {
        return { type: c.type, time: c.time, severity: c.severity, witnessed: c.witnessed };
      }),
      alertLevel: alertState.level
    };
  }

  function loadState(data) {
    if (data && data.recentCrimes) recentCrimes = data.recentCrimes;
    if (data && data.alertLevel) alertState.level = data.alertLevel;
  }

  return {
    init: init, update: update,
    reportCrime: reportCrime, clearBounty: clearBounty, arrestPlayer: arrestPlayer,
    getRecentCrimes: getRecentCrimes, getPlayerBounty: getPlayerBounty, getAlertState: getAlertState,
    getGuardAlertTier: getGuardAlertTier, getCrimeSeverity: getCrimeSeverity,
    getWarnCallout: getWarnCallout, getArrestCallout: getArrestCallout, getKosCallout: getKosCallout,
    scheduleGossip: scheduleGossip,
    getSerializable: getSerializable, loadState: loadState
  };
})();
