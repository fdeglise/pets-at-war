// Keyboard, mouse, pointer lock and touch controls.

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDown: false,
  rightDown: false,
  dx: 0,
  dy: 0,
  wheel: 0,
  locked: false,
  touchMove: { x: 0, y: 0 },
  touchActive: false,
  canvas: null,

  init(canvas, onLockChange) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.rightDown) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (onLockChange) onLockChange(this.locked);
    });
  },

  // Label for a physical key on the user's keyboard layout (e.g. KeyW shows "Z" on AZERTY).
  layout: null,
  async loadLayout() {
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) this.layout = await navigator.keyboard.getLayoutMap();
    } catch (e) {
      this.layout = null;
    }
  },
  label(code) {
    const fixed = { Space: 'Space', ShiftLeft: 'Shift', Tab: 'Tab', Escape: 'Esc' };
    if (fixed[code]) return fixed[code];
    const l = this.layout && this.layout.get(code);
    if (l) return l.toUpperCase();
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  },

  requestLock() {
    if (this.touchActive || !this.canvas || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* pointer lock is optional */
    }
  },
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  },
  down(code) {
    return this.keys.has(code);
  },
  hit(code) {
    return this.pressed.has(code);
  },
  endFrame() {
    this.pressed.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  },

  // ---- touch: left half = joystick, right half = camera drag, buttons on the right ----
  initTouch(root) {
    const wrap = document.createElement('div');
    wrap.id = 'touch';
    wrap.innerHTML = `
      <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
      <div class="tbtns">
        <button class="tb big" data-hold="attack" aria-label="Attack">ATK</button>
        <button class="tb" data-key="Space" aria-label="Jump">JUMP</button>
        <button class="tb" data-key="KeyE" aria-label="Interact">E</button>
        <button class="tb" data-key="KeyQ" aria-label="Pet heal">Q</button>
        <button class="tb" data-key="KeyR" aria-label="Next weapon">SWAP</button>
        <button class="tb" data-key="KeyB" aria-label="Shop">SHOP</button>
      </div>`;
    root.appendChild(wrap);
    const stick = wrap.querySelector('#stick');
    const knob = wrap.querySelector('#knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;

    window.addEventListener('touchstart', (e) => {
      if (!this.touchActive) {
        this.touchActive = true;
        document.body.classList.add('touch');
      }
      for (const t of e.changedTouches) {
        const onBtn = t.target.closest && t.target.closest('.tb, #panel, #menu, #pause, #gameover, button');
        if (onBtn) continue;
        if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = sx - 60 + 'px';
          stick.style.top = sy - 60 + 'px';
          stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy), m = 50;
          if (l > m) { dx = (dx / l) * m; dy = (dy / l) * m; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchMove.x = dx / m;
          this.touchMove.y = -dy / m;
        } else if (t.identifier === lookId) {
          this.dx += (t.clientX - lx) * 1.6;
          this.dy += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.touchMove.x = 0; this.touchMove.y = 0;
          knob.style.transform = '';
          stick.classList.remove('on');
        } else if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    wrap.querySelectorAll('.tb').forEach((b) => {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (b.dataset.hold === 'attack') this.mouseDown = true;
        if (b.dataset.key) {
          this.pressed.add(b.dataset.key);
          this.keys.add(b.dataset.key);
        }
      });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (b.dataset.hold === 'attack') this.mouseDown = false;
        if (b.dataset.key) this.keys.delete(b.dataset.key);
      });
    });
  },
};
