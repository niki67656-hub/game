(() => {
  "use strict";

  // Canvas setup (logical pixels)
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  // UI
  const $score = document.getElementById("score");
  const $best = document.getElementById("best");
  const $speed = document.getElementById("speed");
  const $overlay = document.getElementById("overlay");
  const $btnStart = document.getElementById("btnStart");
  const $btnHow = document.getElementById("btnHow");
  const $how = document.getElementById("how");
  const $toast = document.getElementById("toast");

  const W = canvas.width;
  const H = canvas.height;

  // World
  const groundY = Math.floor(H * 0.78);
  const gravity = 0.9;

  // Persistent best score
  const BEST_KEY = "cat_runner_best_v1";
  const best0 = Number(localStorage.getItem(BEST_KEY) || 0);
  let best = Number.isFinite(best0) ? best0 : 0;
  $best.textContent = String(best);

  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add("show");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => $toast.classList.remove("show"), 1200);
  }

  // Simple PRNG for consistent feel
  let seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  function rand() {
    // xorshift32
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17; seed >>>= 0;
    seed ^= seed << 5;  seed >>>= 0;
    return (seed >>> 0) / 4294967296;
  }

  const state = {
    started: false,
    paused: false,
    dead: false,
    t: 0,
    dt: 16.67,
    score: 0,
    speed: 7.0,
    speedMul: 1.0,
    nextSpawnIn: 0,
    obstacles: [],
    dust: [],
  };

  const cat = {
    x: Math.floor(W * 0.16),
    y: groundY,
    w: 36,
    h: 28,
    vy: 0,
    onGround: true,
    jumpPower: 14.5,
    blinkT: 0,
    squish: 0,
  };

  function reset() {
    state.started = false;
    state.paused = false;
    state.dead = false;
    state.t = 0;
    state.score = 0;
    state.speed = 7.0;
    state.speedMul = 1.0;
    state.nextSpawnIn = 35;
    state.obstacles = [];
    state.dust = [];
    cat.y = groundY;
    cat.vy = 0;
    cat.onGround = true;
    cat.blinkT = 0;
    cat.squish = 0;
    $score.textContent = "0";
    $speed.textContent = "1.0×";
  }

  function start() {
    if (state.dead) reset();
    state.started = true;
    $overlay.classList.add("hidden");
    toast("开始！跳跃躲避障碍");
  }

  function togglePause() {
    if (!state.started || state.dead) return;
    state.paused = !state.paused;
    toast(state.paused ? "暂停" : "继续");
  }

  function gameOver() {
    state.dead = true;
    state.started = false;
    $overlay.classList.remove("hidden");
    // update best
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(BEST_KEY, String(best));
      $best.textContent = String(best);
      toast("新纪录！🎉");
    } else {
      toast("游戏结束，按 R 重来");
    }
  }

  function jump() {
    if (!state.started) {
      start();
      return;
    }
    if (state.paused || state.dead) return;
    if (cat.onGround) {
      cat.vy = -cat.jumpPower;
      cat.onGround = false;
      cat.squish = 1;
      // little dust
      for (let i = 0; i < 6; i++) {
        state.dust.push({
          x: cat.x + 8 + rand() * 12,
          y: groundY + 2,
          vx: -2 - rand() * 2,
          vy: -1 - rand() * 1.5,
          a: 1,
          r: 1 + rand() * 2,
        });
      }
    }
  }

  // Input
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    } else if (e.code === "KeyR") {
      e.preventDefault();
      reset();
      start();
    } else if (e.code === "KeyP") {
      e.preventDefault();
      togglePause();
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    jump();
  }, { passive: false });

  $btnStart.addEventListener("click", () => start());
  $btnHow.addEventListener("click", () => {
    $how.open = !$how.open;
  });

  // Obstacle helpers
  function spawnObstacle() {
    const type = rand() < 0.65 ? "box" : "spike";
    const baseH = type === "box" ? 24 + Math.floor(rand() * 18) : 18 + Math.floor(rand() * 12);
    const baseW = type === "box" ? 16 + Math.floor(rand() * 22) : 22 + Math.floor(rand() * 22);
    const gapBonus = state.speed < 10 ? 6 : 0;

    state.obstacles.push({
      type,
      x: W + 30,
      y: groundY,
      w: baseW,
      h: baseH,
      wobble: rand() * Math.PI * 2,
    });

    // next spawn
    const minGap = 34 + gapBonus;
    const maxGap = 70 + gapBonus;
    state.nextSpawnIn = Math.floor(minGap + rand() * (maxGap - minGap));
  }

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay - ah < by && ay > by - bh;
  }

  // Rendering helpers
  function clear() {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackground() {
    // subtle stars
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 26; i++) {
      const x = (i * 37 + (state.t * 0.12)) % W;
      const y = (i * 19 + 30) % Math.floor(groundY - 40);
      const r = 1 + (i % 3) * 0.6;
      ctx.fillStyle = i % 4 === 0 ? "#6ea8ff" : "#e8ecff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // distant hills
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#6ea8ff";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 60) {
      const y = groundY - 60 - 10 * Math.sin((x + state.t * 0.2) / 120);
      ctx.quadraticCurveTo(x + 30, y, x + 60, groundY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    // ground line
    ctx.strokeStyle = "rgba(232,236,255,.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 1);
    ctx.lineTo(W, groundY + 1);
    ctx.stroke();

    // moving dashes
    const dashW = 18;
    const gap = 18;
    const off = (state.t * state.speed * 0.6) % (dashW + gap);
    ctx.strokeStyle = "rgba(168,178,216,.35)";
    ctx.lineWidth = 2;
    for (let x = -off; x < W; x += dashW + gap) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 14);
      ctx.lineTo(x + dashW, groundY + 14);
      ctx.stroke();
    }
  }

  function drawDust() {
    ctx.save();
    ctx.globalAlpha = 0.8;
    for (const p of state.dust) {
      ctx.globalAlpha = p.a * 0.8;
      ctx.fillStyle = "rgba(232,236,255,.55)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCat() {
    const x = cat.x;
    const y = cat.y;
    const w = cat.w;
    const h = cat.h;

    // squish/stretch
    const squ = cat.onGround ? (1 - 0.08 * cat.squish) : (1 + 0.05 * Math.min(1, Math.abs(cat.vy)/16));
    const sx = 1 / squ;
    const sy = squ;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);

    // shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    const shW = 30 * (cat.onGround ? 1 : 0.7);
    ctx.beginPath();
    ctx.ellipse(0, 8, shW, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = "#e8ecff";
    roundRect(ctx, -w/2, -h, w, h, 10, true, false);

    // ears
    ctx.fillStyle = "#e8ecff";
    ctx.beginPath();
    ctx.moveTo(-10, -h);
    ctx.lineTo(-18, -h - 10);
    ctx.lineTo(-4, -h - 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -h);
    ctx.lineTo(18, -h - 10);
    ctx.lineTo(4, -h - 6);
    ctx.closePath();
    ctx.fill();

    // face
    const blink = (cat.blinkT > 0.92 && cat.blinkT < 0.98);
    ctx.strokeStyle = "rgba(11,16,32,.75)";
    ctx.lineWidth = 2;
    // eyes
    if (blink) {
      ctx.beginPath(); ctx.moveTo(-8, -h + 12); ctx.lineTo(-2, -h + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -h + 12); ctx.lineTo(8, -h + 12); ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(11,16,32,.75)";
      ctx.beginPath(); ctx.arc(-6, -h + 12, 2.2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -h + 12, 2.2, 0, Math.PI*2); ctx.fill();
    }
    // nose
    ctx.fillStyle = "rgba(255,107,107,.85)";
    ctx.beginPath();
    ctx.moveTo(0, -h + 16);
    ctx.lineTo(-3, -h + 20);
    ctx.lineTo(3, -h + 20);
    ctx.closePath();
    ctx.fill();

    // tail (wag)
    const wag = Math.sin(state.t * 0.12) * 0.6;
    ctx.save();
    ctx.translate(w/2 - 2, -h + 18);
    ctx.rotate(wag);
    ctx.strokeStyle = "rgba(232,236,255,.95)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(14, 6, 18, 18);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawObstacle(o) {
    const top = o.y - o.h;
    ctx.save();
    // subtle breathing
    const wob = Math.sin(state.t * 0.06 + o.wobble) * 0.6;

    if (o.type === "box") {
      ctx.fillStyle = "rgba(110,168,255,.75)";
      roundRect(ctx, o.x, top, o.w, o.h, 8, true, false);
      ctx.fillStyle = "rgba(232,236,255,.35)";
      roundRect(ctx, o.x + 3, top + 3, o.w - 6, o.h - 6, 6, true, false);
    } else {
      // spike
      ctx.fillStyle = "rgba(255,107,107,.80)";
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      const spikes = 3 + Math.floor(o.w / 18);
      const step = o.w / spikes;
      for (let i = 0; i < spikes; i++) {
        const sx = o.x + i * step;
        ctx.lineTo(sx + step/2, o.y - o.h - wob);
        ctx.lineTo(sx + step, o.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Main loop
  let last = performance.now();

  function step(now) {
    const rawDt = Math.min(40, now - last);
    last = now;

    if (!state.started || state.paused) {
      render();
      requestAnimationFrame(step);
      return;
    }

    // Update
    state.t += rawDt;
    // speed ramps up slowly
    state.speedMul = 1 + Math.min(1.8, state.t / 60000) * 0.9; // up to 2.62x-ish
    const s = state.speed * state.speedMul;
    $speed.textContent = `${state.speedMul.toFixed(1)}×`;

    // score
    state.score += Math.floor(rawDt * 0.02 * state.speedMul);
    $score.textContent = String(state.score);

    // blink timer
    cat.blinkT += rawDt / 1000;
    if (cat.blinkT > 1.5 + rand() * 2.2) cat.blinkT = 0;

    // squish decay
    cat.squish *= 0.84;

    // gravity
    cat.vy += gravity * (rawDt / 16.67);
    cat.y += cat.vy * (rawDt / 16.67);
    if (cat.y >= groundY) {
      cat.y = groundY;
      cat.vy = 0;
      cat.onGround = true;
    }

    // spawn obstacles
    state.nextSpawnIn -= rawDt / 16.67;
    if (state.nextSpawnIn <= 0) spawnObstacle();

    // move obstacles
    for (const o of state.obstacles) {
      o.x -= s * (rawDt / 16.67);
    }
    // cleanup
    state.obstacles = state.obstacles.filter(o => o.x + o.w > -40);

    // dust particles
    for (const p of state.dust) {
      p.x += p.vx * (rawDt / 16.67);
      p.y += p.vy * (rawDt / 16.67);
      p.vy += 0.12 * (rawDt / 16.67);
      p.a *= 0.92;
    }
    state.dust = state.dust.filter(p => p.a > 0.05);

    // collision (use slightly forgiving hitbox)
    const hx = cat.x - cat.w * 0.38;
    const hw = cat.w * 0.76;
    const hh = cat.h * 0.82;
    const hy = cat.y - 2; // bottom

    for (const o of state.obstacles) {
      const ox = o.x + 2;
      const ow = Math.max(6, o.w - 4);
      const oh = Math.max(6, o.h - 2);
      const oy = o.y;
      if (aabb(hx, hy, hw, hh, ox, oy, ow, oh)) {
        gameOver();
        break;
      }
    }

    // best indicator (live)
    if (state.score > best) {
      // do nothing; stored on gameOver, but we can show as green
      $score.style.color = "#6bffb0";
    } else {
      $score.style.color = "";
    }

    render();
    requestAnimationFrame(step);
  }

  function render() {
    clear();
    drawBackground();
    drawGround();
    // obstacles
    for (const o of state.obstacles) drawObstacle(o);
    drawDust();
    drawCat();

    // paused overlay hint
    if (state.paused) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(232,236,255,.92)";
      ctx.font = "700 22px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText("暂停中（按 P 继续）", W/2, H/2);
      ctx.restore();
    }
  }

  // initial
  reset();
  render();
  requestAnimationFrame(step);
})();
