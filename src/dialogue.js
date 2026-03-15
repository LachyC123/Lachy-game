var Game = Game || {};

Game.Dialogue = (function () {
  var U = Game.Utils;

  var active = false;
  var currentNPC = null;
  var options = [];
  var dialogueText = '';
  var dialogueHistory = [];
  var tradeMode = false;
  var arrestMode = false;  // True when player is being confronted for arrest

  function init() {
    active = false;
    currentNPC = null;
    options = [];
    dialogueText = '';
    dialogueHistory = [];
    tradeMode = false;
    arrestMode = false;
  }

  function startDialogue(npc) {
    if (!npc || !npc.alive) return;
    active = true;
    currentNPC = npc;
    tradeMode = false;
    arrestMode = false;
    Game.NPC.addMemory(npc, { type: 'talkedToPlayer', time: Game.time });
    buildDialogue();
  }

  // ─── Dialogue Builder ──────────────────────────────────────────────────────
  function buildDialogue() {
    if (!currentNPC) return;
    var npc = currentNPC;
    var rel = npc.playerRelation;
    var pState = Game.Player.getState();
    var pRep = pState.reputation.global;
    var pClass = Game.Player.getApparentClass();
    var bounty = pState.bounty;
    var tier = Game.Law.getGuardAlertTier(bounty);

    options = [];
    dialogueText = '';
    arrestMode = false;

    // ─── GUARD ARREST DIALOGUE ─────────────────────────────────────────────
    if (npc.job === 'guard' && bounty > 0 && tier >= 2) {
      buildArrestDialogue(npc, tier, bounty);
      return;
    }

    // ─── GUARD WARN DIALOGUE ────────────────────────────────────────────────
    if (npc.job === 'guard' && bounty > 0 && tier === 1) {
      dialogueText = Game.Law.getWarnCallout();
      options.push({ text: 'I understand. I will keep out of trouble.', action: 'acknowledgeWarn' });
      options.push({ text: 'I wish to pay my bounty. (' + bounty + 'g)', action: 'payBounty' });
      options.push({ text: 'Farewell.', action: 'leave' });
      return;
    }

    // ─── STANDARD GREETING ─────────────────────────────────────────────────
    dialogueText = buildGreeting(npc, rel, pRep, pClass, pState);

    // ─── STANDARD OPTIONS ──────────────────────────────────────────────────
    options.push({ text: 'Tell me about this place.', action: 'askAboutPlace' });
    options.push({ text: 'Tell me about your lifestyle.', action: 'askLifestyle' });
    options.push({ text: 'What do you do for work?', action: 'askJob' });

    if (npc.relationships && npc.relationships.length > 0) {
      options.push({ text: 'How are things with people around you?', action: 'askRelationships' });
    }

    if (rel > -30) {
      options.push({ text: 'Any news or rumors?', action: 'askRumors' });
    }

    // ─── JOB-SPECIFIC OPTIONS ──────────────────────────────────────────────
    if ((npc.job === 'merchant' || npc.job === 'blacksmith' || npc.job === 'tavernKeeper') && npc.inventory && npc.inventory.length > 0) {
      options.push({ text: 'I would like to trade.', action: 'trade' });
    }

    if (npc.job === 'tavernKeeper') {
      options.push({ text: 'I need a room for the night. (10g)', action: 'rest' });
      options.push({ text: 'Give me food and drink. (3g)', action: 'buyMeal' });
    }

    if (npc.job === 'healer') {
      options.push({ text: 'I would like to trade.', action: 'trade' });
      var playerHerbs = getPlayerHerbCount();
      if (playerHerbs > 0) {
        options.push({ text: 'Can you brew my herbs into potions? (' + playerHerbs + ' herbs)', action: 'brewPotions' });
      }
      options.push({ text: 'I am injured. Can you help?', action: 'healWounds' });
    }

    if (npc.job === 'blacksmith') {
      var ps = Game.Player.getState();
      var needsRepair = (ps.equipped.weapon && ps.equipped.weapon.durability < 100) ||
                        (ps.equipped.armor  && ps.equipped.armor.durability  < 100);
      if (needsRepair) {
        options.push({ text: 'Can you repair my equipment?', action: 'repairGear' });
      }
    }

    if (npc.job === 'farmer' || npc.job === 'villager' || npc.job === 'carpenter' || npc.job === 'woodcutter') {
      options.push({ text: 'Do you need any help?', action: 'askWork' });
    }

    // Guard-specific options (no outstanding arrest-tier bounty)
    if (npc.job === 'guard') {
      if (bounty > 0) {
        options.push({ text: 'I wish to pay my bounty. (' + bounty + 'g)', action: 'payBounty' });
      }
      // Ask about current alert state
      var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };
      if (alertState.level >= 1) {
        options.push({ text: 'What is going on? You look on edge.', action: 'askAlertStatus' });
      }
    }

    // ─── SKILL-GATED OPTIONS ───────────────────────────────────────────────
    if (pState.skills.stealth > 15 && rel < 10 && npc.job !== 'guard' && npc.job !== 'king') {
      options.push({ text: '[Stealth] Attempt to pickpocket.', action: 'pickpocket' });
    }

    if (pState.skills.speech > 20 && rel > -10) {
      options.push({ text: '[Speech] Tell me something useful. (' + Math.floor(pState.skills.speech) + ')', action: 'persuade' });
    }

    // ─── REPUTATION-GATED OPTIONS ──────────────────────────────────────────
    if (pRep > 30 && rel > 20 && npc.job !== 'guard' && npc.job !== 'bandit') {
      options.push({ text: '[Trusted Friend] Ask a personal favor.', action: 'askFavor' });
    }

    if (pRep < -30 && npc.faction !== 'bandits') {
      // NPCs with low reputation towards player may refuse options or be hostile
      dialogueText += ' I do not trust you. Say what you need and go.';
      options = options.filter(function (o) {
        return o.action === 'leave' || o.action === 'payBounty' || o.action === 'trade';
      });
    }

    // Emotion-based dialogue modifiers
    if (npc.emotion === 'scared') {
      dialogueText = 'P-please, I want no trouble. What is it?';
      options = [
        { text: 'You seem frightened. Are you alright?', action: 'askAboutEmotion' },
        { text: 'Farewell.', action: 'leave' }
      ];
    } else if (npc.emotion === 'angry' && npc.playerRelation < 0) {
      dialogueText = 'What do you want? Make it quick.';
    }

    options.push({ text: 'Farewell.', action: 'leave' });
  }

  function buildArrestDialogue(npc, tier, bounty) {
    arrestMode = true;
    var crimeList = buildCrimeList();
    var pState = Game.Player.getState();

    dialogueText = 'HALT! ' + Game.Law.getArrestCallout() + '\n';
    if (crimeList) dialogueText += 'You are wanted for: ' + crimeList + '.\n';
    dialogueText += 'Your bounty stands at ' + bounty + ' gold. Come with me peacefully.';

    options = [];

    // Surrender
    options.push({ text: '[Surrender] I yield. Take me in.', action: 'surrender' });

    // Pay fine
    if (pState.gold >= bounty) {
      options.push({ text: '[Pay] Pay my bounty here and now. (' + bounty + 'g)', action: 'payBounty' });
    } else {
      options.push({ text: '[Pay] I cannot afford my bounty right now. (' + bounty + 'g needed)', action: 'cannotPay', disabled: true });
    }

    // Bribe (speech-gated, costs extra)
    if (pState.skills.speech >= 30) {
      var bribeAmt = Math.ceil(bounty * 0.6);
      if (pState.gold >= bribeAmt) {
        options.push({ text: '[Speech] Perhaps we can handle this discreetly... (' + bribeAmt + 'g)', action: 'bribe', data: { amount: bribeAmt } });
      }
    }

    // Lie / Talk your way out (high speech)
    if (pState.skills.speech >= 50 && U.rng() < 0.5) {
      options.push({ text: '[Speech] There has been a misunderstanding. Hear me out.', action: 'lieAboutCrime' });
    }

    // Resist / Run
    options.push({ text: '[Resist] I will not go quietly!', action: 'resistArrest' });
  }

  function buildGreeting(npc, rel, pRep, pClass, pState) {
    var text = '';
    if (npc.job === 'king') {
      text = rel > 10 ? 'Ah, a familiar face. What brings you to my hall?' :
             rel < -10 ? 'You dare show your face here? Speak quickly.' :
             'State your business. I am a busy man.';
    } else if (npc.job === 'guard') {
      text = rel >= 0 ? 'Citizen. What do you need?' : 'I have my eye on you. What do you want?';
    } else if (npc.faction === 'bandits') {
      text = rel > 0 ? 'Heh, you are not so bad for an outsider.' :
             'What do you want? Speak before I change my mind about letting you live.';
    } else if (pRep > 40) {
      text = 'The hero themselves! It is an honor. How can I help?';
    } else if (rel > 30) {
      text = 'My dear friend! What a pleasure. What can I do for you?';
    } else if (rel > 10) {
      text = 'Good to see you. What can I do for you?';
    } else if (rel > 0) {
      text = 'Greetings. What can I do for you?';
    } else if (rel > -20) {
      text = 'Yes? What is it?';
    } else if (rel > -40) {
      text = 'I have nothing to say to you. What do you want?';
    } else {
      text = 'I do not want to speak with you. Be brief.';
    }

    if (npc.socialClass > 3 && pClass === 'peasant') {
      text = 'You smell of dirt. Be brief.';
    }

    // Reputation-aware reactions
    if (pState.reputation.global > 25 && npc.timesMetPlayer > 0) {
      text += ' I have heard good things about you.';
    } else if (pState.reputation.global < -25 && npc.timesMetPlayer > 0) {
      text += ' I know what people say about you.';
    }

    // Gossip reaction: NPC heard about player crimes
    if (npc.gossipMemory && npc.gossipMemory.some(function (m) { return m.severity >= 4; })) {
      text = 'Word has reached me about your... actions. ' + text;
    }

    return text;
  }

  function buildCrimeList() {
    var crimes = Game.Law.getRecentCrimes();
    if (!crimes || crimes.length === 0) return null;
    var witnessed = crimes.filter(function (c) { return c.witnessed; });
    if (witnessed.length === 0) return null;
    var types = {};
    witnessed.forEach(function (c) { types[c.type] = true; });
    return Object.keys(types).join(', ');
  }

  // ─── Option Handler ────────────────────────────────────────────────────────
  function selectOption(index) {
    if (index < 0 || index >= options.length) return;
    var opt = options[index];
    if (opt.disabled) return;
    dialogueHistory.push({ speaker: 'player', text: opt.text });

    switch (opt.action) {
      case 'askAboutPlace':    respondAboutPlace();    break;
      case 'askLifestyle':     respondLifestyle();     break;
      case 'askJob':           respondJob();           break;
      case 'askRelationships': respondRelationships(); break;
      case 'askRumors':        respondRumors();        break;
      case 'askAlertStatus':   respondAlertStatus();   break;
      case 'askAboutEmotion':  respondAboutEmotion();  break;
      case 'askFavor':         respondFavor();         break;
      case 'trade':            openTrade();            break;
      case 'rest':             respondRest();          break;
      case 'buyMeal':          respondBuyMeal();       break;
      case 'brewPotions':      respondBrewPotions();   break;
      case 'healWounds':       respondHealWounds();    break;
      case 'repairGear':       respondRepairGear();    break;
      case 'askWork':          respondWork();          break;
      case 'payBounty':        payBounty();            break;
      case 'acknowledgeWarn':  respondAcknowledgeWarn(); break;
      case 'surrender':        respondSurrender();     break;
      case 'bribe':            respondBribe(opt.data); break;
      case 'lieAboutCrime':    respondLieAboutCrime(); break;
      case 'resistArrest':     respondResistArrest();  break;
      case 'cannotPay':        dialogueText = 'Then you must come with me, or I will take you by force.'; rebuildWithBack(); break;
      case 'pickpocket':       respondPickpocket();    break;
      case 'persuade':         respondPersuade();      break;
      case 'leave':            endDialogue();          return;
      case 'buyItem':          buyItem(opt.data);      return;
      case 'sellItem':         sellItem(opt.data);     return;
      case 'backToDialogue':
        tradeMode = false;
        buildDialogue();
        return;
    }
  }

  // ─── Arrest Response Handlers ──────────────────────────────────────────────

  function respondSurrender() {
    endDialogue();
    var result = Game.Law.arrestPlayer();
    if (Game.UI) {
      Game.UI.showNotification(
        'You surrendered. Fine: ' + result.fine + 'g. Jailed for ' + result.hoursJailed + ' hours.' +
        (result.stolenConfiscated > 0 ? ' Stolen goods confiscated.' : ''),
        'danger'
      );
    }
    if (Game.Ambient && Game.Ambient.addNews) {
      Game.Ambient.addNews('A criminal was arrested by the town guard today.');
    }
  }

  function respondBribe(data) {
    var player = Game.Player.getState();
    var chance = 0.3 + player.skills.speech / 150;
    // Adjust based on bounty severity
    if (player.bounty > 60) chance -= 0.2;
    if (player.reputation.guards > 0) chance += 0.1;

    if (U.rng() < chance) {
      player.gold -= data.amount;
      Game.Law.clearBounty();
      dialogueText = currentNPC.name.first + ' pockets the coin and looks away. "I saw nothing. Get out of my sight."';
      currentNPC.playerRelation += 10;
      Game.Player.gainSkill('speech', 0.3);
    } else {
      dialogueText = '"You dare try to bribe an officer?!" ' + currentNPC.name.first + ' is furious. "That is another charge!"';
      player.bounty += 20;
      currentNPC.playerRelation -= 20;
      currentNPC.state = Game.NPC.STATE.FIGHT;
      currentNPC.combatTarget = 'player';
      currentNPC.arrestDemandActive = true;
      currentNPC.arrestDemandTimer = 0;
      endDialogue();
      return;
    }
    rebuildWithBack();
  }

  function respondLieAboutCrime() {
    var player = Game.Player.getState();
    var chance = player.skills.speech / 80;
    if (player.reputation.guards > 10) chance += 0.15;
    if (player.bounty > 40) chance -= 0.25;

    Game.Player.gainSkill('speech', 0.2);

    if (U.rng() < chance) {
      Game.Law.clearBounty();
      dialogueText = 'You spin a convincing tale. ' + currentNPC.name.first + ' frowns but cannot disprove your story. "I am watching you." The guard lets you go.';
      currentNPC.playerRelation += 5;
    } else {
      dialogueText = '"Do not insult my intelligence!" ' + currentNPC.name.first + ' sees through the lie. "That makes it worse."';
      player.bounty += 10;
      currentNPC.state = Game.NPC.STATE.FIGHT;
      currentNPC.combatTarget = 'player';
      currentNPC.arrestDemandActive = true;
      currentNPC.arrestDemandTimer = 0;
      endDialogue();
      return;
    }
    rebuildWithBack();
  }

  function respondResistArrest() {
    dialogueText = 'You make a move to break free!';
    currentNPC.state = Game.NPC.STATE.FIGHT;
    currentNPC.combatTarget = 'player';
    currentNPC.arrestDemandActive = false;
    currentNPC.playerRelation -= 20;
    Game.NPC.setBark(currentNPC, 'Resist, do you?! Then die!');
    // Call nearby guards to fight
    if (Game.NPC.callGuardBackup) Game.NPC.callGuardBackup(currentNPC, Game.Player.getState().bounty > 80);
    endDialogue();
  }

  function respondAcknowledgeWarn() {
    var npc = currentNPC;
    dialogueText = '"See that you do. I will be watching." ' + npc.name.first + ' returns to patrol, eyeing you suspiciously.';
    npc.state = Game.NPC.STATE.PATROL;
    npc.warnTimer = 0;
    npc.playerRelation -= 5;
    rebuildWithBack();
  }

  function respondAlertStatus() {
    var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };
    var lines = {
      0: 'All is quiet. Nothing unusual to report.',
      1: 'We have had some reports of suspicious activity. Keep your eyes open and report anything unusual.',
      2: 'We are on full alert. A serious crime has been committed. Stay indoors and report anything suspicious immediately.'
    };
    dialogueText = lines[alertState.level] || lines[0];
    currentNPC.playerRelation += 1;
    rebuildWithBack();
  }

  function respondAboutEmotion() {
    var npc = currentNPC;
    var hasCrimeGossip = npc.gossipMemory && npc.gossipMemory.some(function (m) { return m.crime; });
    if (hasCrimeGossip) {
      dialogueText = 'I heard there was violence nearby. I... I do not feel safe. Please, just leave me be for now.';
    } else if (npc.mourningTimer > 0) {
      dialogueText = 'Someone died nearby. It is terrible. I cannot stop thinking about it.';
    } else {
      dialogueText = 'I... I am fine. Just a bit shaken. Something felt wrong earlier.';
    }
    npc.playerRelation += 2;
    rebuildWithBack();
  }

  function respondFavor() {
    var npc = currentNPC;
    var favors = [
      'My old friend near Thornfield owes me a debt. Tell him ' + npc.name.first + ' sent you - he may do the same for you.',
      'I keep an emergency stash of food in my home. If you are ever desperate, consider it a gift.',
      'I know a shortcut through the eastern forest. It avoids the main road where bandits lurk.',
      'The merchant Ingram always has a discount for friends of mine. Just mention my name.',
      'There is a hidden cache near the old mill. I placed it there for emergencies. It is yours now.'
    ];
    dialogueText = U.pick(favors);
    npc.playerRelation += 5;
    Game.Player.gainSkill('speech', 0.2);
    rebuildWithBack();
  }

  // ─── Standard Response Handlers ────────────────────────────────────────────

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

  function respondLifestyle() {
    var npc = currentNPC;
    var lines = {
      family: 'Most everything I do is for my family. A steady day and safe home is enough for me.',
      ambitious: 'I am not content to stay where I am. Every day is a step toward something greater.',
      devout: 'Routine keeps me grounded - prayer, work, and trying to live honorably.',
      frugal: 'I keep my purse tight and my plans practical. Waste ruins good folk.',
      hedonist: 'Life is short. Better to enjoy it while we can.',
      outdoorsy: 'I sleep best after a day under open skies.',
      scholarly: 'I like to learn before I act. Knowledge saves lives.',
      community: 'A town survives when people look after one another.'
    };
    dialogueText = lines[npc.lifestyle] || 'I live one day at a time, like most people.';
    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.04);
    rebuildWithBack();
  }

  function respondJob() {
    var npc = currentNPC;
    var jobLabel = Game.NPC.getJobLabel(npc.job);
    dialogueText = 'I work as a ' + jobLabel.toLowerCase() + '. It is honest work, and it keeps food on the table.';
    if (npc.job === 'guard') dialogueText = 'I serve as a guard. We keep this place safe. The law is clear - break it and face the consequences.';
    if (npc.job === 'bandit') dialogueText = 'Work? We take what we need. The road is our trade.';
    if (npc.job === 'healer') dialogueText = 'I tend to the sick and injured. Everyone deserves care. Though I cannot help those who bring trouble upon themselves.';
    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.03);
    rebuildWithBack();
  }

  function respondRelationships() {
    var npc = currentNPC;
    if (!npc.relationships || npc.relationships.length === 0) {
      dialogueText = 'I mostly keep to myself.';
      rebuildWithBack();
      return;
    }

    var rel = U.pick(npc.relationships);
    var others = Game.NPC.getNPCs();
    var other = others[rel.withId];
    var person = other ? other.name.full : 'someone around town';
    var tone = rel.affinity >= 20 ? 'We get on well.' : (rel.affinity <= -20 ? 'We do not see eye to eye.' : 'Things are... manageable.');

    if (rel.type === 'family') dialogueText = person + ' is family. ' + tone;
    else if (rel.type === 'friend') dialogueText = person + ' is a good friend. ' + tone;
    else if (rel.type === 'rival') dialogueText = person + ' is my rival. ' + tone;
    else if (rel.type === 'partner') dialogueText = person + ' is my partner. ' + tone;
    else dialogueText = person + ' and I work together often. ' + tone;

    // Emotional context
    if (npc.emotion === 'scared' && other) {
      dialogueText += ' I hope ' + other.name.first + ' is safe after what happened.';
    }

    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.05);
    rebuildWithBack();
  }

  function respondRumors() {
    var rumors = [];
    var pState = Game.Player.getState();

    // Recent crimes
    if (Game.Law && Game.Law.getRecentCrimes) {
      var crimes = Game.Law.getRecentCrimes();
      if (crimes.length > 0) {
        var lastCrime = crimes[crimes.length - 1];
        rumors.push('I heard there was a ' + lastCrime.type + ' committed nearby. The guards are on alert.');
        rumors.push('Someone has been causing trouble. The captain doubled the watch.');
      }
    }

    // Alert state rumors
    var alertState = Game.Law.getAlertState ? Game.Law.getAlertState() : { level: 0 };
    if (alertState.level >= 2) {
      rumors.push('There is a manhunt on. A dangerous criminal is at large. Lock your doors.');
      rumors.push('I saw a dozen guards heading south. Something serious has happened.');
    } else if (alertState.level >= 1) {
      rumors.push('The guards are edgy lately. Something has them riled up.');
    }

    // NPC gossip memory
    if (currentNPC.gossipMemory && currentNPC.gossipMemory.length > 0) {
      var gm = currentNPC.gossipMemory[currentNPC.gossipMemory.length - 1];
      if (gm.crime) {
        rumors.push('Word is there was a ' + gm.crime + ' not far from here. I heard it from ' + (gm.fromNpcName || 'someone in town') + '.');
      }
    }

    // World news
    if (Game.Ambient && Game.Ambient.getWorldNews) {
      var news = Game.Ambient.getWorldNews();
      for (var i = Math.max(0, news.length - 3); i < news.length; i++) {
        rumors.push(news[i]);
      }
    }

    // Weather
    if (Game.Ambient) {
      var w = Game.Ambient.getWeather();
      if (w.type === 'storm') rumors.push('This storm is fierce. I hope the roads hold.');
      if (w.type === 'rain') rumors.push('The rains have been heavy. The river may flood.');
    }

    // Generic
    rumors.push('They say the eastern forest is home to a band of outlaws led by a man called Lothar Voss.');
    rumors.push('The King grows old. Some nobles whisper about succession.');
    rumors.push('Grain prices have been rising. Hard times ahead.');
    rumors.push('A merchant was robbed on the road last week.');
    rumors.push('I hear deer have been seen near the village. Good hunting perhaps.');

    // Reputation-based
    if (pState.reputation.global < -10) {
      rumors.push('There is someone causing trouble around here. People are nervous.');
    }
    if (pState.reputation.global > 15) {
      rumors.push('Word of your deeds has spread. People respect you.');
    }

    // Bounty gossip
    if (pState.bounty > 0) {
      rumors.push('I heard the guards are looking for someone with a bounty on their head. Strange business.');
    }

    dialogueText = U.pick(rumors);
    currentNPC.playerRelation += 1;
    Game.Player.gainSkill('speech', 0.03);
    rebuildWithBack();
  }

  function openTrade() {
    tradeMode = true;
    var npc = currentNPC;
    var pRep = Game.Player.getState().reputation.global;

    // Relationship/reputation affects trade greeting
    if (npc.playerRelation > 20 || pRep > 20) {
      dialogueText = 'For a friend, I always have the best. Have a look.';
    } else if (npc.playerRelation < -10) {
      dialogueText = 'Fine. But do not expect any favors.';
    } else {
      dialogueText = 'Take a look at what I have.';
    }

    options = [];
    for (var i = 0; i < npc.inventory.length; i++) {
      var item = npc.inventory[i];
      var price = Game.Economy.getBuyPrice(item, currentNPC);
      // Reputation discount
      if (pRep > 25 || npc.playerRelation > 20) price = Math.max(1, Math.floor(price * 0.85));
      options.push({
        text: 'Buy ' + item.name + ' (' + price + 'g)',
        action: 'buyItem',
        data: { index: i, price: price }
      });
    }

    var pInv = Game.Player.getState().inventory;
    for (var i = 0; i < pInv.length; i++) {
      var item = pInv[i];
      var ps = Game.Player.getState();
      if (item.type !== 'weapon' || !ps.equipped.weapon || ps.equipped.weapon.id !== item.id) {
        var sellPrice = Game.Economy.getSellPrice(item, currentNPC);
        if (item.stolen) sellPrice = Math.floor(sellPrice * 0.5); // fenced goods worth less
        options.push({
          text: 'Sell ' + item.name + (item.stolen ? ' [stolen]' : '') + ' (' + sellPrice + 'g)',
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
        if (item.healAmount) {
          Game.Player.heal(item.healAmount);
          dialogueText = 'Here you go. ' + item.name + ' - enjoy.';
        }
      }
    } else {
      dialogueText = 'You cannot afford that.';
    }
    openTrade();
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
    // Rep discount at the tavern
    if (player.reputation.global > 20 || currentNPC.playerRelation > 20) cost = 7;
    if (player.gold >= cost) {
      player.gold -= cost;
      if (Game.advanceTime) Game.advanceTime(8 * 60);
      player.health = player.maxHealth;
      player.stamina = player.maxStamina;
      player.bleeding = 0;
      player.wounds = [];
      if (Game.Needs) Game.Needs.sleep(8);
      dialogueText = 'Sleep well, friend. Room and board for the night. You look better already.';
      player.daysAlive++;
      currentNPC.playerRelation += 2;
    } else {
      dialogueText = 'That will be ' + cost + ' gold for a room. Come back when you can pay.';
    }
    rebuildWithBack();
  }

  function respondBuyMeal() {
    var cost = 3;
    var player = Game.Player.getState();
    if (player.gold >= cost) {
      player.gold -= cost;
      Game.Player.addItem({ id: 'tavern_meal', name: 'Tavern Meal', type: 'food', value: 3, qty: 1,
                            healAmount: 12, satiation: 35, hydration: 25 });
      Game.Player.heal(12);
      if (Game.Needs) Game.Needs.eat({ satiation: 35, hydration: 25, name: 'Tavern Meal' });
      dialogueText = 'Here you go - a hot meal and some ale. That will keep you going!';
      currentNPC.playerRelation += 2;
    } else {
      dialogueText = 'A meal and ale costs ' + cost + ' gold. Short on coin?';
    }
    rebuildWithBack();
  }

  function respondBrewPotions() {
    var player = Game.Player.getState();
    var herbTypes = { yarrow: 'antibleed', valerian: 'sleep', chamomile: 'food',
                      garlic: 'antiseptic', elderflower: 'health' };
    var brewed = [];
    var cost = 5;

    for (var herbId in herbTypes) {
      var herb = Game.Player.hasItem(herbId);
      if (herb) {
        var totalCost = herb.qty * cost;
        if (player.gold >= totalCost) {
          player.gold -= totalCost;
          Game.Player.removeItem(herbId, herb.qty);
          var potion = makePotionFromHerb(herbId, herb.qty);
          if (potion) { Game.Player.addItem(potion); brewed.push(herb.qty + 'x ' + potion.name); }
        }
      }
    }

    if (brewed.length > 0) {
      dialogueText = 'Done! Brewed you: ' + brewed.join(', ') + '. Use them wisely.';
      currentNPC.playerRelation += 3;
      Game.Player.gainSkill('herbalism', 0.8);
    } else {
      dialogueText = 'You do not have enough gold to pay the brewing fee, or no herbs I can work with.';
    }
    rebuildWithBack();
  }

  function makePotionFromHerb(herbId, qty) {
    var potions = {
      yarrow:      { id: 'potion_antibleed', name: 'Yarrow Salve', type: 'potion', value: 12, qty: qty, healAmount: 5, stopsBleeding: true, desc: 'Stops bleeding' },
      valerian:    { id: 'potion_sleep', name: 'Valerian Draught', type: 'potion', value: 14, qty: qty, healAmount: 3, restoresFatigue: 40, desc: 'Restores fatigue' },
      chamomile:   { id: 'potion_food', name: 'Chamomile Tea', type: 'food', value: 8, qty: qty, healAmount: 6, satiation: 25, hydration: 20, desc: 'Restores hunger & thirst' },
      garlic:      { id: 'potion_antiseptic', name: 'Garlic Poultice', type: 'potion', value: 10, qty: qty, healAmount: 8, clearsWounds: true, desc: 'Clears wounds' },
      elderflower: { id: 'potion_health', name: 'Elderflower Tonic', type: 'potion', value: 15, qty: qty, healAmount: 25, desc: 'Strong health restoration' }
    };
    return potions[herbId] || null;
  }

  function respondHealWounds() {
    var player = Game.Player.getState();
    var wounds = player.wounds || [];
    var cost = 8 + wounds.length * 4;
    // Friends of healer get a discount
    if (currentNPC.playerRelation > 15) cost = Math.floor(cost * 0.75);

    if (wounds.length === 0 && player.bleeding <= 0 && player.health >= player.maxHealth * 0.9) {
      dialogueText = 'You look fine to me. Come back when you are truly hurt.';
      rebuildWithBack();
      return;
    }

    if (player.gold >= cost) {
      player.gold -= cost;
      player.health = Math.min(player.maxHealth, player.health + 20 + wounds.length * 5);
      player.bleeding = 0;
      player.wounds = [];
      dialogueText = 'I have cleaned and bound your wounds. ' + cost + 'g. Rest up now.';
      currentNPC.playerRelation += 3;
    } else {
      dialogueText = 'Treating your wounds will cost ' + cost + ' gold. I cannot work for free.';
    }
    rebuildWithBack();
  }

  function respondRepairGear() {
    var player = Game.Player.getState();
    var totalCost = 0;
    var repaired = [];
    var wep = player.equipped.weapon;
    var arm = player.equipped.armor;

    if (wep && wep.durability !== undefined && wep.durability < 100) {
      totalCost += Math.ceil((100 - wep.durability) * 0.4);
    }
    if (arm && arm.durability !== undefined && arm.durability < 100) {
      totalCost += Math.ceil((100 - arm.durability) * 0.5);
    }

    if (totalCost === 0) {
      dialogueText = 'Your gear is in fine shape. Nothing to repair.';
      rebuildWithBack();
      return;
    }

    // Blacksmith friend discount
    if (currentNPC.playerRelation > 20) totalCost = Math.floor(totalCost * 0.8);

    if (player.gold >= totalCost) {
      player.gold -= totalCost;
      if (wep && wep.durability !== undefined) { wep.durability = 100; repaired.push(wep.name); }
      if (arm && arm.durability !== undefined) { arm.durability = 100; repaired.push(arm.name); }
      dialogueText = 'Good as new! Repaired: ' + repaired.join(', ') + '. Cost: ' + totalCost + 'g.';
      currentNPC.playerRelation += 2;
    } else {
      dialogueText = 'Repairs will cost ' + totalCost + 'g. You are short on gold.';
    }
    rebuildWithBack();
  }

  function respondPickpocket() {
    var npc = currentNPC;
    var player = Game.Player.getState();
    endDialogue();
    if (Game.Minigames && !Game.Minigames.isActive()) {
      Game.Minigames.startPickpocket(npc,
        function () {
          var goldStolen = Math.floor(5 + Math.random() * 20);
          player.gold += goldStolen;
          Game.Player.gainSkill('stealth', 1.5);
          if (Game.UI) Game.UI.showNotification('Pickpocketed ' + goldStolen + 'g from ' + npc.name.first + '.', 'success');
          Game.Law.reportCrime('theft', null, npc);
        },
        function () {
          npc.playerRelation -= 15;
          Game.Law.reportCrime('theft', null, npc);
          if (Game.UI) Game.UI.showNotification('Caught! ' + npc.name.first + ' noticed your hand in their pocket.', 'danger');
        }
      );
    }
  }

  function getPlayerHerbCount() {
    var player = Game.Player.getState();
    var count = 0;
    var herbIds = ['yarrow', 'valerian', 'chamomile', 'garlic', 'elderflower', 'nightshade'];
    for (var i = 0; i < player.inventory.length; i++) {
      var item = player.inventory[i];
      if (item.type === 'herb' || herbIds.indexOf(item.id) >= 0) count += (item.qty || 1);
    }
    return count;
  }

  function respondWork() {
    var loc = currentNPC && currentNPC.currentLocation ? currentNPC.currentLocation : 'wilderness';
    var jobs = Game.Economy && Game.Economy.getAvailableJobs ? Game.Economy.getAvailableJobs(loc) : [];

    var preferredByJob = {
      farmer: ['field_work', 'deliver_grain'],
      blacksmith: ['forge_bellows', 'haul_stone'],
      woodcutter: ['chop_wood'],
      carpenter: ['chop_wood', 'barrel_repair'],
      mason: ['haul_stone'],
      fisherman: ['dock_fishing'],
      baker: ['bakery_shift'],
      tailor: ['tailor_errands'],
      butcher: ['tannery_sort'],
      cooper: ['barrel_repair'],
      potter: ['clay_kiln'],
      guard: ['guard_duty']
    };

    var pref = preferredByJob[currentNPC.job] || [];
    var weighted = jobs.filter(function (j) { return pref.indexOf(j.id) >= 0; });
    var picked = weighted.length > 0 ? U.pick(weighted) : (jobs.length > 0 ? U.pick(jobs) : null);

    if (!picked) {
      dialogueText = 'I have no paid work for you right now. Check again later.';
      rebuildWithBack();
      return;
    }

    var result = Game.Economy.doJob(picked.id);
    if (!result) {
      dialogueText = 'Something went wrong with the work ledger. Try again.';
      rebuildWithBack();
      return;
    }

    currentNPC.playerRelation += 4;
    // Mark player as helped in NPC memory for positive reputation
    Game.NPC.addMemory(currentNPC, { type: 'playerHelped', time: Game.time });
    dialogueText = 'I can use help: ' + result.name + '. ' + (result.desc || '') + ' [+' + result.finalReward + ' gold]';
    if (result.skill) dialogueText += ' [+' + result.skill + ' skill]';
    rebuildWithBack();
  }

  function payBounty() {
    var player = Game.Player.getState();
    var bounty = player.bounty;
    if (player.gold >= bounty) {
      player.gold -= bounty;
      Game.Law.clearBounty();
      dialogueText = '"Your debt is paid. ' + bounty + ' gold. Stay out of trouble." ' + currentNPC.name.first + ' makes a note in their ledger.';
      currentNPC.playerRelation += 5;
      Game.Player.gainSkill('speech', 0.1);
    } else {
      dialogueText = 'You need ' + bounty + ' gold, but you only have ' + player.gold + '. You must come with me then.';
    }
    rebuildWithBack();
  }

  function respondPersuade() {
    var player = Game.Player.getState();
    var chance = player.skills.speech / 100;
    // Relationship and reputation boost
    chance += currentNPC.playerRelation / 200;
    chance += player.reputation.global / 300;

    if (U.rng() < chance) {
      var useful = [
        'Between you and me, the nobles are not happy with the King.',
        'The blacksmith in Ashford sells the best blades in the region.',
        'If you need quick coin, the tavern keeper always needs help.',
        'Watch the road at night. Bandits have been bold lately.',
        'The castle guard changes shift at dusk. Just so you know.',
        'I heard Lothar Voss is planning something big. Keep your eyes open.',
        'The healer has medicines not on open sale. Ask her directly.',
        'There is a cave east of the bandit camp that most people do not know about.',
        'One of the guards here owes money to a merchant. That could be useful information.'
      ];
      dialogueText = U.pick(useful);
      currentNPC.playerRelation += 3;
      Game.Player.gainSkill('speech', 0.15);
    } else {
      dialogueText = 'I do not know what you are talking about. Leave me be.';
      currentNPC.playerRelation -= 2;
    }
    rebuildWithBack();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function rebuildWithBack() {
    options = [{ text: 'Continue...', action: 'backToDialogue' }];
  }

  function endDialogue() {
    active = false;
    currentNPC = null;
    options = [];
    dialogueText = '';
    tradeMode = false;
    arrestMode = false;
  }

  function isActive() { return active; }
  function getText() { return dialogueText; }
  function getOptions() { return options; }
  function getCurrentNPC() { return currentNPC; }
  function isTrading() { return tradeMode; }
  function isArrestMode() { return arrestMode; }

  return {
    init: init, startDialogue: startDialogue,
    selectOption: selectOption, endDialogue: endDialogue,
    isActive: isActive, getText: getText, getOptions: getOptions,
    getCurrentNPC: getCurrentNPC, isTrading: isTrading, isArrestMode: isArrestMode
  };
})();
