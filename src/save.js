var Game = Game || {};

Game.Save = (function () {
  var SAVE_KEY = 'medieval_sandbox_save';
  var AUTO_SAVE_INTERVAL = 120; // seconds
  var autoSaveTimer = 0;

  function init() {
    autoSaveTimer = 0;
  }

  function update(dt) {
    autoSaveTimer += dt;
    if (autoSaveTimer >= AUTO_SAVE_INTERVAL) {
      autoSaveTimer = 0;
      save(true);
    }
  }

  function save(isAuto) {
    try {
      var data = {
        version: 1,
        timestamp: Date.now(),
        isAuto: !!isAuto,
        time: Game.time || 0,
        day: Game.day || 1,
        player: Game.Player.getState(),
        npcs: Game.NPC.getSerializable(),
        law: Game.Law.getSerializable(),
        economy: Game.Economy.getSerializable()
      };

      // Clean player state for serialization
      var pClean = {};
      var ps = data.player;
      pClean.x = ps.x;
      pClean.y = ps.y;
      pClean.health = ps.health;
      pClean.maxHealth = ps.maxHealth;
      pClean.stamina = ps.stamina;
      pClean.maxStamina = ps.maxStamina;
      pClean.alive = ps.alive;
      pClean.skills = ps.skills;
      pClean.reputation = ps.reputation;
      pClean.socialClass = ps.socialClass;
      pClean.inventory = ps.inventory;
      pClean.equipped = {
        weapon: ps.equipped.weapon ? ps.equipped.weapon.id : null,
        armor: ps.equipped.armor ? ps.equipped.armor.id : null
      };
      pClean.gold = ps.gold;
      pClean.bounty = ps.bounty;
      pClean.killCount = ps.killCount;
      pClean.daysAlive = ps.daysAlive;
      pClean.bleeding = ps.bleeding;
      data.player = pClean;

      localStorage.setItem(SAVE_KEY, JSON.stringify(data));

      if (!isAuto) {
        Game.UI.showNotification('Game saved.');
      }
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        Game.UI.showNotification('No save found.');
        return false;
      }
      var data = JSON.parse(raw);
      if (!data || data.version !== 1) {
        Game.UI.showNotification('Incompatible save.');
        return false;
      }

      // Restore time
      Game.time = data.time || 0;
      Game.day = data.day || 1;

      // Restore player
      var ps = Game.Player.getState();
      var pd = data.player;
      ps.x = pd.x;
      ps.y = pd.y;
      ps.health = pd.health;
      ps.maxHealth = pd.maxHealth || 100;
      ps.stamina = pd.stamina;
      ps.alive = pd.alive;
      ps.skills = pd.skills;
      ps.reputation = pd.reputation;
      ps.socialClass = pd.socialClass;
      ps.gold = pd.gold;
      ps.bounty = pd.bounty || 0;
      ps.killCount = pd.killCount || 0;
      ps.daysAlive = pd.daysAlive || 0;
      ps.bleeding = pd.bleeding || 0;
      if (pd.inventory) ps.inventory = pd.inventory;

      // Re-equip
      if (pd.equipped) {
        ps.equipped.weapon = null;
        ps.equipped.armor = null;
        if (pd.equipped.weapon) {
          for (var i = 0; i < ps.inventory.length; i++) {
            if (ps.inventory[i].id === pd.equipped.weapon) {
              ps.equipped.weapon = ps.inventory[i];
              break;
            }
          }
        }
        if (pd.equipped.armor) {
          for (var i = 0; i < ps.inventory.length; i++) {
            if (ps.inventory[i].id === pd.equipped.armor) {
              ps.equipped.armor = ps.inventory[i];
              break;
            }
          }
        }
      }

      // Restore NPCs
      if (data.npcs) Game.NPC.loadState(data.npcs);

      // Restore law
      if (data.law) Game.Law.loadState(data.law);

      // Restore economy
      if (data.economy) Game.Economy.loadState(data.economy);

      Game.UI.showNotification('Game loaded.');
      return true;
    } catch (e) {
      console.error('Load failed:', e);
      return false;
    }
  }

  function hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  function deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  return {
    init: init, update: update,
    save: save, load: load,
    hasSave: hasSave, deleteSave: deleteSave
  };
})();
