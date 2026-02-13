var Game = Game || {};

Game.Law = (function () {
  var U = Game.Utils;
  var recentCrimes = [];
  var witnessReports = [];

  function init() {
    recentCrimes = [];
    witnessReports = [];
  }

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
      victimName: victim ? victim.name.full : 'unknown'
    };

    // Check for witnesses
    var nearby = Game.NPC.getNearPlayer(200);
    var witnesses = [];
    for (var i = 0; i < nearby.length; i++) {
      var npc = nearby[i];
      if (!npc.alive) continue;
      if (npc === victim) continue;
      if (npc.state === Game.NPC.STATE.SLEEP) continue;

      // Line of sight check (simplified - just distance and not behind walls)
      var dist = U.dist(npc.x, npc.y, player.x, player.y);
      if (dist < 150) {
        // Check if nighttime reduces visibility
        var hour = Game.time ? ((Game.time / 60) % 24) : 12;
        var nightPenalty = (hour >= 21 || hour < 5) ? 0.5 : 1.0;
        var forestPenalty = Game.World.isForest(
          Math.floor(player.x / Game.World.TILE_SIZE),
          Math.floor(player.y / Game.World.TILE_SIZE)
        ) ? 0.7 : 1.0;

        var detectionRange = 150 * nightPenalty * forestPenalty;
        // Stealth check
        var stealthChance = Game.Player.getState().skills.stealth / 200;
        if (dist < detectionRange && U.rng() > stealthChance) {
          witnesses.push(npc);
          crime.witnessed = true;
          Game.NPC.addMemory(npc, { type: 'witnessedCrime', crime: type, time: Game.time || 0 });

          // NPC reaction
          npc.playerRelation -= severity * 5;
          if (npc.job === 'guard') {
            npc.state = Game.NPC.STATE.FIGHT;
            npc.combatTarget = 'player';
            Game.NPC.setBark(npc, getCrimeCallout(type));
            crime.reported = true;
          } else if (npc.personality !== 'hostile' && npc.faction !== 'bandits') {
            // Civilian witnesses flee and may report later
            if (npc.personality !== 'cowardly') {
              npc.state = Game.NPC.STATE.FLEE;
            }
            Game.NPC.setBark(npc, U.pick(['Help! Guards!', 'Stop! Thief!', 'Murder!', 'Someone, help!']));

            // Schedule report to guards
            witnessReports.push({
              witness: npc,
              crime: type,
              time: Game.time || 0,
              reportDelay: U.randFloat(10, 30), // seconds until report
              timer: 0
            });
          }
        }
      }
    }

    // Apply bounty
    if (crime.witnessed) {
      player.bounty += severity * 10;
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

    // Store crime
    recentCrimes.push(crime);
    if (recentCrimes.length > 50) recentCrimes.shift();

    // Player is now flagged
    player.crimesWitnessed.push({ type: type, time: Game.time || 0 });
    if (player.crimesWitnessed.length > 20) player.crimesWitnessed.shift();

    return crime;
  }

  function update(dt) {
    // Process witness reports (witnesses run to guards)
    for (var i = witnessReports.length - 1; i >= 0; i--) {
      var wr = witnessReports[i];
      wr.timer += dt;
      if (wr.timer >= wr.reportDelay) {
        // Alert guards
        var guards = Game.NPC.getByFaction('guards');
        for (var g = 0; g < guards.length; g++) {
          var guard = guards[g];
          if (guard.alive && guard.state !== Game.NPC.STATE.FIGHT) {
            guard.state = Game.NPC.STATE.INVESTIGATE;
            guard.targetX = wr.witness.x;
            guard.targetY = wr.witness.y;
            guard.hasTarget = true;
            // After investigation, guards search for player
            Game.NPC.addMemory(guard, {
              type: 'crimeReport', crime: wr.crime, time: Game.time || 0
            });
          }
        }
        witnessReports.splice(i, 1);
      }
    }
  }

  function getCrimeSeverity(type) {
    switch (type) {
      case 'theft': return 2;
      case 'trespass': return 1;
      case 'assault': return 4;
      case 'murder': return 8;
      case 'pickpocket': return 2;
      default: return 1;
    }
  }

  function getCrimeCallout(type) {
    switch (type) {
      case 'theft': return 'Stop right there, thief!';
      case 'trespass': return 'You are not allowed here!';
      case 'assault': return 'Drop your weapon! You are under arrest!';
      case 'murder': return 'Murderer! You will pay for this!';
      default: return 'Halt! You have committed a crime!';
    }
  }

  function clearBounty() {
    Game.Player.getState().bounty = 0;
    // Calm down guards
    var guards = Game.NPC.getByFaction('guards');
    for (var i = 0; i < guards.length; i++) {
      if (guards[i].state === Game.NPC.STATE.FIGHT && guards[i].combatTarget === 'player') {
        guards[i].state = Game.NPC.STATE.IDLE;
        guards[i].combatTarget = null;
      }
    }
  }

  function getRecentCrimes() { return recentCrimes; }
  function getPlayerBounty() { return Game.Player.getState().bounty; }

  function getSerializable() {
    return {
      recentCrimes: recentCrimes.map(function (c) {
        return { type: c.type, time: c.time, severity: c.severity, witnessed: c.witnessed };
      })
    };
  }

  function loadState(data) {
    if (data && data.recentCrimes) recentCrimes = data.recentCrimes;
  }

  return {
    init: init, update: update,
    reportCrime: reportCrime, clearBounty: clearBounty,
    getRecentCrimes: getRecentCrimes, getPlayerBounty: getPlayerBounty,
    getSerializable: getSerializable, loadState: loadState
  };
})();
