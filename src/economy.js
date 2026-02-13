var Game = Game || {};

Game.Economy = (function () {
  var U = Game.Utils;

  // Base prices for items
  var BASE_PRICES = {
    bread: 2, ale: 3, stew: 5, grain: 8, tools: 15,
    cloth: 12, wood: 5, knife: 10, hatchet: 15,
    sword: 40, axe: 55, shield: 25,
    leather_armor: 35, chain_armor: 80,
    bandage: 5,
    herbs: 8, pelts: 15, wine: 8, spice: 25
  };

  // Supply modifiers per location (lower = cheaper due to surplus)
  var supplyMods = {
    ashford: { grain: 1.1, tools: 0.9, cloth: 1.0, wood: 1.1, spice: 0.95 },
    millhaven: { grain: 0.8, tools: 1.1, cloth: 1.2, wood: 1.0, bread: 0.9 },
    thornfield: { grain: 1.0, tools: 1.0, cloth: 1.2, wood: 0.7, pelts: 0.85 },
    wilderness: { grain: 1.2, tools: 1.15, cloth: 1.2, wood: 0.95 }
  };

  // Price fluctuation based on game time
  var fluctuation = {};

  // Job board
  var JOBS = [
    { id: 'chop_wood', name: 'Chop Wood', reward: 8, time: 90, skill: 'sword', location: 'any', minRep: -100, desc: 'Chop and stack timber for local workshops.' },
    { id: 'deliver_grain', name: 'Deliver Grain', reward: 15, time: 120, skill: null, location: 'millhaven', minRep: -10, desc: 'Carry grain sacks between farms and market.' },
    { id: 'field_work', name: 'Field Work', reward: 10, time: 100, skill: null, location: 'millhaven', minRep: -30, desc: 'Weeding, hoeing, and irrigation labor.' },
    { id: 'guard_duty', name: 'Guard Duty', reward: 12, time: 120, skill: 'sword', location: 'ashford', minRep: 0, desc: 'Assist watch patrols and gate checks.' },
    { id: 'forge_bellows', name: 'Work the Bellows', reward: 14, time: 110, skill: null, location: 'ashford', minRep: -20, desc: 'Keep forge temperatures stable for smiths.' },
    { id: 'haul_stone', name: 'Haul Stone', reward: 16, time: 130, skill: null, location: 'ashford', minRep: -15, desc: 'Move cut stone for masons and builders.' },
    { id: 'dock_fishing', name: 'River Fishing Shift', reward: 13, time: 120, skill: 'stealth', location: 'millhaven', minRep: -25, desc: 'Set nets and sort morning catches.' },
    { id: 'bakery_shift', name: 'Bakery Shift', reward: 11, time: 95, skill: null, location: 'ashford', minRep: -10, desc: 'Knead dough and tend ovens.' },
    { id: 'tailor_errands', name: 'Tailor Errands', reward: 10, time: 85, skill: 'speech', location: 'ashford', minRep: -20, desc: 'Deliver garments and collect payments.' },
    { id: 'tannery_sort', name: 'Sort Hides', reward: 12, time: 105, skill: null, location: 'thornfield', minRep: -30, desc: 'Clean and sort hides for processing.' },
    { id: 'clay_kiln', name: 'Kiln Firing', reward: 13, time: 100, skill: null, location: 'ashford', minRep: -20, desc: 'Load and monitor ceramic kiln batches.' },
    { id: 'barrel_repair', name: 'Barrel Repair', reward: 12, time: 95, skill: null, location: 'millhaven', minRep: -25, desc: 'Patch cracked staves and tighten hoops.' }
  ];

  function init() {
    fluctuation = {};
    for (var item in BASE_PRICES) {
      fluctuation[item] = 1.0 + (U.rng() - 0.5) * 0.2;
    }
  }

  function updateFluctuation() {
    for (var item in fluctuation) {
      fluctuation[item] += (U.rng() - 0.5) * 0.02;
      fluctuation[item] = U.clamp(fluctuation[item], 0.7, 1.3);
    }
  }

  function getBasePrice(item) {
    return BASE_PRICES[item.id] || item.value || 5;
  }

  function getBuyPrice(item, merchant) {
    var base = getBasePrice(item);
    var fluct = fluctuation[item.id] || 1.0;

    var loc = merchant ? merchant.currentLocation : 'wilderness';
    var locMod = 1.0;
    if (supplyMods[loc] && supplyMods[loc][item.id]) {
      locMod = supplyMods[loc][item.id];
    }

    var speechDiscount = 1 - Game.Player.getState().skills.speech * 0.002;
    speechDiscount = Math.max(0.8, speechDiscount);

    var relDiscount = 1.0;
    if (merchant && merchant.playerRelation > 10) relDiscount = 0.9;
    else if (merchant && merchant.playerRelation < -10) relDiscount = 1.15;

    return Math.max(1, Math.round(base * fluct * locMod * speechDiscount * relDiscount));
  }

  function getSellPrice(item, merchant) {
    var buyPrice = getBuyPrice(item, merchant);
    var ratio = 0.4 + Game.Player.getState().skills.speech * 0.002;
    ratio = Math.min(0.7, ratio);
    return Math.max(1, Math.round(buyPrice * ratio));
  }

  function getAvailableJobs(location) {
    var p = Game.Player.getState();
    var weather = Game.Ambient ? Game.Ambient.getWeather() : { type: 'clear' };
    return JOBS.filter(function (j) {
      if (!(j.location === 'any' || j.location === location)) return false;
      if (p.reputation.global < (j.minRep || -100)) return false;
      if ((j.id === 'dock_fishing' || j.id === 'river_fishing') && weather.type === 'storm') return false;
      return true;
    });
  }

  function getScaledReward(job) {
    var p = Game.Player.getState();
    var hour = Game.time ? ((Game.time / 60) % 24) : 12;
    var weather = Game.Ambient ? Game.Ambient.getWeather() : { type: 'clear', intensity: 0 };

    var reward = job.reward;
    reward *= 1 + U.clamp(p.skills.speech, 0, 60) * 0.002; // negotiation edge
    if (hour >= 20 || hour < 5) reward *= 1.2; // night shift premium
    if (weather.type === 'rain' || weather.type === 'storm') reward *= 1.12;
    if (p.reputation.global > 25) reward *= 1.08;
    if (p.reputation.global < -25) reward *= 0.9;

    return Math.max(1, Math.round(reward));
  }

  function doJob(jobId) {
    for (var i = 0; i < JOBS.length; i++) {
      if (JOBS[i].id === jobId) {
        var job = JOBS[i];
        var p = Game.Player.getState();
        var finalReward = getScaledReward(job);
        p.gold += finalReward;

        if (Game.advanceTime) Game.advanceTime(job.time);
        if (job.skill) Game.Player.gainSkill(job.skill, 0.12);
        Game.Player.gainSkill('speech', 0.03);
        p.reputation.global = U.clamp(p.reputation.global + 1, -100, 100);

        var result = {};
        for (var k in job) result[k] = job[k];
        result.finalReward = finalReward;
        return result;
      }
    }
    return null;
  }

  function getSerializable() {
    return { fluctuation: fluctuation };
  }

  function loadState(data) {
    if (data && data.fluctuation) fluctuation = data.fluctuation;
  }

  return {
    init: init, updateFluctuation: updateFluctuation,
    getBuyPrice: getBuyPrice, getSellPrice: getSellPrice,
    getAvailableJobs: getAvailableJobs, doJob: doJob,
    getSerializable: getSerializable, loadState: loadState
  };
})();
