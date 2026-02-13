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
      'The harvest was poor this season.',
      'A merchant caravan arrived from the east.',
      'The King has raised taxes again.',
      'Wolves were spotted near the northern road.',
      'A barn caught fire in the fields last week.',
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

    // Start new conversations between nearby NPCs
    if (convTimer > 3) {
      convTimer = 0;
      var npcs = Game.NPC.getNPCs();
      var p = Game.Player.getState();

      for (var i = 0; i < npcs.length; i++) {
        var a = npcs[i];
        if (!a.alive || a.state === 'sleep' || a.state === 'fight' || a.state === 'flee') continue;
        if (a.barkTimer > 0 || a.speechTimer > 0) continue;
        if (U.dist(a.x, a.y, p.x, p.y) > 350) continue;

        // Find another NPC nearby to chat with
        var nearby = Game.NPC.getNearest(a.x, a.y, 60);
        for (var j = 0; j < nearby.length; j++) {
          var b = nearby[j];
          if (b.id === a.id || !b.alive || b.state === 'fight' || b.state === 'sleep') continue;
          if (b.barkTimer > 0 || b.speechTimer > 0) continue;
          if (U.rng() > 0.02) continue; // low chance per frame

          // Start a conversation
          var conv = pickConversation(a, b);
          if (conv) {
            // Make them face each other
            if (a.x < b.x) { a.facing = 'E'; b.facing = 'W'; }
            else { a.facing = 'W'; b.facing = 'E'; }

            Game.NPC.setBark(a, conv[0]);
            setTimeout(function (bb, line) {
              if (bb.alive) Game.NPC.setBark(bb, line);
            }, 2000, b, conv[1]);

            // Brief pause in movement
            a.wanderTimer = 5;
            b.wanderTimer = 5;
          }
          break; // one conversation attempt per NPC per cycle
        }
      }
    }
  }

  function pickConversation(a, b) {
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var convs = [];

    // Generic greetings
    convs.push(['Good day, ' + b.name.first + '.', 'And to you, ' + a.name.first + '.']);
    convs.push(['How goes it?', 'Same as always.']);

    // Weather
    if (weather.type === 'rain' || weather.type === 'storm') {
      convs.push(['This rain will not let up.', 'Aye, my bones ache from the damp.']);
      convs.push(['We should head inside.', 'The tavern is warm at least.']);
    } else if (weather.type === 'clear') {
      convs.push(['Fine weather today.', 'Makes the work easier.']);
    } else if (weather.type === 'overcast') {
      convs.push(['Looks like rain coming.', 'I hope the crops can take it.']);
    }

    // Time of day
    if (hour >= 18) {
      convs.push(['Long day.', 'Aye. I could use a drink.']);
      convs.push(['Heading to the tavern?', 'Where else?']);
    } else if (hour < 8) {
      convs.push(['Early start today.', 'No rest for us.']);
    }

    // Job-specific
    if (a.job === 'guard' || b.job === 'guard') {
      convs.push(['Anything to report?', 'All quiet. For now.']);
      convs.push(['Stay sharp tonight.', 'Always do.']);
      var pBounty = Game.Player.getState().bounty;
      if (pBounty > 0) {
        convs.push(['That outsider has a bounty.', 'I know. We are watching.']);
      }
    }
    if (a.job === 'farmer' || b.job === 'farmer') {
      convs.push(['How is the harvest?', 'Could be better. Could be worse.']);
      convs.push(['Grain prices keep rising.', 'We can barely afford bread ourselves.']);
    }
    if (a.job === 'merchant' || b.job === 'merchant') {
      convs.push(['Trade has been slow.', 'The roads are not safe enough.']);
      convs.push(['I need more stock.', 'Perhaps the caravan will come soon.']);
    }

    // Gossip about recent events
    if (worldNews.length > 0 && U.rng() < 0.4) {
      var news = worldNews[worldNews.length - 1];
      convs.push(['Did you hear? ' + news, 'Word travels fast around here.']);
    }

    // Player reputation gossip
    var pRep = Game.Player.getState().reputation.global;
    if (pRep > 25) {
      convs.push(['That stranger has been helpful.', 'Perhaps we can trust them.']);
    } else if (pRep < -15) {
      convs.push(['I do not trust that newcomer.', 'Neither do I. Watch your purse.']);
    }

    // Crime gossip
    if (Game.Law.getRecentCrimes().length > 0) {
      convs.push(['There was trouble recently.', 'The guards will sort it out. I hope.']);
      convs.push(['Did you see what happened?', 'I heard shouting, that is all.']);
    }

    // Bandit faction
    if (a.faction === 'bandits' && b.faction === 'bandits') {
      convs = [
        ['When do we strike next?', 'Lothar will decide.'],
        ['I am tired of this forest.', 'Better than a dungeon.'],
        ['That road has easy pickings.', 'Keep your voice down.'],
        ['Any scouts report?', 'A merchant passed at dawn.']
      ];
    }

    return U.pick(convs);
  }

  // ======= EXPANDED BARK SYSTEM =======
  // Called by NPC module to get richer, more contextual barks

  function getContextualBark(npc, context) {
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var barks = [];
    var p = Game.Player.getState();

    // Weather-aware barks
    if (weather.type === 'rain' || weather.type === 'storm') {
      barks.push('This cursed rain...', 'I am soaked through.', 'Where is shelter?');
      if (npc.job === 'farmer') barks.push('The fields needed this.', 'Too much rain will rot the crops.');
    } else if (weather.type === 'clear' && hour > 10 && hour < 16) {
      barks.push('A pleasant day.', 'The sun is warm.', 'Fine weather for a walk.');
      if (npc.job === 'farmer') barks.push('Good drying weather.', 'Sun will do the wheat good.');
    }
    if (weather.temperature < 10) {
      barks.push('Cold enough to freeze.', 'I need a thicker cloak.', 'Winter is not far.');
    }

    // Player proximity reactions
    if (context === 'playerNear') {
      var pClass = Game.Player.getApparentClass();
      var rel = npc.playerRelation;

      if (rel > 30) {
        barks.push('Ah, friend! Good to see you.', 'Welcome back.', 'You are always welcome here.');
      } else if (rel > 10) {
        barks.push('Greetings.', 'Well met.', 'Good day to you.');
      } else if (rel < -30) {
        barks.push('You again...', 'Stay away from me.', 'I have nothing for the likes of you.');
      } else if (rel < -10) {
        barks.push('Hmph.', 'Watch yourself.', 'I have my eye on you.');
      }

      // Gear reactions
      if (p.equipped.armor && p.equipped.armor.id === 'chain_armor') {
        if (npc.socialClass <= 1) barks.push('Nice armor you have there.', 'That chainmail... you are no peasant.');
      }
      if (p.equipped.weapon && p.equipped.weapon.damage > 12) {
        if (npc.job !== 'guard' && npc.faction !== 'bandits') {
          barks.push('That is a fine blade.', 'You go armed? Dangerous times.');
        }
      }
      if (pClass === 'peasant' && npc.socialClass >= 4) {
        barks.push('Do not loiter here, peasant.', 'Know your place.', 'Move along.');
      }

      // Blood on player
      if (p.bleeding > 0) {
        barks.push('You are bleeding!', 'You should see to those wounds.', 'By the saints, are you alright?');
      }
    }

    // Location-specific
    if (context === 'work') {
      switch (npc.job) {
        case 'farmer':
          barks.push('The soil here is stubborn.', 'Another row to plow.', 'These weeds never end.',
                     'I pray for a good yield.', 'My father worked this land before me.');
          break;
        case 'guard':
          barks.push('Hold your ground.', 'Eyes open, men.', 'The walls stand firm.',
                     'A quiet watch is a good watch.', 'I could use a meal.');
          break;
        case 'blacksmith':
          barks.push('*clang* *clang*', 'The forge runs hot today.', 'This iron is good quality.',
                     'A blade must be patient work.', 'Hammer and fire, that is all you need.');
          break;
        case 'merchant':
          barks.push('Fresh goods today!', 'Best prices you will find!', 'Come browse my wares!',
                     'Trade keeps this town alive.', 'I need to restock soon.');
          break;
        case 'tavernKeeper':
          barks.push('Ale or stew?', 'Sit down, rest your legs.', 'The fire is warm.',
                     'We brew our own ale here.', 'Everyone has a story.');
          break;
        case 'woodcutter':
          barks.push('*thwack*', 'Good timber.', 'One more and I can rest.',
                     'The forest provides.', 'Mind the splinters.');
          break;
        case 'carpenter':
          barks.push('*scrape*', 'This frame needs one more brace.', 'Careful with the grain.',
                     'A square joint lasts for years.', 'Hand me the mallet.');
          break;
        case 'mason':
          barks.push('Stonework keeps the rain out.', 'Mortar is setting nicely.', 'Another wall to raise.',
                     'Mind the rubble.', '*tap tap*');
          break;
        case 'fisherman':
          barks.push('Fish were biting at dawn.', 'Need to mend these nets.', 'River current is strong today.',
                     'The catch feeds half the village.', 'Boats need patching too.');
          break;
        case 'baker':
          barks.push('The oven is blazing hot.', 'Fresh loaves in a moment.', 'Dough needs one more rise.',
                     'Everyone wants bread by noon.', 'Mind the crust.');
          break;
        case 'tailor':
          barks.push('Hold still for your fitting.', 'This hem needs a clean line.', 'Fine cloth is hard to get.',
                     'A good stitch saves a coat.', '*snip snip*');
          break;
        case 'butcher':
          barks.push('Sharp knives, steady hands.', 'Nothing from the animal is wasted.', 'Need more curing salt.',
                     'Order for the tavern is next.', 'Best cuts go quickly.');
          break;
        case 'cooper':
          barks.push('These hoops must sit tight.', 'Leaky casks ruin good ale.', 'Oak staves only.',
                     'Another barrel almost done.', '*thunk thunk*');
          break;
        case 'potter':
          barks.push('Clay is perfect after rain.', 'Kiln firing soon.', 'Steady at the wheel now.',
                     'Glaze this one in blue.', 'Careful, that pot is still wet.');
          break;
      }
    }

    // Time-specific
    if (hour >= 20 || hour < 5) {
      barks.push('Too dark to see.', 'I should be abed.', 'The night is long.',
                 'I hear things in the dark.', 'Keep a lantern close.');
    } else if (hour >= 5 && hour < 7) {
      barks.push('Dawn already...', 'Another day begins.', 'The rooster woke me.');
    }

    // Rare lore barks
    if (U.rng() < 0.1) {
      barks.push(
        'My grandfather told me of the old kingdom.',
        'They say the forest was smaller once.',
        'The river has not flooded in years. Odd.',
        'I wonder what lies beyond the mountains.',
        'This frontier was wild land, not long ago.',
        'The King is not as strong as he once was.'
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
