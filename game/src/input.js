// Keyboard and mouse input tracker managing key sets and drag deltas
export function createInput() {
  const state = {
    keys: new Set(),
    prevKeys: new Set(),
    dragging: false,
    dragDX: 0,
    dragDY: 0,
    orbitX: 0,
    orbitY: 0,

    isDown(code) {
      return this.keys.has(code);
    },

    pressed(code) {
      return this.keys.has(code) && !this.prevKeys.has(code);
    },

    beginFrame() {
      this.prevKeys = new Set(this.keys);
      this.dragDX = 0;
      this.dragDY = 0;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
    }
    state.keys.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    state.keys.delete(e.code);
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      state.dragging = true;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      state.dragging = false;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (state.dragging) {
      const dx = e.movementX || e.clientX - (state.lastX || e.clientX);
      const dy = e.movementY || e.clientY - (state.lastY || e.clientY);
      state.orbitX += dx;
      state.orbitY += dy;
    }
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });

  window.addEventListener('blur', () => {
    state.keys.clear();
    state.dragging = false;
    state.orbitX = 0;
    state.orbitY = 0;
  });

  return state;
}
