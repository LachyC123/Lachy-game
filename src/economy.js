var Game = Game || {};

Game.Economy = (function () {
  var U = Game.Utils;

  // Base prices for items
  var BASE_PRICES = {
    bread: 2, ale: 3, stew: 5, grain: 8, tools: 15,
    cloth: 12, wood: 5, knife: 10, hatchet: 15,
    sword: 40, axe: 55, shield: 25,
    leather_armor: 35, chain_armor: 80,
    bandage: 5
  };

  // Supply modifiers per location (lower = cheaper due to surplus)
  var supplyMods = {
    ashford: { grain: 1.1, tools: 0.9, cloth: 1.0, wood: 1.1 },
    millhaven: { grain: 0.8, tools: 1.1, cloth: 1.2, wood: 1.0 },
    thornfield: { grain: 1.0, tools: 1.0, cloth: 1.2, wood: 0.7 }
  };

  // Price fluctuation based on game time
  var fluctuation = {};

  function init() {
    fluctuation = {};
    // Pre-generate some fluctuation
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

    // Location modifier
    var loc = merchant ? merchant.currentLocation : 'wilderness';
    var locMod = 1.0;
    if (supplyMods[loc] && supplyMods[loc][item.id]) {
      locMod = supplyMods[loc][item.id];
    }

    // Speech skill discount
    var speechDiscount = 1 - Game.Player.getState().skills.speech * 0.002;
    speechDiscount = Math.max(0.8, speechDiscount);

    // Relationship discount
    var relDiscount = 1.0;
    if (merchant && merchant.playerRelation > 10) {
      relDiscount = 0.9;
    } else if (merchant && merchant.playerRelation < -10) {
      relDiscount = 1.15;
    }

    return Math.max(1, Math.round(base * fluct * locMod * speechDiscount * relDiscount));
  }

  function getSellPrice(item, merchant) {
    var buyPrice = getBuyPrice(item, merchant);
    // Sell for about 40-60% of buy price
    var ratio = 0.4 + Game.Player.getState().skills.speech * 0.002;
    ratio = Math.min(0.7, ratio);
    return Math.max(1, Math.round(buyPrice * ratio));
  }

  // Job rewards
  var JOBS = [
    { id: 'chop_wood', name: 'Chop Wood', reward: 8, time: 90, skill: null, location: 'any' },
    { id: 'deliver_grain', name: 'Deliver Grain', reward: 15, time: 120, skill: null, location: 'millhaven' },
    { id: 'field_work', name: 'Field Work', reward: 10, time: 100, skill: null, location: 'millhaven' },
    { id: 'guard_duty', name: 'Guard Duty', reward: 12, time: 120, skill: 'sword', location: 'ashford' }
  ];

  function getAvailableJobs(location) {
    return JOBS.filter(function (j) {
      return j.location === 'any' || j.location === location;
    });
  }

  function doJob(jobId) {
    for (var i = 0; i < JOBS.length; i++) {
      if (JOBS[i].id === jobId) {
        var job = JOBS[i];
        Game.Player.getState().gold += job.reward;
        if (Game.advanceTime) Game.advanceTime(job.time);
        if (job.skill) Game.Player.gainSkill(job.skill, 0.1);
        Game.Player.getState().reputation.global += 1;
        return job;
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
