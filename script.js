(() => {
  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- canvases & layout ---------- */

  const back = $("#stars");
  const front = $("#fx");
  const bx = back.getContext("2d");
  const fx = front.getContext("2d");
  const seaEl = $("#sea");

  let W = 0, H = 0, seaTop = 1;
  let stars = [];

  // stars are bright up top and fade out as the sky lightens toward the sea
  const fadeAt = (y) => clamp(1 - (y / seaTop - 0.28) / 0.5, 0, 1);
  const twinkle = (s, t) => 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);

  function makeStars() {
    stars = [];
    const n = Math.min(900, Math.round((W * seaTop) / 2600));
    for (let i = 0; i < n; i++) {
      // bunched toward the top, so they thin out on the way down
      const y = seaTop * 0.85 * Math.pow(Math.random(), 1.6);
      const fade = fadeAt(y);
      if (fade <= 0.02) continue;
      const big = Math.random() < 0.06;
      stars.push({
        x: Math.random() * W,
        y,
        r: big ? rand(1.3, 2.1) : rand(0.35, 1.15),
        base: rand(0.45, 1),
        speed: rand(0.5, 2.2),
        phase: rand(0, Math.PI * 2),
        fade,
        big,
        boost: 0,
      });
    }
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    const newSea = seaEl.getBoundingClientRect().top + scrollY;
    const widthChanged = w !== W;

    if (w !== W || h !== H) {
      W = w; H = h;
      for (const [c, ctx] of [[back, bx], [front, fx]]) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    if (widthChanged || Math.abs(newSea - seaTop) > 2 || !stars.length) {
      seaTop = newSea;
      makeStars();
      ff.star = null;
      if (ff.state !== "follow") ff.state = "follow";
    }
    if (reduceMotion) drawStill();
  }

  /* ---------- the firefly ---------- */

  const mouse = { x: 0, y: 0, has: false };
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.has = true;
  }, { passive: true });
  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) mouse.has = false;
  });

  const ff = {
    x: innerWidth * 0.62, y: innerHeight * 0.42, // page coords
    vx: 0, vy: 0,
    state: "follow", // sky: follow | visit | sync
    timer: rand(2, 4),
    star: null,
    orbit: 0,
    pulse: 1,
    inSea: false,
    seaMix: 0,
    // sea current
    cx: 0, cy: 0, wx: 0, wy: 0, wTimer: 0, theta: 0,
    trail: [],
  };
  const ripples = [];
  let lastRipple = 0;

  const inView = (y, sy, m = 0) => y > sy - m && y < sy + H + m;

  function pickStar(sy) {
    const near = [];
    for (const s of stars) {
      const vy = s.y - sy;
      if (s !== ff.star && vy > 40 && vy < H - 40 && s.x > 30 && s.x < W - 30 && s.fade > 0.35) near.push(s);
    }
    if (!near.length) return null;
    const d = (s) => (s.x - ff.x) ** 2 + (s.y - ff.y) ** 2;
    near.sort((a, b) => d(a) - d(b));
    return near[Math.floor(Math.random() * Math.min(10, near.length))];
  }

  function steer(tx, ty, k, damp, dt, max) {
    ff.vx += (tx - ff.x) * k * dt;
    ff.vy += (ty - ff.y) * k * dt;
    const d = Math.pow(1 - damp, dt);
    ff.vx *= d;
    ff.vy *= d;
    const sp = Math.hypot(ff.vx, ff.vy);
    if (sp > max) { ff.vx *= max / sp; ff.vy *= max / sp; }
    ff.x += ff.vx * dt;
    ff.y += ff.vy * dt;
  }

  function toFollow(min = 3, max = 7) {
    ff.state = "follow";
    ff.star = null;
    ff.timer = rand(min, max);
  }

  // up in the sky: tag along behind the cursor, wander off to visit stars
  function updateSky(dt, t, sy) {
    if (ff.star && !inView(ff.star.y, sy, -20)) toFollow(2, 5);
    if (ff.state !== "follow" && !inView(ff.y, sy, 80)) toFollow();
    ff.timer -= dt / 60;

    let tx, ty;
    if (ff.state === "follow") {
      if (mouse.has) {
        ff.orbit += 0.012 * dt;
        tx = mouse.x + Math.cos(ff.orbit) * 48;
        ty = mouse.y + sy + Math.sin(ff.orbit * 1.3) * 32 - 18;
      } else {
        tx = W * 0.5 + Math.cos(t * 0.3) * W * 0.25;
        ty = sy + H * 0.45 + Math.sin(t * 0.45) * H * 0.18;
      }
      if (ff.timer <= 0) {
        const s = (!mouse.has || Math.random() < 0.7) && pickStar(sy);
        if (s) { ff.star = s; ff.state = "visit"; ff.timer = 8; }
        else ff.timer = rand(3, 6);
      }
    } else {
      const s = ff.star;
      ff.orbit += 0.02 * dt;
      const r = ff.state === "sync" ? 7 : 0;
      tx = s.x + Math.cos(ff.orbit) * r;
      ty = s.y - 4 + Math.sin(ff.orbit) * r * 0.6;

      if (ff.state === "visit") {
        if (Math.hypot(ff.x - s.x, ff.y - s.y) < 14) {
          ff.state = "sync";
          ff.timer = rand(2.2, 4.5);
        } else if (ff.timer <= 0) toFollow();
      } else if (ff.timer <= 0) {
        const next = Math.random() < 0.35 && pickStar(sy);
        if (next) { ff.star = next; ff.state = "visit"; ff.timer = 8; }
        else toFollow(4, 9);
      }
    }

    // while chatting with a star, glow in time with it
    ff.pulse = ff.state === "sync" && ff.star ? twinkle(ff.star, t) : 0.7 + 0.3 * Math.sin(t * 2.4);

    steer(tx, ty, 0.0022, 0.055, dt, 9);
    ff.vx += Math.sin(t * 1.7 + 1) * 0.02 * dt;
    ff.vy += Math.cos(t * 1.3) * 0.02 * dt;
  }

  // in the sea: caught in lazy currents, mostly ignoring you
  function updateSea(dt, t, sy) {
    const top = Math.max(seaTop + 70, sy + 50);
    const bot = sy + H - 50;
    let tx, ty, k = 0.0009, max = 4;

    if (bot - top < 60) {
      // no water on screen: swim up after you
      tx = W / 2;
      ty = sy + H * 0.5;
      k = 0.0016;
      max = 8;
      ff.cx = ff.x;
      ff.cy = ff.y;
    } else {
      ff.wTimer -= dt / 60;
      if (ff.wTimer <= 0) {
        ff.wx = rand(W * 0.15, W * 0.85);
        ff.wy = rand(top, top + (bot - top) * 0.7);
        ff.wTimer = rand(6, 12);
      }
      ff.wy = clamp(ff.wy, top, bot);
      ff.cx += (ff.wx - ff.cx) * 0.004 * dt;
      ff.cy += (ff.wy - ff.cy) * 0.004 * dt - 0.1 * dt; // floats up with the bubbles
      if (ff.cy < top) ff.cy += (top - ff.cy) * 0.03 * dt;
      if (ff.cy > bot) ff.cy += (bot - ff.cy) * 0.03 * dt;

      ff.theta += 0.011 * dt;
      const R = 40 + Math.sin(t * 0.23) * 18;
      tx = ff.cx + Math.cos(ff.theta) * R;
      ty = ff.cy + Math.sin(ff.theta) * R * 0.7;
    }

    steer(tx, ty, k, 0.07, dt, max);

    // only a proper nudge moves it
    if (mouse.has) {
      const dx = ff.x - mouse.x, dy = ff.y - (mouse.y + sy);
      const d = Math.hypot(dx, dy);
      if (d < 60 && d > 0.1) {
        const f = ((60 - d) / 60) * 0.9 * dt;
        ff.vx += (dx / d) * f;
        ff.vy += (dy / d) * f;
      }
    }

    ff.pulse = 0.6 + 0.4 * Math.sin(t * 1.1);
  }

  function updateFirefly(dt, t, sy) {
    const crossed = ff.inSea ? ff.y < seaTop - 6 : ff.y > seaTop + 6;
    if (crossed) {
      ff.inSea = !ff.inSea;
      if (ff.inSea) {
        ff.cx = ff.x;
        ff.cy = ff.y + 30;
        ff.wTimer = 0;
        ff.star = null;
      } else toFollow();
      if (t - lastRipple > 0.8) {
        ripples.push({ x: ff.x, y: seaTop, r: 2, a: 0.8 });
        lastRipple = t;
      }
    }
    ff.seaMix += ((ff.inSea ? 1 : 0) - ff.seaMix) * 0.04 * dt;
    ff.inSea ? updateSea(dt, t, sy) : updateSky(dt, t, sy);
    ff.x = clamp(ff.x, 6, W - 6);

    ff.trail.push({ x: ff.x, y: ff.y });
    if (ff.trail.length > 14) ff.trail.shift();
  }

  function drawFirefly(sy, dt) {
    fx.clearRect(0, 0, W, H);

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += 1.1 * dt;
      r.a -= 0.014 * dt;
      if (r.a <= 0) { ripples.splice(i, 1); continue; }
      fx.strokeStyle = `rgba(255,255,255,${r.a})`;
      fx.lineWidth = 1.5;
      fx.beginPath();
      fx.ellipse(r.x, r.y - sy, r.r, r.r * 0.28, 0, 0, Math.PI * 2);
      fx.stroke();
    }

    // warm yellow up top, bioluminescent aqua down below
    const m = ff.seaMix;
    const c = [255 - 125 * m, 222 + 33 * m, 130 + 100 * m].map(Math.round).join(",");

    ff.trail.forEach((p, i) => {
      fx.fillStyle = `rgba(${c},${(i / ff.trail.length) * 0.3})`;
      fx.beginPath();
      fx.arc(p.x, p.y - sy, 1.3, 0, Math.PI * 2);
      fx.fill();
    });

    const x = ff.x, y = ff.y - sy;
    if (y < -40 || y > H + 40) return;
    const p = ff.pulse;
    const R = 10 + 16 * p;
    const g = fx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, "rgba(255,255,245,0.95)");
    g.addColorStop(0.16, `rgba(${c},${0.8 * p})`);
    g.addColorStop(0.45, `rgba(${c},${0.22 * p})`);
    g.addColorStop(1, `rgba(${c},0)`);
    fx.fillStyle = g;
    fx.beginPath();
    fx.arc(x, y, R, 0, Math.PI * 2);
    fx.fill();
    fx.fillStyle = "#fffef5";
    fx.beginPath();
    fx.arc(x, y, 1.8 + p * 0.8, 0, Math.PI * 2);
    fx.fill();
  }

  /* ---------- sky & sea scenery ---------- */

  function drawStars(t, sy, dt) {
    for (const s of stars) {
      const syncing = s === ff.star && ff.state === "sync";
      s.boost += ((syncing ? 0.7 : 0) - s.boost) * 0.05 * dt;
      const y = s.y - sy;
      if (y < -8 || y > H + 8) continue;

      const a = clamp((reduceMotion ? 0.8 : twinkle(s, t)) * s.base * s.fade + s.boost * s.fade, 0, 1);
      const r = s.r * (1 + s.boost * 0.9);

      if (s.big || s.boost > 0.05) {
        const g = bx.createRadialGradient(s.x, y, 0, s.x, y, r * 6);
        g.addColorStop(0, `rgba(255,248,220,${a * 0.4})`);
        g.addColorStop(1, "rgba(255,248,220,0)");
        bx.fillStyle = g;
        bx.beginPath();
        bx.arc(s.x, y, r * 6, 0, Math.PI * 2);
        bx.fill();
      }
      if (s.big) {
        bx.strokeStyle = `rgba(255,251,234,${a * 0.5})`;
        bx.lineWidth = 0.8;
        bx.beginPath();
        bx.moveTo(s.x - r * 4, y); bx.lineTo(s.x + r * 4, y);
        bx.moveTo(s.x, y - r * 4); bx.lineTo(s.x, y + r * 4);
        bx.stroke();
      }
      bx.fillStyle = `rgba(255,251,234,${a})`;
      bx.beginPath();
      bx.arc(s.x, y, r, 0, Math.PI * 2);
      bx.fill();
    }
  }

  let shoot = null;
  let nextShoot = performance.now() + rand(3000, 7000);

  function drawShootingStar(now, sy, dt) {
    if (!shoot && now > nextShoot && sy < seaTop * 0.4) {
      shoot = { x: rand(W * 0.3, W), y: rand(0, H * 0.35), vx: -rand(9, 14), vy: rand(3, 5), life: 1 };
    }
    if (!shoot) return;
    shoot.x += shoot.vx * dt;
    shoot.y += shoot.vy * dt;
    shoot.life -= 0.02 * dt;
    if (shoot.life <= 0) {
      shoot = null;
      nextShoot = now + rand(6000, 15000);
      return;
    }
    const a = shoot.life * fadeAt(shoot.y + sy);
    const tx = shoot.x - shoot.vx * 7, ty = shoot.y - shoot.vy * 7;
    const g = bx.createLinearGradient(shoot.x, shoot.y, tx, ty);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    bx.strokeStyle = g;
    bx.lineWidth = 1.6;
    bx.beginPath();
    bx.moveTo(shoot.x, shoot.y);
    bx.lineTo(tx, ty);
    bx.stroke();
  }

  const bubbles = [];

  function drawBubbles(t, sy, dt) {
    if (sy + H > seaTop + 40 && bubbles.length < 60 && Math.random() < 0.12 * dt) {
      bubbles.push({ x: rand(0, W), y: sy + H + 10, r: rand(1.5, 5), vy: rand(0.35, 1.1), ph: rand(0, 6.28), a: rand(0.25, 0.6) });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      if (b.y < seaTop + 14 || b.y < sy - 20) { bubbles.splice(i, 1); continue; }
      const x = b.x + Math.sin(t * 1.5 + b.ph) * 4;
      const y = b.y - sy;
      bx.strokeStyle = `rgba(255,255,255,${b.a})`;
      bx.lineWidth = 1;
      bx.beginPath();
      bx.arc(x, y, b.r, 0, Math.PI * 2);
      bx.stroke();
      bx.fillStyle = `rgba(255,255,255,${b.a * 0.8})`;
      bx.beginPath();
      bx.arc(x - b.r * 0.35, y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
      bx.fill();
    }
  }

  /* ---------- loop ---------- */

  function drawStill() {
    bx.clearRect(0, 0, W, H);
    drawStars(0, scrollY, 1);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(3, (now - last) / 16.667);
    last = now;
    const t = now / 1000;
    const sy = scrollY;

    bx.clearRect(0, 0, W, H);
    drawStars(t, sy, dt);
    drawShootingStar(now, sy, dt);
    drawBubbles(t, sy, dt);

    updateFirefly(dt, t, sy);
    drawFirefly(sy, dt);

    requestAnimationFrame(frame);
  }

  layout();
  addEventListener("resize", layout);
  addEventListener("load", layout);
  if (document.fonts) document.fonts.ready.then(layout);
  new ResizeObserver(layout).observe(document.body);

  if (reduceMotion) {
    let queued = false;
    addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; drawStill(); });
    }, { passive: true });
  } else {
    requestAnimationFrame(frame);
  }
})();
