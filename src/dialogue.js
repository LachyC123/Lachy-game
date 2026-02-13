var Game = Game || {};

Game.Dialogue = (function () {
  var U = Game.Utils;

  var active = false;
  var currentNPC = null;
  var options = [];
  var dialogueText = '';
  var dialogueHistory = [];
  var tradeMode = false;

  function init() {
    active = false;
    currentNPC = null;
    options = [];
    dialogueText = '';
    dialogueHistory = [];
    tradeMode = false;
  }

  function startDialogue(npc) {
    if (!npc || !npc.alive) return;
    active = true;
    currentNPC = npc;
    tradeMode = false;
    Game.NPC.addMemory(npc, { type: 'talkedToPlayer', time: Game.time });
    buildDialogue();
  }

  function buildDialogue() {
    if (!currentNPC) return;
    var npc = currentNPC;
    var rel = npc.playerRelation;
    var pRep = Game.Player.getState().reputation.global;
    var pClass = Game.Player.getApparentClass();

    options = [];
    dialogueText = '';

    // Greeting based on relationship and social class
    if (npc.job === 'king') {
      dialogueText = rel > 10 ? 'Ah, a familiar face. What brings you to my hall?' :
        rel < -10 ? 'You dare show your face here? Speak quickly.' :
        'State your business. I am a busy man.';
    } else if (npc.job === 'guard') {
      dialogueText = rel >= 0 ? 'Citizen. What do you need?' :
        'I have my eye on you. What do you want?';
    } else if (npc.faction === 'bandits') {
      dialogueText = rel > 0 ? 'Heh, you are not so bad for an outsider.' :
        'What do you want? Speak before I change my mind about letting you live.';
    } else if (rel > 20) {
      dialogueText = 'Good to see you, friend! How can I help?';
    } else if (rel > 0) {
      dialogueText = 'Greetings. What can I do for you?';
    } else if (rel > -20) {
      dialogueText = 'Yes? What is it?';
    } else {
      dialogueText = 'I have nothing to say to you.';
    }

    // Class-based modifiers
    if (npc.socialClass > 3 && pClass === 'peasant') {
      dialogueText = 'You smell of dirt. Be brief.';
    }

    // Standard options
    options.push({ text: 'Tell me about this place.', action: 'askAboutPlace' });

    if (rel > -30) {
      options.push({ text: 'Any news or rumors?', action: 'askRumors' });
    }

    // Job-specific options
    if ((npc.job === 'merchant' || npc.job === 'blacksmith' || npc.job === 'tavernKeeper') && npc.inventory.length > 0) {
      options.push({ text: 'I would like to trade.', action: 'trade' });
    }

    if (npc.job === 'tavernKeeper') {
      options.push({ text: 'I need a room for the night.', action: 'rest' });
    }

    // Quest-like options
    if (npc.job === 'farmer' || npc.job === 'villager') {
      options.push({ text: 'Do you need any help?', action: 'askWork' });
    }

    if (npc.job === 'guard' && Game.Player.getState().bounty > 0) {
      options.push({ text: 'I wish to pay my bounty. (' + Game.Player.getState().bounty + ' gold)', action: 'payBounty' });
    }

    // Speech skill check options
    if (Game.Player.getState().skills.speech > 20 && rel > -10) {
      options.push({ text: '[Persuade] Tell me something useful.', action: 'persuade' });
    }

    options.push({ text: 'Farewell.', action: 'leave' });
  }

  function selectOption(index) {
    if (index < 0 || index >= options.length) return;
    var opt = options[index];
    dialogueHistory.push({ speaker: 'player', text: opt.text });

    switch (opt.action) {
      case 'askAboutPlace':
        respondAboutPlace();
        break;
      case 'askRumors':
        respondRumors();
        break;
      case 'trade':
        openTrade();
        break;
      case 'rest':
        respondRest();
        break;
      case 'askWork':
        respondWork();
        break;
      case 'payBounty':
        payBounty();
        break;
      case 'persuade':
        respondPersuade();
        break;
      case 'leave':
        endDialogue();
        return;
      case 'buyItem':
        buyItem(opt.data);
        return;
      case 'sellItem':
        sellItem(opt.data);
        return;
      case 'backToDialogue':
        tradeMode = false;
        buildDialogue();
        return;
    }
  }

  function respondAboutPlace() {
    var npc = currentNPC;
    var loc = npc.currentLocation;
    var responses = {
      ashford: 'Ashford is the main town in this region. The King rules from the castle. You will find merchants in the market square, and the tavern is west of it. Stay out of trouble with the guards.',
      millhaven: 'Millhaven is a quiet farming village. We grow grain and keep to ourselves. The road north leads to Ashford.',
      thornfield: 'Thornfield sits near the forest edge. Henrik the woodcutter braves the woods daily. Beware the eastern forest - bandits lurk there.',
      banditCamp: 'This? Just a camp. We take what we need from those who have too much. The strong survive.',
      wilderness: 'Not much to say about the wild. Stay on the roads if you value your hide.',
      forest: 'These woods are deep and dark. Not safe for the unwary.'
    };
    dialogueText = responses[loc] || 'There is not much to tell about this place.';
    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.05);
    rebuildWithBack();
  }

  function respondRumors() {
    var rumors = [];
    // Check recent crimes
    if (Game.Law && Game.Law.getRecentCrimes) {
      var crimes = Game.Law.getRecentCrimes();
      if (crimes.length > 0) {
        rumors.push('I heard there was trouble recently. The guards are on high alert.');
      }
    }
    // Pull from world news system
    if (Game.Ambient && Game.Ambient.getWorldNews) {
      var news = Game.Ambient.getWorldNews();
      for (var i = Math.max(0, news.length - 3); i < news.length; i++) {
        rumors.push(news[i]);
      }
    }
    // Weather-aware rumors
    if (Game.Ambient) {
      var w = Game.Ambient.getWeather();
      if (w.type === 'storm') rumors.push('This storm is fierce. I hope the roads hold.');
      if (w.type === 'rain') rumors.push('The rains have been heavy. The river may flood.');
    }
    // Generic rumors
    rumors.push('They say the eastern forest is home to a band of outlaws led by a man called Lothar.');
    rumors.push('The King grows old. Some nobles whisper about succession.');
    rumors.push('Grain prices have been rising. Hard times ahead.');
    rumors.push('A merchant was robbed on the road last week.');
    rumors.push('The guards have been cracking down lately. Best to stay honest.');
    rumors.push('I hear deer have been seen near the village. Good hunting perhaps.');
    rumors.push('The graveyard outside town gives me chills at night.');
    rumors.push('There is talk of expanding the town walls. More settlers arriving.');

    var pRep = Game.Player.getState().reputation.global;
    if (pRep < -10) {
      rumors.push('There is someone causing trouble around here. People are nervous.');
    }
    if (pRep > 15) {
      rumors.push('Word of your deeds has spread. People respect you.');
    }

    dialogueText = U.pick(rumors);
    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.03);
    rebuildWithBack();
  }

  function openTrade() {
    tradeMode = true;
    dialogueText = 'Take a look at what I have.';
    options = [];

    var npc = currentNPC;
    for (var i = 0; i < npc.inventory.length; i++) {
      var item = npc.inventory[i];
      var price = Game.Economy.getBuyPrice(item, currentNPC);
      options.push({
        text: 'Buy ' + item.name + ' (' + price + 'g)',
        action: 'buyItem',
        data: { index: i, price: price }
      });
    }

    // Sell player items
    var pInv = Game.Player.getState().inventory;
    for (var i = 0; i < pInv.length; i++) {
      var item = pInv[i];
      if (item.type !== 'weapon' || !Game.Player.getState().equipped.weapon || Game.Player.getState().equipped.weapon.id !== item.id) {
        var sellPrice = Game.Economy.getSellPrice(item, currentNPC);
        options.push({
          text: 'Sell ' + item.name + ' (' + sellPrice + 'g)',
          action: 'sellItem',
          data: { itemId: item.id, price: sellPrice }
        });
      }
    }

    options.push({ text: 'Done trading.', action: 'backToDialogue' });
  }

  function buyItem(data) {
    var player = Game.Player.getState();
    if (player.gold >= data.price) {
      var item = currentNPC.inventory[data.index];
      if (item) {
        player.gold -= data.price;
        Game.Player.addItem(item);
        dialogueText = 'Pleasure doing business.';
        currentNPC.playerRelation += 2;
        Game.Player.gainSkill('speech', 0.05);

        // Consume food immediately option
        if (item.healAmount) {
          Game.Player.heal(item.healAmount);
          dialogueText = 'Here you go. ' + item.name + ' - enjoy.';
        }
      }
    } else {
      dialogueText = 'You cannot afford that.';
    }
    openTrade(); // Refresh trade view
  }

  function sellItem(data) {
    var player = Game.Player.getState();
    if (Game.Player.removeItem(data.itemId, 1)) {
      player.gold += data.price;
      dialogueText = 'I will take that off your hands.';
      currentNPC.playerRelation += 1;
      Game.Player.gainSkill('speech', 0.03);
    }
    openTrade();
  }

  function respondRest() {
    var cost = 10;
    var player = Game.Player.getState();
    if (player.gold >= cost) {
      player.gold -= cost;
      // Advance time to morning
      if (Game.advanceTime) Game.advanceTime(8 * 60); // 8 hours
      player.health = player.maxHealth;
      player.stamina = player.maxStamina;
      player.bleeding = 0;
      dialogueText = 'Rest well. You look like you need it.';
      player.daysAlive++;
    } else {
      dialogueText = 'That will be ' + cost + ' gold for a room. Come back when you can pay.';
    }
    rebuildWithBack();
  }

  function respondWork() {
    var jobs = [
      { text: 'I need someone to deliver grain to Ashford. I will pay 15 gold.', reward: 15 },
      { text: 'Could you chop wood? I will pay 8 gold for a bundle.', reward: 8 },
      { text: 'Help me in the fields today. 10 gold for honest work.', reward: 10 }
    ];
    var job = U.pick(jobs);
    dialogueText = job.text;
    // Simplified: instant reward for now
    Game.Player.getState().gold += job.reward;
    currentNPC.playerRelation += 5;
    Game.Player.gainSkill('speech', 0.02);
    if (Game.advanceTime) Game.advanceTime(120); // 2 hours of work
    dialogueText += ' [+' + job.reward + ' gold]';
    rebuildWithBack();
  }

  function payBounty() {
    var player = Game.Player.getState();
    if (player.gold >= player.bounty) {
      player.gold -= player.bounty;
      Game.Law.clearBounty();
      dialogueText = 'Your debt is paid. Stay out of trouble.';
      currentNPC.playerRelation += 5;
    } else {
      dialogueText = 'You do not have enough gold to cover your bounty.';
    }
    rebuildWithBack();
  }

  function respondPersuade() {
    var chance = Game.Player.getState().skills.speech / 100;
    if (U.rng() < chance) {
      dialogueText = U.pick([
        'Between you and me, the nobles are not happy with the King.',
        'The blacksmith in Ashford sells the best blades in the region.',
        'If you need quick coin, the tavern keeper always needs help.',
        'Watch the road at night. Bandits have been bold lately.',
        'The castle guard changes shift at dusk. Just so you know.'
      ]);
      currentNPC.playerRelation += 3;
      Game.Player.gainSkill('speech', 0.1);
    } else {
      dialogueText = 'I do not know what you are talking about. Leave me be.';
      currentNPC.playerRelation -= 2;
    }
    rebuildWithBack();
  }

  function rebuildWithBack() {
    options = [{ text: 'Continue...', action: 'backToDialogue' }];
  }

  function endDialogue() {
    active = false;
    currentNPC = null;
    options = [];
    dialogueText = '';
    tradeMode = false;
  }

  function isActive() { return active; }
  function getText() { return dialogueText; }
  function getOptions() { return options; }
  function getCurrentNPC() { return currentNPC; }
  function isTrading() { return tradeMode; }

  return {
    init: init, startDialogue: startDialogue,
    selectOption: selectOption, endDialogue: endDialogue,
    isActive: isActive, getText: getText, getOptions: getOptions,
    getCurrentNPC: getCurrentNPC, isTrading: isTrading
  };
})();
