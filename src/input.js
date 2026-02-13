var Game = Game || {};

Game.Input = (function () {
  // State
  var keys = {};
  var joystick = { active: false, dx: 0, dy: 0, touchId: null };
  var buttons = { attack: false, heavyAttack: false, block: false, dodge: false, interact: false };
  var buttonTimers = { attack: 0, heavyAttack: 0, block: 0, dodge: 0, interact: 0 };
  var joystickCenter = { x: 0, y: 0 };
  var joystickPos = { x: 0, y: 0 };
  var JOYSTICK_RADIUS = 50;
  var JOYSTICK_DEADZONE = 8;
  var touchIds = {};
  var mousePos = { x: 0, y: 0 };
  var tapped = false;
  var tapPos = { x: 0, y: 0 };

  function init() {
    // Keyboard
    document.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      e.preventDefault();
    });
    document.addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });

    // Touch
    var canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Mouse fallback for desktop
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);

    // Prevent zoom / scroll
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); });
  }

  function onTouchStart(e) {
    e.preventDefault();
    var W = window.innerWidth;
    var H = window.innerHeight;

    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var x = t.clientX, y = t.clientY;

      // Left side = joystick zone
      if (x < W * 0.4 && !joystick.active) {
        joystick.active = true;
        joystick.touchId = t.identifier;
        joystickCenter.x = x;
        joystickCenter.y = y;
        joystickPos.x = x;
        joystickPos.y = y;
        joystick.dx = 0;
        joystick.dy = 0;
      } else {
        // Check button zones (right side)
        touchIds[t.identifier] = { x: x, y: y };
        checkButtonPress(x, y, true);
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === joystick.touchId) {
        joystickPos.x = t.clientX;
        joystickPos.y = t.clientY;
        var dx = joystickPos.x - joystickCenter.x;
        var dy = joystickPos.y - joystickCenter.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < JOYSTICK_DEADZONE) {
          joystick.dx = 0;
          joystick.dy = 0;
        } else {
          if (dist > JOYSTICK_RADIUS) {
            dx = dx / dist * JOYSTICK_RADIUS;
            dy = dy / dist * JOYSTICK_RADIUS;
            joystickPos.x = joystickCenter.x + dx;
            joystickPos.y = joystickCenter.y + dy;
          }
          joystick.dx = dx / JOYSTICK_RADIUS;
          joystick.dy = dy / JOYSTICK_RADIUS;
        }
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === joystick.touchId) {
        joystick.active = false;
        joystick.touchId = null;
        joystick.dx = 0;
        joystick.dy = 0;
      } else {
        if (touchIds[t.identifier]) {
          checkButtonPress(touchIds[t.identifier].x, touchIds[t.identifier].y, false);
          delete touchIds[t.identifier];
        }
      }
    }
  }

  // Button zones are defined by UI module, we check against them
  var buttonZones = [];

  function registerButton(name, x, y, w, h) {
    buttonZones.push({ name: name, x: x, y: y, w: w, h: h });
  }

  function clearButtons() {
    buttonZones = [];
  }

  function checkButtonPress(tx, ty, pressed) {
    for (var i = 0; i < buttonZones.length; i++) {
      var b = buttonZones[i];
      if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
        if (pressed) {
          buttons[b.name] = true;
          buttonTimers[b.name] = 5; // frames buffer
        }
      }
    }
  }

  function onMouseDown(e) {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
    tapped = true;
    tapPos.x = e.clientX;
    tapPos.y = e.clientY;
    checkButtonPress(e.clientX, e.clientY, true);
  }

  function onMouseMove(e) {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
  }

  function onMouseUp(e) {
    checkButtonPress(e.clientX, e.clientY, false);
  }

  function getMovement() {
    var dx = 0, dy = 0;

    // Keyboard (WASD + arrows)
    if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

    // Joystick
    if (joystick.active) {
      dx += joystick.dx;
      dy += joystick.dy;
    }

    // Normalize
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dx /= len; dy /= len; }

    return { x: dx, y: dy };
  }

  function isAction(name) {
    // Keyboard mappings
    if (name === 'attack' && keys['KeyJ']) return true;
    if (name === 'heavyAttack' && keys['KeyK']) return true;
    if (name === 'block' && keys['KeyL']) return true;
    if (name === 'dodge' && (keys['Space'] || keys['ShiftLeft'])) return true;
    if (name === 'interact' && keys['KeyE']) return true;
    if (name === 'inventory' && keys['KeyI']) return true;
    if (name === 'save' && keys['F5']) return true;
    if (name === 'load' && keys['F9']) return true;
    if (name === 'debug' && keys['F3']) return true;

    // Touch buttons
    if (buttons[name] || buttonTimers[name] > 0) return true;
    return false;
  }

  function consumeAction(name) {
    buttons[name] = false;
    buttonTimers[name] = 0;
    keys['KeyJ'] = false;
    keys['KeyK'] = false;
    keys['KeyL'] = false;
    keys['Space'] = false;
    keys['KeyE'] = false;
    keys['KeyI'] = false;
    keys['F5'] = false;
    keys['F9'] = false;
    keys['F3'] = false;
  }

  function update() {
    // Decay button timers
    for (var b in buttonTimers) {
      if (buttonTimers[b] > 0) buttonTimers[b]--;
      if (buttonTimers[b] <= 0) buttons[b] = false;
    }
    tapped = false;
  }

  function getJoystickState() {
    return {
      active: joystick.active,
      cx: joystickCenter.x,
      cy: joystickCenter.y,
      px: joystickPos.x,
      py: joystickPos.y,
      dx: joystick.dx,
      dy: joystick.dy,
      radius: JOYSTICK_RADIUS
    };
  }

  function isKeyDown(code) { return !!keys[code]; }
  function getTap() { return tapped ? { x: tapPos.x, y: tapPos.y } : null; }

  return {
    init: init, update: update,
    getMovement: getMovement, isAction: isAction, consumeAction: consumeAction,
    getJoystickState: getJoystickState,
    registerButton: registerButton, clearButtons: clearButtons,
    isKeyDown: isKeyDown, getTap: getTap
  };
})();
