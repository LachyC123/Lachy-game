var Game = Game || {};

// Global game state
Game.time = 420; // Start at 7:00 AM (7 * 60 minutes)
Game.day = 1;
Game.fps = 0;
Game.paused = false;
Game.initialized = false;
Game.TIME_SCALE = 2; // game minutes per real second

Game.advanceTime = function (minutes) {
  Game.time += minutes;
  while (Game.time >= 1440) { // 24 * 60
    Game.time -= 1440;
    Game.day++;
    Game.Player.getState().daysAlive++;
    Game.Economy.updateFluctuation();
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

    // Show loading
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.fillStyle = '#1a1510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#a08050';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Generating world...', canvas.width / 2, canvas.height / 2);

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
    Game.Player.init();
    Game.NPC.init();
    Game.Combat.init();
    Game.Dialogue.init();
    Game.Law.init();
    Game.Save.init();
    Game.Input.init();
    Game.Renderer.init(canvas);
    Game.UI.init(canvas);

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

    Game.UI.showNotification('Welcome to the frontier. You are a nobody. Make your mark.');
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
      Game.Economy.updateFluctuation();
    }

    // Update systems
    var blocking = Game.UI.isBlockingInput();

    if (!blocking) {
      Game.Player.update(dt);
      Game.Combat.update(dt);
    }

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
  }

  return { init: init };
})();

// Start when page loads
window.addEventListener('load', function () {
  Game.Main.init();
});
