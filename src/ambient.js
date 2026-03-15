var Game = Game || {};

/**
 * Ambient system: weather, wildlife, world events, NPC conversations
 */
Game.Ambient = (function () {
  var U = Game.Utils;

  // ======= WEATHER =======
  var weather = {
    type: 'clear',   // clear, cloudy, overcast, rain, storm
    intensity: 0,    // 0-1
    wind: 0,         // -1 to 1 (negative=west, positive=east)
    temperature: 15, // celsius, affects barks
    changeTimer: 0,
    nextChange: 300  // seconds until next weather shift
  };

  var WEATHER_TYPES = ['clear', 'clear', 'clear', 'cloudy', 'cloudy', 'overcast', 'rain', 'rain', 'storm'];

  // ======= WILDLIFE =======
  var wildlife = [];
  var MAX_WILDLIFE = 30;
  var wildlifeTimer = 0;

  // ======= CLOUDS =======
  var clouds = [];
  var MAX_CLOUDS = 8;

  // ======= WORLD EVENTS =======
  var events = [];
  var eventTimer = 0;
  var worldNews = []; // things NPCs can gossip about

  function init() {
    weather.type = 'clear';
    weather.intensity = 0;
    weather.wind = 0;
    weather.changeTimer = 0;
    weather.nextChange = U.randFloat(180, 400);
    weather.temperature = 14 + U.rng() * 8;
    wildlife = [];
    clouds = [];
    events = [];
    worldNews = [
      'The harvest was poor this season. Food prices have risen.',
      'A merchant caravan arrived from the east with exotic spices.',
      'The King has raised taxes again. The peasants grumble.',
      'Wolves were spotted near the northern road. Travelers warned.',
      'A barn caught fire in the fields last week. Arson suspected.',
      'Yarrow grows thick in the eastern forest. Healers are pleased.',
      'The healer in Ashford is short on herbs. Good time to forage.',
      'A wandering knight was seen camping near the river at dusk.',
      'The blacksmith prices have gone up. Raw iron is scarce.',
      'Someone picked the lock of the market storeroom. Nothing was taken.',
      'The mill wheel broke last week. Grain is backing up.',
      'A strange illness spreads through Millhaven. Chamomile is in demand.',
      'The tavernkeeper raised the price of ale. Hard times for some.',
      'Bandits robbed a peddler on the east road. Guards were too slow.',
      'Wild boar have been spotted near Thornfield. Good hunting.',
      'The blacksmith forged a fine new blade.',
      'Trade with the south has slowed.',
      'The river is running higher than usual.'
    ];
    initClouds();
  }

  function update(dt) {
    updateWeather(dt);
    updateWildlife(dt);
    updateClouds(dt);
    updateWorldEvents(dt);
  }

  // ======= WEATHER LOGIC =======

  function updateWeather(dt) {
    weather.changeTimer += dt;
    if (weather.changeTimer >= weather.nextChange) {
      weather.changeTimer = 0;
      weather.nextChange = U.randFloat(120, 500);
      var day = Game.day || 1;
      var season = day % 40;
      var seasonalPool = WEATHER_TYPES.slice();
      // crude seasonal drift to make world feel less static
      if (season < 10) seasonalPool = seasonalPool.concat(['clear', 'cloudy']);
      else if (season < 20) seasonalPool = seasonalPool.concat(['cloudy', 'overcast']);
      else if (season < 30) seasonalPool = seasonalPool.concat(['rain', 'overcast', 'rain']);
      else seasonalPool = seasonalPool.concat(['storm', 'rain', 'overcast']);

      var newType = U.pick(seasonalPool);
      weather.type = newType;
      weather.wind = U.randFloat(-0.6, 0.6);
      weather.temperature = 8 + U.rng() * 16;
      switch (newType) {
        case 'clear': weather.intensity = 0; break;
        case 'cloudy': weather.intensity = 0.15; break;
        case 'overcast': weather.intensity = 0.3; break;
        case 'rain': weather.intensity = 0.4 + U.rng() * 0.3; break;
        case 'storm': weather.intensity = 0.7 + U.rng() * 0.3; break;
      }
    }
    // Smooth wind fluctuation
    weather.wind += (U.rng() - 0.5) * 0.02 * dt;
    weather.wind = U.clamp(weather.wind, -0.8, 0.8);
  }

  // ======= WILDLIFE LOGIC =======

  function updateWildlife(dt) {
    wildlifeTimer += dt;

    // Spawn wildlife near player
    if (wildlifeTimer > 2 && wildlife.length < MAX_WILDLIFE) {
      wildlifeTimer = 0;
      var p = Game.Player.getState();
      var px = p.x, py = p.y;
      var TS = Game.World.TILE_SIZE;

      for (var attempt = 0; attempt < 3; attempt++) {
        var wx = px + U.randFloat(-300, 300);
        var wy = py + U.randFloat(-300, 300);
        var tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
        var tile = Game.World.tileAt(tx, ty);

        if (Game.World.isSolid(tx, ty)) continue;

        var type = null;
        if (tile === Game.World.T.GRASS || tile === Game.World.T.FOREST_FLOOR) {
          var r = U.rng();
          if (r < 0.35) type = 'bird';
          else if (r < 0.55) type = 'butterfly';
          else if (r < 0.7) type = 'rabbit';
          else if (r < 0.82 && tile === Game.World.T.FOREST_FLOOR) type = 'deer';
          else if (r < 0.88) type = 'crow';
        } else if (tile === Game.World.T.DIRT || tile === Game.World.T.ROAD) {
          if (U.rng() < 0.3) type = 'rat';
          else if (U.rng() < 0.2) type = 'crow';
        } else if (tile === Game.World.T.WATER) {
          if (U.rng() < 0.5) type = 'fish';
          else type = 'dragonfly';
        }

        if (type) {
          wildlife.push(createWildlife(type, wx, wy));
          break;
        }
      }
    }

    // Update each creature
    var cam = Game.Renderer.getCamera();
    for (var i = wildlife.length - 1; i >= 0; i--) {
      var w = wildlife[i];
      w.life += dt;

      // Remove if too far from camera or expired
      if (w.life > w.maxLife ||
          U.distSq(w.x, w.y, cam.x + cam.w / 2, cam.y + cam.h / 2) > 500 * 500) {
        wildlife.splice(i, 1);
        continue;
      }

      // Flee from player
      var p = Game.Player.getState();
      var distP = U.dist(w.x, w.y, p.x, p.y);
      if (w.fleeRange > 0 && distP < w.fleeRange && w.state !== 'flee') {
        w.state = 'flee';
        w.fleeTimer = 2;
        var ang = U.angle(p.x, p.y, w.x, w.y);
        w.vx = Math.cos(ang) * w.speed * 2.5;
        w.vy = Math.sin(ang) * w.speed * 2.5;
      }

      switch (w.type) {
        case 'bird':
        case 'crow':
          updateBird(w, dt);
          break;
        case 'butterfly':
        case 'dragonfly':
          updateButterfly(w, dt);
          break;
        case 'rabbit':
        case 'deer':
          updateGroundAnimal(w, dt);
          break;
        case 'rat':
          updateGroundAnimal(w, dt);
          break;
        case 'fish':
          updateFish(w, dt);
          break;
      }
    }
  }

  function createWildlife(type, x, y) {
    var w = {
      type: type, x: x, y: y, vx: 0, vy: 0,
      life: 0, maxLife: 20 + U.rng() * 40,
      state: 'idle', stateTimer: 0, fleeTimer: 0,
      speed: 30, fleeRange: 60, animPhase: U.rng() * Math.PI * 2,
      variant: (U.rng() * 255) | 0
    };
    switch (type) {
      case 'bird': w.speed = 50; w.fleeRange = 80; w.vy = -0.5; break;
      case 'crow': w.speed = 45; w.fleeRange = 70; break;
      case 'butterfly': w.speed = 15; w.fleeRange = 0; break;
      case 'dragonfly': w.speed = 25; w.fleeRange = 0; break;
      case 'rabbit': w.speed = 80; w.fleeRange = 70; break;
      case 'deer': w.speed = 65; w.fleeRange = 120; break;
      case 'rat': w.speed = 55; w.fleeRange = 50; break;
      case 'fish': w.speed = 20; w.fleeRange = 0; break;
    }
    return w;
  }

  function updateBird(w, dt) {
    w.animPhase += dt * 12;
    if (w.state === 'flee') {
      w.x += w.vx * dt; w.y += w.vy * dt;
      w.vy -= 30 * dt; // fly upward
      w.fleeTimer -= dt;
      if (w.fleeTimer <= 0) { w.state = 'idle'; w.vy = 0; }
      return;
    }
    w.stateTimer -= dt;
    if (w.stateTimer <= 0) {
      if (w.state === 'idle') {
        w.state = 'hop';
        w.vx = U.randFloat(-20, 20);
        w.vy = U.randFloat(-20, 20);
        w.stateTimer = 0.3 + U.rng() * 0.5;
      } else {
        w.state = 'idle';
        w.vx = 0; w.vy = 0;
        w.stateTimer = 1 + U.rng() * 4;
      }
    }
    w.x += w.vx * dt; w.y += w.vy * dt;
  }

  function updateButterfly(w, dt) {
    w.animPhase += dt * 8;
    w.x += Math.sin(w.animPhase * 0.7 + w.variant) * 12 * dt;
    w.y += Math.cos(w.animPhase * 0.5 + w.variant * 0.3) * 8 * dt;
    w.x += weather.wind * 10 * dt;
  }

  function updateGroundAnimal(w, dt) {
    if (w.state === 'flee') {
      w.x += w.vx * dt; w.y += w.vy * dt;
      w.vx *= (1 - dt * 2); w.vy *= (1 - dt * 2);
      w.fleeTimer -= dt;
      if (w.fleeTimer <= 0) { w.state = 'idle'; w.vx = 0; w.vy = 0; }
      return;
    }
    w.stateTimer -= dt;
    if (w.stateTimer <= 0) {
      if (w.state === 'idle') {
        w.state = 'move';
        var ang = U.rng() * Math.PI * 2;
        w.vx = Math.cos(ang) * w.speed * 0.4;
        w.vy = Math.sin(ang) * w.speed * 0.4;
        w.stateTimer = 0.5 + U.rng() * 2;
      } else {
        w.state = 'idle';
        w.vx = 0; w.vy = 0;
        w.stateTimer = 2 + U.rng() * 5;
      }
    }
    w.x += w.vx * dt; w.y += w.vy * dt;
  }

  function updateFish(w, dt) {
    w.animPhase += dt * 3;
    w.x += Math.sin(w.animPhase + w.variant) * 8 * dt;
    w.y += Math.cos(w.animPhase * 0.6 + w.variant * 0.5) * 5 * dt;
  }

  // ======= CLOUDS =======

  function initClouds() {
    clouds = [];
    for (var i = 0; i < MAX_CLOUDS; i++) {
      clouds.push({
        x: U.rng() * 2000 - 500,
        y: U.rng() * 1500 - 300,
        w: 80 + U.rng() * 160,
        h: 30 + U.rng() * 50,
        speed: 8 + U.rng() * 15,
        opacity: 0.06 + U.rng() * 0.1,
        blobs: Math.floor(3 + U.rng() * 4)
      });
    }
  }

  function updateClouds(dt) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += (c.speed + weather.wind * 20) * dt;
      if (c.x > 2000) { c.x = -c.w - 100; c.y = U.rng() * 1500 - 300; }
      if (c.x < -c.w - 200) { c.x = 2000; }
      // Weather affects opacity
      if (weather.type === 'overcast' || weather.type === 'rain' || weather.type === 'storm') {
        c.opacity = U.lerp(c.opacity, 0.18, dt * 0.5);
      } else if (weather.type === 'cloudy') {
        c.opacity = U.lerp(c.opacity, 0.1, dt * 0.5);
      } else {
        c.opacity = U.lerp(c.opacity, 0.05, dt * 0.5);
      }
    }
  }

  // ======= WORLD EVENTS =======

  function updateWorldEvents(dt) {
    eventTimer += dt;
    // Generate periodic world events (news for NPC gossip)
    if (eventTimer > 600) { // every ~10 min game time
      eventTimer = 0;
      var newEvents = [
        'A traveler was robbed on the south road.',
        'The well in ' + U.pick(['Millhaven', 'Thornfield']) + ' ran dry for a day.',
        'A brawl broke out at the Crossed Keys Tavern.',
        'The King held court today. Taxes may change.',
        'A child found a gold coin by the river.',
        'The guard captain doubled the night watch.',
        'Rats were seen in the market stores.',
        'A noble was seen arguing with a guard.',
        'A farmer claims to have seen bandits near the road.',
        'The blacksmith finished a masterwork blade.'
      ];
      var ev = U.pick(newEvents);
      if (worldNews.length > 15) worldNews.shift();
      worldNews.push(ev);
      events.push({ text: ev, time: Game.time || 0 });
      if (events.length > 10) events.shift();
    }
  }

  function addNews(text) {
    worldNews.push(text);
    if (worldNews.length > 15) worldNews.shift();
  }

  // ======= NPC CONVERSATION SYSTEM =======

  var npcConversations = [];
  var convTimer = 0;

  function updateConversations(dt) {
    convTimer += dt;
    if (convTimer < 2.5) return;
    convTimer = 0;

    var npcs = Game.NPC.getNPCs();
    var p = Game.Player.getState();

    for (var i = 0; i < npcs.length; i++) {
      var a = npcs[i];
      if (!a.alive) continue;
      if (a.state === 'sleep' || a.state === 'fight' || a.state === 'flee' || a.state === 'pursue') continue;
      if (a.barkTimer > 0 || a.speechTimer > 0) continue;
      if (U.dist(a.x, a.y, p.x, p.y) > 380) continue;

      var nearby = Game.NPC.getNearest(a.x, a.y, 70);
      for (var j = 0; j < nearby.length; j++) {
        var b = nearby[j];
        if (b.id === a.id || !b.alive) continue;
        if (b.state === 'fight' || b.state === 'sleep' || b.state === 'flee') continue;
        if (b.barkTimer > 0 || b.speechTimer > 0) continue;
        if (U.rng() > 0.025) continue;

        var conv = pickConversation(a, b);
        if (conv) {
          if (a.x < b.x) { a.facing = 'E'; b.facing = 'W'; }
          else { a.facing = 'W'; b.facing = 'E'; }

          Game.NPC.setBark(a, conv[0]);
          setTimeout(function (bb, line) {
            if (bb.alive) Game.NPC.setBark(bb, line);
          }, 2200, b, conv[1]);

          // If it is a 3-line conversation, schedule the third line
          if (conv[2]) {
            setTimeout(function (aa, line) {
              if (aa.alive) Game.NPC.setBark(aa, line);
            }, 4400, a, conv[2]);
          }

          a.wanderTimer = 6;
          b.wanderTimer = 6;

          // Gossip propagation: if A has crime memories, share with B
          if (a.gossipMemory && a.gossipMemory.length > 0 && U.rng() < 0.4) {
            var gm = a.gossipMemory[a.gossipMemory.length - 1];
            if (b.gossipMemory) {
              b.gossipMemory.push({ type: 'heardAboutCrime', crime: gm.crime, severity: gm.severity || 2, time: Game.time || 0, fromNpcName: a.name.first });
              if (b.gossipMemory.length > 8) b.gossipMemory.shift();
            }
          }
          // And vice versa
          if (b.gossipMemory && b.gossipMemory.length > 0 && U.rng() < 0.4) {
            var gm2 = b.gossipMemory[b.gossipMemory.length - 1];
            if (a.gossipMemory) {
              a.gossipMemory.push({ type: 'heardAboutCrime', crime: gm2.crime, severity: gm2.severity || 2, time: Game.time || 0, fromNpcName: b.name.first });
              if (a.gossipMemory.length > 8) a.gossipMemory.shift();
            }
          }
        }
        break;
      }
    }
  }

  function pickConversation(a, b) {
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var convs = [];
    var pState = Game.Player.getState();
    var pRep = pState.reputation.global;
    var pBounty = pState.bounty;
    var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };
    var crimes = Game.Law.getRecentCrimes();

    // ─── BANDIT FACTION ──────────────────────────────────────────────────────
    if (a.faction === 'bandits' && b.faction === 'bandits') {
      return U.pick([
        ['When do we strike next?', 'Lothar will decide.', 'Let him decide fast - I am hungry.'],
        ['I am tired of this forest.', 'Better than a dungeon.'],
        ['That road has easy pickings.', 'Keep your voice down.'],
        ['Any scouts report?', 'A merchant passed at dawn.', 'Then we ride at dusk.'],
        ['I heard there is a bounty on that outsider.', 'Good. More gold for us.'],
        ['Watch the perimeter.', 'Always do. You worry too much.'],
        ['The captain is planning something.', 'When is he not?']
      ]);
    }

    // ─── EMOTIONAL STATE CONVERSATIONS ───────────────────────────────────────
    if (a.emotion === 'scared' || b.emotion === 'scared') {
      convs.push(['Did you see what happened?', 'I heard screaming. I ran.', 'We need to tell the guards.']);
      convs.push(['Something is very wrong.', 'Stay together. Do not go out alone.']);
      convs.push(['I cannot believe it.', 'These are dark days.', 'Stay close to the fire.']);
      return U.pick(convs);
    }

    if (a.emotion === 'angry' || b.emotion === 'angry') {
      convs.push(['Someone is going to pay for this.', 'Keep your head. Let the guards handle it.']);
      convs.push(['I will not stand for it.', 'Neither will I, but we must be careful.']);
    }

    // ─── GUARD CONVERSATIONS ─────────────────────────────────────────────────
    if (a.job === 'guard' || b.job === 'guard') {
      convs.push(['Anything to report?', 'All quiet. For now.']);
      convs.push(['Stay sharp tonight.', 'Always do. Watch the east gate.']);
      convs.push(['My feet are killing me.', 'Patrol does not patrol itself.']);
      convs.push(['When does our shift end?', 'Not soon enough.']);
      if (pBounty > 0) {
        convs.push(['That outsider has a bounty.', 'I know. We are watching them.', 'Do not let them leave town.']);
        convs.push(['The wanted one was seen near the market.', 'I will increase patrols. Be ready.']);
      }
      if (alertState.level >= 1) {
        convs.push(['We are on high alert tonight.', 'Good. No one gets through without being checked.']);
        convs.push(['The captain wants double shifts.', 'After what happened, I understand.']);
      }
      if (alertState.level >= 2) {
        convs.push(['Manhunt is on. Check everyone.', 'Yes sir. No one enters or leaves unchecked.']);
        convs.push(['I want this town locked down.', 'It is done. All gates are watched.']);
      }
    }

    // ─── WEATHER CONVERSATIONS ────────────────────────────────────────────────
    if (weather.type === 'storm') {
      convs.push(['This storm will tear the roof off!', 'Get inside. Now.']);
      convs.push(['I have not seen a storm this bad in years.', 'Stay clear of the trees.']);
    } else if (weather.type === 'rain') {
      convs.push(['This rain will not let up.', 'Aye, my bones ache from the damp.']);
      convs.push(['We should head inside.', 'The tavern is warm at least.']);
      convs.push(['My fields are waterlogged.', 'Better than a drought, I suppose.']);
    } else if (weather.type === 'clear') {
      convs.push(['Fine weather today.', 'Makes the work easier.', 'Long may it last.']);
      convs.push(['Good day for the market.', 'Aye, people come out when the sun shines.']);
    } else if (weather.type === 'overcast') {
      convs.push(['Looks like rain coming.', 'I hope the crops can take it.']);
      convs.push(['Grey skies again.', 'At least it is not raining. Yet.']);
    }
    if (weather.temperature < 8) {
      convs.push(['Cold enough to freeze a river.', 'I need a thicker coat for this.']);
    }

    // ─── TIME OF DAY ─────────────────────────────────────────────────────────
    if (hour >= 21 || hour < 5) {
      convs.push(['You are still up at this hour?', 'Could not sleep. Too much on my mind.']);
      convs.push(['The night feels dangerous lately.', 'I always carry a knife after dark now.']);
    } else if (hour >= 18) {
      convs.push(['Long day.', 'Aye. I could use a drink.']);
      convs.push(['Heading to the tavern?', 'Where else?', 'I will join you in a moment.']);
      convs.push(['The sun is setting early.', 'Winter is not far.']);
    } else if (hour < 8) {
      convs.push(['Early start today.', 'No rest for honest folk.']);
      convs.push(['I barely slept.', 'Nor I. Restless night.']);
      convs.push(['Morning already?', 'The day does not wait for us.']);
    } else if (hour < 12) {
      convs.push(['Good morning, ' + b.name.first + '.', 'Morning, ' + a.name.first + '. Busy day ahead?']);
    } else {
      convs.push(['Good day, ' + b.name.first + '.', 'And to you, ' + a.name.first + '.']);
      convs.push(['How goes it?', 'Same as always. You?', 'Can not complain.']);
    }

    // ─── JOB-SPECIFIC CONVERSATIONS ──────────────────────────────────────────
    if (a.job === 'farmer' || b.job === 'farmer') {
      convs.push(['How is the harvest?', 'Could be better. Could be worse.']);
      convs.push(['Grain prices keep rising.', 'We can barely afford bread ourselves.', 'And the King raises taxes still.']);
      convs.push(['The north field is ready.', 'Good. We need to move fast before rain.']);
    }
    if (a.job === 'blacksmith' || b.job === 'blacksmith') {
      convs.push(['How is business?', 'Busy. Everyone wants sharper blades lately.']);
      convs.push(['Is that new steel from the south?', 'Aye. Finer than what we usually get.']);
    }
    if (a.job === 'merchant' || b.job === 'merchant') {
      convs.push(['Trade has been slow.', 'The roads are not safe enough.']);
      convs.push(['I need more stock.', 'Perhaps the caravan will come soon.']);
      convs.push(['Prices are up again.', 'Supply from the south is thin. What can I do?']);
    }
    if (a.job === 'tavernKeeper' || b.job === 'tavernKeeper') {
      convs.push(['How is business?', 'Packed most nights. Folk need their ale.']);
      convs.push(['I heard something at the inn last night.', 'Travelers talk. What did they say?']);
    }
    if (a.job === 'fisherman' || b.job === 'fisherman') {
      convs.push(['Good catch today?', 'Better than yesterday. River is cooperating.']);
      convs.push(['Strange currents lately.', 'The water is higher than usual.']);
    }
    if (a.job === 'healer' || b.job === 'healer') {
      convs.push(['I am low on yarrow. Have you seen any?', 'The eastern forest has plenty. Mind the bandits though.']);
      convs.push(['Another patient this morning.', 'These are rough times. Keep your herbs stocked.']);
    }
    if (a.job === 'carpenter' || b.job === 'carpenter') {
      convs.push(['I need beams for the new roof.', 'Henrik can cut them. He is in the forest most days.']);
      convs.push(['Slow work today.', 'Good craft takes time.']);
    }

    // ─── RELATIONSHIP-SPECIFIC CONVERSATIONS ─────────────────────────────────
    if (a.relationships) {
      var rel = a.relationships.find(function (r) { return r.withId === b.id; });
      if (rel) {
        if (rel.type === 'friend' && rel.affinity > 20) {
          convs.push(['Good to see you, old friend.', 'Always. What news?']);
          convs.push(['Are you well?', 'Better for seeing you. You?']);
        } else if (rel.type === 'rival' && rel.affinity < -10) {
          convs.push(['I see you are still here.', 'I could say the same.']);
          convs.push([b.name.first + '.', a.name.first + '.']); // curt acknowledgement
        } else if (rel.type === 'family') {
          convs.push(['Will you be home for supper?', 'Aye. Do not wait long though.']);
          convs.push(['Look after yourself out there.', 'I always do. You worry too much.']);
        } else if (rel.type === 'partner') {
          convs.push(['I will not be long today.', 'I will have dinner ready.', 'Good. I am starving.']);
        }
      }
    }

    // ─── CRIME & GOSSIP CONVERSATIONS ────────────────────────────────────────
    var hasCrimes = crimes.length > 0;
    var hasCrimeGossip = (a.gossipMemory && a.gossipMemory.length > 0) || (b.gossipMemory && b.gossipMemory.length > 0);

    if (hasCrimes) {
      var lastCrime = crimes[crimes.length - 1];
      convs.push(['Did you hear about the ' + lastCrime.type + '?', 'I did. Terrible business.', 'The guards are looking into it.']);
      convs.push(['There was trouble nearby.', 'The guards will sort it out. I hope.']);
      convs.push(['Did you see what happened?', 'I heard shouting, that is all.', 'Someone said it was an outsider.']);
      convs.push(['I do not feel safe lately.', 'Nor do I. Stay close to town.']);
    }
    if (hasCrimeGossip) {
      convs.push(['I heard something disturbing.', 'Tell me.', 'Better you do not know the details.']);
      convs.push(['Word is spreading fast.', 'What are they saying?', 'Nothing good.']);
    }

    // ─── WORLD NEWS ───────────────────────────────────────────────────────────
    if (worldNews.length > 0 && U.rng() < 0.45) {
      var news = worldNews[worldNews.length - 1];
      convs.push(['Did you hear? ' + news, 'Word travels fast around here.']);
      if (worldNews.length > 1) {
        var news2 = worldNews[worldNews.length - 2];
        convs.push(['I also heard... ' + news2, 'This town never lacks for news.']);
      }
    }

    // ─── PLAYER REPUTATION GOSSIP ────────────────────────────────────────────
    if (pRep > 30) {
      convs.push(['That outsider has been helping people.', 'I know. Good to have them around.']);
      convs.push(['They say the stranger saved someone.', 'Rare to see that kind of courage.']);
    } else if (pRep > 15) {
      convs.push(['That stranger has been helpful.', 'Perhaps we can trust them.']);
    } else if (pRep < -30) {
      convs.push(['That outsider is dangerous. Stay away.', 'I know. I saw the guards after them.']);
      convs.push(['Lock your doors tonight.', 'Already did. That newcomer worries me.']);
    } else if (pRep < -15) {
      convs.push(['I do not trust that newcomer.', 'Neither do I. Watch your purse.']);
    }

    // ─── GENERIC FILLERS ─────────────────────────────────────────────────────
    convs.push(['Have you been to the tavern lately?', 'Not recently. Is there news?', 'Always is.']);
    convs.push(['How are the children?', 'Growing fast. Too fast.']);
    convs.push(['I have been on my feet all day.', 'Sit down then. I will join you.']);
    convs.push(['What do you make of all this?', 'I try not to think too much. Better that way.']);
    convs.push(['Any word from the capital?', 'The road brings little news these days.']);
    convs.push(['I saw a rider pass at dawn.', 'Going where?', 'North, toward the castle.']);

    // ─── LIFESTYLE CONVERSATIONS ──────────────────────────────────────────────
    if (a.lifestyle === 'devout' || b.lifestyle === 'devout') {
      convs.push(['May the gods protect this town.', 'Amen to that.']);
      convs.push(['I said a prayer this morning.', 'In times like these, it does not hurt.']);
    }
    if (a.lifestyle === 'ambitious' || b.lifestyle === 'ambitious') {
      convs.push(['There must be a way to rise above this.', 'Hard work and patience.', 'Easy for you to say.']);
    }
    if (a.lifestyle === 'family' || b.lifestyle === 'family') {
      convs.push(['My children worry about the news lately.', 'Tell them to stay close.']);
    }

    return convs.length > 0 ? U.pick(convs) : null;
  }

  // ======= EXPANDED BARK SYSTEM =======

  function getContextualBark(npc, context) {
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var barks = [];
    var p = Game.Player.getState();
    var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };

    // ─── EMOTIONAL STATE OVERRIDES ────────────────────────────────────────────
    if (npc.emotion === 'scared' && npc.emotionIntensity > 0.5) {
      return U.pick(['Something terrible happened.', 'I am frightened. Please, stay close.', 'I do not feel safe here.', 'Did you hear that?!', 'The guards need to know about this.']);
    }
    if (npc.emotion === 'angry' && npc.emotionIntensity > 0.5) {
      return U.pick(['Someone will answer for this.', 'I have had enough.', 'This is outrageous.', 'Wait until the captain hears.']);
    }
    if (npc.emotion === 'happy') {
      return U.pick(['What a fine day it is!', 'Life has its moments.', 'I feel well today, for once.']);
    }

    // ─── WEATHER BARKS ────────────────────────────────────────────────────────
    if (weather.type === 'storm') {
      barks.push('This storm is fierce!', 'Get to shelter!', 'The wind will tear the roofs off!');
    } else if (weather.type === 'rain') {
      barks.push('This cursed rain...', 'I am soaked through.', 'Where is shelter?');
      if (npc.job === 'farmer') barks.push('The fields needed this.', 'Too much rain will rot the crops.');
      if (npc.job === 'fisherman') barks.push('The river runs fast today.', 'Rain is good for fishing at least.');
    } else if (weather.type === 'clear' && hour > 10 && hour < 16) {
      barks.push('A pleasant day.', 'The sun is warm.', 'Fine weather for a walk.');
      if (npc.job === 'farmer') barks.push('Good drying weather.', 'Sun will do the wheat good.');
    } else if (weather.type === 'overcast') {
      barks.push('Gloomy today.', 'Clouds roll in again.', 'I can feel rain coming.');
    }
    if (weather.temperature < 8) {
      barks.push('Cold enough to freeze.', 'I need a thicker cloak.', 'Winter is not far.', 'My hands are numb.');
    }

    // ─── ALERT STATE BARKS ────────────────────────────────────────────────────
    if (alertState.level >= 2 && npc.job !== 'guard') {
      barks.push('There is a manhunt on. Stay safe.', 'The guards have everyone on edge.', 'Something serious happened. I dare not ask what.');
    } else if (alertState.level >= 1 && npc.job !== 'guard') {
      barks.push('Guards seem tense today.', 'Something is going on. I can feel it.', 'Keep your eyes open.');
    }

    // ─── PLAYER PROXIMITY REACTIONS ───────────────────────────────────────────
    if (context === 'playerNear') {
      var pClass = Game.Player.getApparentClass();
      var rel = npc.playerRelation;

      if (rel > 30) {
        barks.push('Ah, friend! Good to see you.', 'Welcome back.', 'You are always welcome here.', 'The very person I was thinking of.');
      } else if (rel > 10) {
        barks.push('Greetings.', 'Well met.', 'Good day to you.');
      } else if (rel < -30) {
        barks.push('You again...', 'Stay away from me.', 'I have nothing for the likes of you.', 'Do not look at me.');
      } else if (rel < -10) {
        barks.push('Hmph.', 'Watch yourself.', 'I have my eye on you.');
      }

      // Gear reactions
      if (p.equipped.armor && p.equipped.armor.id === 'chain_armor') {
        if (npc.socialClass <= 1) barks.push('Nice armor you have there.', 'That chainmail... you are no peasant.');
      }
      if (p.equipped.weapon && p.equipped.weapon.damage > 15) {
        if (npc.job !== 'guard' && npc.faction !== 'bandits') {
          barks.push('That is a fine blade.', 'You go armed? Dangerous times.', 'That weapon looks well-used.');
        }
      }
      if (pClass === 'peasant' && npc.socialClass >= 4) {
        barks.push('Do not loiter here, peasant.', 'Know your place.', 'Move along.');
      }
      if (p.reputation && p.reputation.global > 25) {
        barks.push('Ah, I have heard of you.', 'They speak well of you around here.', 'A pleasure to meet a person of renown.');
      } else if (p.reputation && p.reputation.global < -20) {
        barks.push('I know what they say about you.', 'Trouble follows you.', 'Be warned - the guards know your face.');
      }

      // Blood on player
      if (p.bleeding > 0) {
        barks.push('You are bleeding!', 'You should see to those wounds.', 'By the saints, are you alright?', 'Get to the healer, quickly!');
      }

      // Gossip reaction: NPC heard about player crimes
      if (npc.gossipMemory && npc.gossipMemory.some(function (m) { return m.crime && m.severity >= 4; })) {
        barks.push('I have heard things about you.', 'Word travels in this town. Be careful.', 'The guards have been asking about someone matching your description.');
      }
    }

    // ─── JOB-SPECIFIC WORK BARKS ──────────────────────────────────────────────
    if (context === 'work') {
      switch (npc.job) {
        case 'farmer':
          barks.push('The soil here is stubborn.', 'Another row to plow.', 'These weeds never end.',
                     'I pray for a good yield.', 'My father worked this land before me.',
                     'Rain or shine, the land demands attention.', 'The harvest will be what it will be.');
          break;
        case 'guard':
          barks.push('Hold your ground.', 'Eyes open.', 'The walls stand firm.',
                     'A quiet watch is a good watch.', 'Stay alert.',
                     'Nothing gets past me.', 'Report anything unusual.',
                     'This town will not police itself.', 'Every shadow could hide a threat.');
          if (p.bounty > 0) barks.push('I am watching you.', 'Do not make me act.');
          if (alertState.level >= 1) barks.push('All guards stay sharp.', 'We are on alert. No exceptions.', 'Check everyone tonight.');
          break;
        case 'blacksmith':
          barks.push('*clang* *clang*', 'The forge runs hot today.', 'This iron is good quality.',
                     'A blade must be patient work.', 'Hammer and fire, that is all you need.',
                     'The bellows need tending.', 'Let it cool before you test the edge.',
                     'Good steel starts with good ore.');
          break;
        case 'merchant':
          barks.push('Fresh goods today!', 'Best prices you will find!', 'Come browse my wares!',
                     'Trade keeps this town alive.', 'I need to restock soon.',
                     'Fair price, fair trade!', 'Every coin counts.',
                     'The caravans are late again.');
          break;
        case 'tavernKeeper':
          barks.push('Ale or stew?', 'Sit down, rest your legs.', 'The fire is warm.',
                     'We brew our own ale here.', 'Everyone has a story.',
                     'What will it be?', 'Leave your troubles at the door.',
                     'The inn is always open to honest folk.');
          break;
        case 'woodcutter':
          barks.push('*thwack*', 'Good timber.', 'One more and I can rest.',
                     'The forest provides.', 'Mind the splinters.',
                     'This oak has been standing fifty years.', 'Timber!',
                     'These woods go deeper than most know.');
          break;
        case 'carpenter':
          barks.push('*scrape*', 'This frame needs one more brace.', 'Careful with the grain.',
                     'A square joint lasts for years.', 'Hand me the mallet.',
                     'Wood tells you what it wants to become.', 'Measure twice, cut once.',
                     'This beam should hold another century.');
          break;
        case 'mason':
          barks.push('Stonework keeps the rain out.', 'Mortar is setting nicely.', 'Another wall to raise.',
                     'Mind the rubble.', '*tap tap*', 'Stone laid true lasts a lifetime.',
                     'Level it, or it will lean.', 'Every stone has its place.');
          break;
        case 'fisherman':
          barks.push('Fish were biting at dawn.', 'Need to mend these nets.', 'River current is strong today.',
                     'The catch feeds half the village.', 'Boats need patching too.',
                     'The water is telling me something.', 'Patience is the fisherman\'s virtue.',
                     'I know every bend of this river.');
          break;
        case 'baker':
          barks.push('The oven is blazing hot.', 'Fresh loaves in a moment.', 'Dough needs one more rise.',
                     'Everyone wants bread by noon.', 'Mind the crust.',
                     'I have been up since before dawn.', 'A town without a baker starves.',
                     'The flour is running low - I need a delivery.');
          break;
        case 'tailor':
          barks.push('Hold still for your fitting.', 'This hem needs a clean line.', 'Fine cloth is hard to get.',
                     'A good stitch saves a coat.', '*snip snip*',
                     'Thread tells you when it is ready to break.', 'Every garment is a story.',
                     'Good fabric is worth the price.');
          break;
        case 'butcher':
          barks.push('Sharp knives, steady hands.', 'Nothing from the animal is wasted.', 'Need more curing salt.',
                     'Order for the tavern is next.', 'Best cuts go quickly.',
                     'A clean cut is a kind cut.', 'I know every animal by its weight.');
          break;
        case 'cooper':
          barks.push('These hoops must sit tight.', 'Leaky casks ruin good ale.', 'Oak staves only.',
                     'Another barrel almost done.', '*thunk thunk*',
                     'A barrel is only as strong as its weakest stave.',
                     'The inn needs ten more by week\'s end.');
          break;
        case 'potter':
          barks.push('Clay is perfect after rain.', 'Kiln firing soon.', 'Steady at the wheel now.',
                     'Glaze this one in blue.', 'Careful, that pot is still wet.',
                     'The earth gives us all we need.', 'Each vessel has a purpose.');
          break;
        case 'healer':
          barks.push('Yarrow tea for the wounds.', 'Rest is as important as medicine.', 'I need more chamomile.',
                     'The body knows how to heal itself, mostly.', 'Prevention is better than cure.');
          break;
        case 'hunter':
          barks.push('The deer tracks are fresh.', 'Wind in the right direction today.', 'Patience is everything.',
                     'I know these woods better than my own house.', 'A clean shot is a merciful one.');
          break;
        case 'miner':
          barks.push('The seam runs deep here.', 'Good ore today.', 'Mind the darkness underground.',
                     'The mountain gives what it gives.', 'My lungs are tired of dust.');
          break;
      }
    }

    // ─── TIME-SPECIFIC BARKS ──────────────────────────────────────────────────
    if (hour >= 22 || hour < 4) {
      barks.push('Too dark to see.', 'I should be abed.', 'The night is long.',
                 'I hear things in the dark.', 'Keep a lantern close.',
                 'Only trouble walks at this hour.', 'Even the stars are hiding tonight.');
    } else if (hour >= 20) {
      barks.push('Heading home soon.', 'The day is almost done.', 'I could use a drink.',
                 'Night falls fast this time of year.', 'The tavern will be full tonight.');
    } else if (hour >= 5 && hour < 7) {
      barks.push('Dawn already...', 'Another day begins.', 'The rooster woke me.',
                 'Sleep never comes easy.', 'Up before the sun, again.');
    } else if (hour >= 12 && hour < 14) {
      barks.push('Midday break.', 'Half the day gone already.', 'Back to it soon.');
    }

    // ─── SOCIAL CONTEXT BARKS ──────────────────────────────────────────────────
    if (context === 'social') {
      if (npc.lifestyle === 'family') barks.push('My children grow so fast.', 'Family is everything.', 'I should be home earlier.');
      if (npc.lifestyle === 'devout') barks.push('May the gods smile on us.', 'I prayed this morning.', 'Faith guides my steps.');
      if (npc.lifestyle === 'hedonist') barks.push('Pass the ale!', 'Life is short - enjoy it.', 'No sense worrying about tomorrow.');
      if (npc.lifestyle === 'outdoorsy') barks.push('I would rather be in the forest.', 'The open air does the soul good.', 'Town is too crowded.');
      if (npc.lifestyle === 'ambitious') barks.push('One day I will be more than this.', 'Hard work pays off, eventually.', 'There is always a better path.');
      if (npc.lifestyle === 'scholarly') barks.push('I have been reading about the old wars.', 'Knowledge is the best weapon.', 'There is so much I do not know yet.');
      if (npc.lifestyle === 'community') barks.push('We look after our own here.', 'A town is only as strong as its people.', 'Everyone has a part to play.');
    }

    // ─── RARE LORE BARKS ─────────────────────────────────────────────────────
    if (U.rng() < 0.12) {
      barks.push(
        'My grandfather told me of the old kingdom.',
        'They say the forest was smaller once.',
        'The river has not flooded in years. Odd.',
        'I wonder what lies beyond the mountains.',
        'This frontier was wild land, not long ago.',
        'The King is not as strong as he once was.',
        'Some say there are ruins deep in the forest.',
        'Old folk talk of a time before the crown.',
        'I heard a traveler describe a city far to the east.',
        'The bandits have been bolder lately. I fear what that means.',
        'They say Lothar Voss was once a soldier. Hard to believe.',
        'The roads used to be safer. I remember better days.',
        'Strange lights have been seen in the northern forest.',
        'I do not trust the nobles. Never did.'
      );
    }

    return barks.length > 0 ? U.pick(barks) : null;
  }

  // ======= PUBLIC API =======

  function getWeather() { return weather; }
  function getWildlife() { return wildlife; }
  function getClouds() { return clouds; }
  function getWorldNews() { return worldNews; }
  function getContextBark(npc, ctx) { return getContextualBark(npc, ctx); }

  return {
    init: init, update: update, updateConversations: updateConversations,
    getWeather: getWeather, getWildlife: getWildlife, getClouds: getClouds,
    getWorldNews: getWorldNews, getContextBark: getContextBark, addNews: addNews
  };
})();
