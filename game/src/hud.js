/**
 * Creates and manages the Solmar Bay heads-up display, minimap, and overlay menus.
 */
export function createHud() {
  const el = {};
  const ids = [
    'hud-cash', 'hud-health', 'hud-health-fill', 'hud-health-text',
    'hud-stars', 'hud-speed', 'minimap', 'hud-mission-name',
    'hud-objective', 'hud-timer', 'hud-feed', 'hud-toast',
    'menu', 'menu-title', 'menu-text', 'menu-buttons'
  ];
  for (const id of ids) {
    el[id] = document.getElementById(id);
  }

  let toastTimer = 0;
  let toastDuration = 1.5;

  return {
    setWanted(n) {
      if (!el['hud-stars']) return;
      const count = Math.max(0, Math.min(5, n));
      let html = '';
      for (let i = 0; i < 5; i++) {
        const filled = i < count;
        const color = filled ? '#ffd700' : '#888888';
        html += `<span style="color: ${color}; margin-right: 2px;">${filled ? '★' : '☆'}</span>`;
      }
      el['hud-stars'].innerHTML = html;
    },

    setCash(v) {
      if (!el['hud-cash']) return;
      const rounded = Math.floor(v);
      const formatted = rounded.toLocaleString();
      el['hud-cash'].textContent = `$${formatted}`;
    },

    setHealth(v) {
      const pct = Math.max(0, Math.min(100, v));
      const rounded = Math.round(pct);
      if (el['hud-health-fill']) {
        el['hud-health-fill'].style.width = `${pct}%`;
      }
      if (el['hud-health-text']) {
        el['hud-health-text'].textContent = `${rounded}`;
      }
    },

    setSpeed(kmh, inCar) {
      if (!el['hud-speed']) return;
      if (inCar) {
        el['hud-speed'].textContent = `${Math.round(kmh)} km/h`;
        el['hud-speed'].style.display = 'block';
      } else {
        el['hud-speed'].textContent = '';
        el['hud-speed'].style.display = 'none';
      }
    },

    setObjective(missionName, text, timeLeft) {
      if (el['hud-mission-name']) {
        el['hud-mission-name'].textContent = missionName ? missionName.toUpperCase() : '';
      }
      if (el['hud-objective']) {
        el['hud-objective'].textContent = text || '';
      }
      if (el['hud-timer']) {
        if (timeLeft > 0) {
          const mins = Math.floor(timeLeft / 60);
          const secs = Math.floor(timeLeft % 60);
          el['hud-timer'].textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
          el['hud-timer'].style.display = 'block';
        } else {
          el['hud-timer'].textContent = '';
          el['hud-timer'].style.display = 'none';
        }
      }
    },

    message(text) {
      if (!el['hud-feed']) return;
      const lines = Array.from(el['hud-feed'].children);
      const div = document.createElement('div');
      div.style.cssText = 'background: rgba(0,0,0,0.6); border-left: 4px solid #ffd23f; padding: 4px 8px; margin-bottom: 4px; font-size: 13px; color: #fff; font-family: sans-serif;';
      div.textContent = text;
      el['hud-feed'].insertBefore(div, el['hud-feed'].firstChild);
      while (el['hud-feed'].children.length > 4) {
        el['hud-feed'].removeChild(el['hud-feed'].lastChild);
      }
    },

    toast(text) {
      if (!el['hud-toast']) return;
      el['hud-toast'].textContent = text;
      el['hud-toast'].style.opacity = '1';
      el['hud-toast'].style.transition = 'opacity 0.3s ease';
      toastTimer = toastDuration;
    },

    update(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) {
          if (el['hud-toast']) {
            el['hud-toast'].style.opacity = '0';
          }
        }
      }
    },

    // Render canvas minimap view including blocks, street grid, and markers
    drawMinimap(view) {
      const canvas = el['minimap'];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 180;
      ctx.clearRect(0, 0, size, size);

      // Dark background
      ctx.fillStyle = '#181822';
      ctx.fillRect(0, 0, size, size);

      if (!view) return;

      const half = view.half || 150;
      const roadHalf = 6;
      // Map world coordinates [-half, half] to [0, size]
      function mapX(x) {
        return ((x + half) / (half * 2)) * size;
      }
      function mapZ(z) {
        return ((z + half) / (half * 2)) * size;
      }

      // City blocks between streets
      const coords = [-half, -120, -60, 0, 60, 120, half];
      ctx.fillStyle = '#2c2c36';
      for (let i = 0; i < coords.length - 1; i++) {
        for (let j = 0; j < coords.length - 1; j++) {
          const x1 = coords[i] + roadHalf;
          const x2 = coords[i+1] - roadHalf;
          const z1 = coords[j] + roadHalf;
          const z2 = coords[j+1] - roadHalf;
          if (x2 > x1 && z2 > z1) {
            ctx.fillRect(mapX(x1), mapZ(z1), mapX(x2) - mapX(x1), mapZ(z2) - mapZ(z1));
          }
        }
      }

      // Brighter sea strip along top edge (north is -z, so north is top)
      ctx.fillStyle = '#2270b8';
      ctx.fillRect(0, 0, size, 14);

      // Streets as bright wide lines
      if (view.streets && Array.isArray(view.streets)) {
        ctx.strokeStyle = '#555566';
        ctx.lineWidth = 10;
        for (const s of view.streets) {
          ctx.beginPath();
          ctx.moveTo(mapX(s.x1), mapZ(s.z1));
          ctx.lineTo(mapX(s.x2), mapZ(s.z2));
          ctx.stroke();
        }
      }

      // Mission marker: yellow dot with an enlarged ring
      if (view.marker) {
        const mx = mapX(view.marker.x);
        const mz = mapZ(view.marker.z);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mx, mz, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(mx, mz, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Police: enlarged red dots
      if (view.police && Array.isArray(view.police)) {
        ctx.fillStyle = '#ff5555';
        for (const p of view.police) {
          ctx.beginPath();
          ctx.arc(mapX(p.x), mapZ(p.z), 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Other cars: enlarged white dots
      if (view.cars && Array.isArray(view.cars)) {
        ctx.fillStyle = '#ffffff';
        for (const c of view.cars) {
          ctx.beginPath();
          ctx.arc(mapX(c.x), mapZ(c.z), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Pedestrians: enlarged grey dots
      if (view.peds && Array.isArray(view.peds)) {
        ctx.fillStyle = '#aaaaaa';
        for (const p of view.peds) {
          ctx.beginPath();
          ctx.arc(mapX(p.x), mapZ(p.z), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player: bigger white arrow with dark outline rotated by heading
      const px = mapX(view.playerX);
      const pz = mapZ(view.playerZ);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(view.playerHeading || 0);
      ctx.strokeStyle = '#111116';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 'N' label in top-left corner
      ctx.fillStyle = '#bbbbcc';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('N', 7, 24);

      // Border around minimap
      ctx.strokeStyle = '#444455';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, size, size);
    },

    showMenu(title, text, buttons) {
      if (!el['menu']) return;
      if (el['menu-title']) el['menu-title'].textContent = title || '';
      if (el['menu-text']) el['menu-text'].textContent = text || '';
      if (el['menu-buttons']) {
        el['menu-buttons'].innerHTML = '';
        if (buttons && Array.isArray(buttons)) {
          for (const btn of buttons) {
            const b = document.createElement('button');
            b.textContent = btn.label;
            b.style.cssText = 'background: #ffd23f; color: #111; border: none; padding: 10px 20px; font-weight: bold; cursor: pointer; border-radius: 4px; font-size: 16px; margin: 5px;';
            b.onclick = btn.onClick;
            el['menu-buttons'].appendChild(b);
          }
        }
      }
      el['menu'].style.display = 'flex';
    },

    hideMenu() {
      if (!el['menu']) return;
      el['menu'].style.display = 'none';
    }
  };
}
