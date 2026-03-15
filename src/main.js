var Game = Game || {};

// Global game state
Game.time = 420; // Start at 7:00 AM (7 * 60 minutes)
Game.day = 1;
Game.fps = 0;
Game.paused = false;
Game.initialized = false;
Game.TIME_SCALE = 2; // game minutes per real second

Game.onNewDay = function () {
  var p = Game.Player.getState();
  var summary = 'Day ' + Game.day + ': a new dawn.';

  // Passive recovery depends on fatigue/sleep
  var ns = Game.Needs ? Game.Needs.getState() : { fatigue: 50 };
  var restQuality = Math.max(0, 1 - ns.fatigue / 100);
  p.health = Math.min(p.maxHealth, p.health + Math.round(5 + restQuality * 10));
  p.stamina = Math.min(p.maxStamina, p.stamina + Math.round(10 + restQuality * 15));
  p.bleeding = Math.max(0, p.bleeding - 1.0);

  // Economy and world news pulse
  Game.Economy.updateFluctuation();
  if (Game.Ambient && Game.Ambient.addNews) {
    Game.Ambient.addNews((function(){
      var news = [
        'Merchants reset their ledgers at dawn.',
        'Labor contracts were posted at first light.',
        'Fresh caravans arrived with new goods.',
        'A new day of work begins across the settlements.'
      ];
      return news[Math.floor(Math.random() * news.length)];
    })());
  }

  if (Game.UI && Game.UI.showNotification) {
    Game.UI.showNotification(summary + ' You feel somewhat rested.');
  }
};

Game.advanceTime = function (minutes) {
  Game.time += minutes;
  while (Game.time >= 1440) { // 24 * 60
    Game.time -= 1440;
    Game.day++;
    Game.Player.getState().daysAlive++;
    Game.onNewDay();
  }
};

Game.Main = (function () {
  var canvas;
  var lastTime = 0;
  var fpsFrames = 0;
  var fpsTimer = 0;
  var loadingDone = false;

  function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }

    // Show cinematic loading screen
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var W = canvas.width, H = canvas.height;

    // Dark background
    ctx.fillStyle = '#100c06';
    ctx.fillRect(0, 0, W, H);

    // Radial glow center
    var grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W,H)*0.5);
    grd.addColorStop(0, 'rgba(80,50,10,0.4)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.font = 'bold 32px serif';
    ctx.fillStyle = '#c8a840';
    ctx.textAlign = 'center';
    ctx.fillText('ASHFORD', W/2, H/2 - 40);
    ctx.font = '16px serif';
    ctx.fillStyle = '#806030';
    ctx.fillText('Frontier Kingdom', W/2, H/2 - 10);

    // Divider
    ctx.strokeStyle = 'rgba(160,120,40,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2-100, H/2+12); ctx.lineTo(W/2+100, H/2+12); ctx.stroke();

    // Loading text
    ctx.font = '13px serif';
    ctx.fillStyle = '#907050';
    ctx.fillText('Generating the frontier...', W/2, H/2 + 38);

    // Use setTimeout to allow the loading screen to render
    setTimeout(function () {
      doInit();
    }, 50);
  }

  function doInit() {
    // Initialize all systems
    Game.World.init(42);
    Game.Economy.init();
    Game.Ambient.init();
    Game.Needs.init();
    Game.Player.init();
    Game.NPC.init();
    Game.Combat.init();
    Game.Dialogue.init();
    Game.Law.init();
    Game.Save.init();
    Game.Input.init();
    Game.Renderer.init(canvas);
    Game.UI.init(canvas);
    Game.Minigames.init(canvas);

    // Try to load save
    if (Game.Save.hasSave()) {
      // Don't auto-load, let player decide
    }

    Game.initialized = true;
    loadingDone = true;

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Handle resize
    window.addEventListener('resize', function () {
      Game.Renderer.resize();
      Game.UI.resize();
    });

    // Prevent context menu
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    setTimeout(function () {
      Game.UI.showNotification('Welcome to Ashford. You are a nobody — make your mark.', 'info');
    }, 500);
    setTimeout(function () {
      Game.UI.showNotification('F key or hold E to forage herbs in the forest.', 'info');
    }, 3000);
    setTimeout(function () {
      Game.UI.showNotification('Eat, drink, and sleep to keep your strength.', 'warning');
    }, 5500);
  }

  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap dt to prevent large jumps
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;

    // FPS counter
    fpsFrames++;
    fpsTimer += dt;
    if (fpsTimer >= 1) {
      Game.fps = fpsFrames;
      fpsFrames = 0;
      fpsTimer -= 1;
    }

    if (!loadingDone || Game.paused) return;

    // Update game time
    Game.time += Game.TIME_SCALE * dt;
    while (Game.time >= 1440) {
      Game.time -= 1440;
      Game.day++;
      Game.Player.getState().daysAlive++;
      Game.onNewDay();
    }

    // Update systems
    var blocking = Game.UI.isBlockingInput() || (Game.Minigames && Game.Minigames.isActive());

    if (!blocking) {
      Game.Needs.update(dt);
      Game.Player.update(dt);
      Game.Combat.update(dt);
    }

    if (Game.Minigames) Game.Minigames.update(dt);

    Game.NPC.update(dt);
    Game.Law.update(dt);
    Game.Ambient.update(dt);
    Game.Ambient.updateConversations(dt);
    Game.Save.update(dt);
    Game.Input.update();
    Game.UI.update(dt);

    // Render
    Game.Renderer.updateCamera(dt);
    Game.Renderer.render();
    Game.UI.render();
    if (Game.Minigames) Game.Minigames.render();
  }

  return { init: init };
})();

// Start when page loads
window.addEventListener('load', function () {
  Game.Main.init();
});
