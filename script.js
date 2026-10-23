(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 960;
  const H = canvas.height = 540;
  const ui = {
    hpFill: $('hpFill'), manaFill: $('manaFill'), xpFill: $('xpFill'),
    level: $('levelText'), coins: $('coinText'),
    start: $('startScreen'), end: $('endScreen'),
    endTitle: $('endTitle'), endText: $('endText'),
    startBtn: $('startBtn'), restartBtn: $('restartBtn'),
  };
  const show = (el, on) => el && el.classList.toggle('hidden', !on);
  let audioCtx = null;
  function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.04) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {  }
  }
  const keys = {};
  const pressed = {};
  const map = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    KeyJ: 'attack', KeyZ: 'attack', KeyK: 'magic', KeyX: 'magic',
  };
  function setKey(name, down) {
    if (down && !keys[name]) pressed[name] = true;
    keys[name] = down;
  }
  addEventListener('keydown', (e) => {
    const k = map[e.code];
    if (k) { e.preventDefault(); setKey(k, true); }
  });
  addEventListener('keyup', (e) => {
    const k = map[e.code];
    if (k) { e.preventDefault(); setKey(k, false); }
  });
  [['btnLeft', 'left'], ['btnRight', 'right'], ['btnJump', 'jump'],
   ['btnAttack', 'attack'], ['btnMagic', 'magic']].forEach(([id, k]) => {
    const el = $(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); setKey(k, true); };
    const off = (e) => { e.preventDefault(); setKey(k, false); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  });
  const GROUND_Y = 440;
  const LEVEL_W = 4600;
  const platforms = [];
  const ground = (x, w) => platforms.push({ x, y: GROUND_Y, w, h: 200, oneWay: false });
  const floater = (x, y, w) => platforms.push({ x, y, w, h: 18, oneWay: true });
  ground(0, 900); ground(1060, 760); ground(1980, 760);
  ground(2900, 760); ground(3820, 780);
  floater(300, 340, 140); floater(560, 270, 140);
  floater(920, 330, 110);
  floater(1300, 330, 150); floater(1560, 250, 140);
  floater(1840, 320, 120);
  floater(2250, 330, 150); floater(2500, 260, 130);
  floater(2760, 330, 110);
  floater(3150, 320, 140); floater(3400, 250, 140);
  floater(3700, 330, 110);
  const checkpoints = [{ x: 60 }, { x: 1100 }, { x: 2020 }, { x: 2940 }, { x: 3860 }];
  const PORTAL = { x: 4480, y: GROUND_Y - 110, w: 60, h: 110 };
  let player, enemies, coins, fireballs, particles, popups, cam, state, respawn, shake;
  function makeEnemy(type, x, y) {
    const base = { type, x, y, vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1, hurtT: 0, onGround: false, t: Math.random() * 6 };
    if (type === 'slime') return Object.assign(base, { w: 34, h: 26, hp: 30, maxHp: 30, dmg: 12, xp: 15, speed: 45 });
    if (type === 'goblin') return Object.assign(base, { w: 30, h: 46, hp: 50, maxHp: 50, dmg: 18, xp: 30, speed: 70 });
    return Object.assign(base, { w: 32, h: 22, hp: 20, maxHp: 20, dmg: 10, xp: 20, speed: 90, baseY: y });
  }
  function newGame() {
    player = {
      x: 80, y: GROUND_Y - 60, w: 26, h: 52, vx: 0, vy: 0, dir: 1,
      hp: 100, maxHp: 100, mana: 60, maxMana: 60,
      xp: 0, level: 1, coins: 0, dmg: 15,
      onGround: false, coyote: 0, jumpBuf: 0,
      atkT: 0, atkCd: 0, hit: new Set(), magicCd: 0, inv: 0,
    };
    enemies = [
      ['slime', 500], ['slime', 760], ['bat', 620, 250],
      ['slime', 1200], ['goblin', 1450], ['bat', 1600, 200], ['slime', 1700],
      ['goblin', 2150], ['slime', 2350], ['bat', 2520, 190], ['goblin', 2600],
      ['slime', 3050], ['goblin', 3250], ['bat', 3420, 180], ['slime', 3550],
      ['goblin', 4000], ['goblin', 4200], ['bat', 4100, 220], ['slime', 4350],
    ].map(([t, x, y]) => makeEnemy(t, x, y === undefined ? GROUND_Y - 60 : y));
    coins = [];
    platforms.filter(p => p.oneWay).forEach(p => {
      for (let i = 0; i < 3; i++) coins.push({ x: p.x + 20 + i * 30, y: p.y - 30, got: false });
    });
    for (let x = 200; x < LEVEL_W - 200; x += 330) coins.push({ x, y: GROUND_Y - 30, got: false });
    fireballs = []; particles = []; popups = [];
    cam = { x: 0 }; shake = 0;
    respawn = { x: 80, y: GROUND_Y - 60 };
    state = 'play';
    updateHud();
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function burst(x, y, color, n = 10, spd = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spd;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.4 + Math.random() * 0.4, max: 0.8, color });
    }
  }
  function popup(x, y, text, color = '#fff') { popups.push({ x, y, text, color, life: 0.9 }); }
  function moveEntity(e, dt) {
    const prevBottom = e.y + e.h;
    e.x += e.vx * dt;
    for (const p of platforms) {
      if (p.oneWay) continue;
      if (overlap(e, p) && e.y + e.h > p.y + 4) {
        if (e.vx > 0) e.x = p.x - e.w; else if (e.vx < 0) e.x = p.x + p.w;
        e.hitWall = true;
      }
    }
    e.y += e.vy * dt;
    e.onGround = false;
    for (const p of platforms) {
      if (!overlap(e, p)) continue;
      if (e.vy >= 0 && prevBottom <= p.y + 6) {
        e.y = p.y - e.h; e.vy = 0; e.onGround = true;
      } else if (!p.oneWay && e.vy < 0) {
        e.y = p.y + p.h; e.vy = 0;
      }
    }
  }
  function groundAhead(e) {
    const px = e.x + (e.dir > 0 ? e.w + 6 : -6), py = e.y + e.h + 8;
    return platforms.some(p => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h + 12);
  }
  function hurtPlayer(dmg, fromX) {
    if (player.inv > 0 || state !== 'play') return;
    player.hp -= dmg; player.inv = 1.0;
    player.vx = (player.x + player.w / 2 < fromX ? -1 : 1) * 260; player.vy = -280;
    shake = 8; beep(120, 0.18, 'sawtooth', 0.06);
    burst(player.x + 13, player.y + 20, '#ff4d4d', 12);
    popup(player.x, player.y - 10, '-' + dmg, '#ff6b6b');
    if (player.hp <= 0) { player.hp = 0; endGame(false); }
    updateHud();
  }
  function gainXp(n) {
    player.xp += n;
    let need = 50 * player.level;
    while (player.xp >= need) {
      player.xp -= need; player.level++;
      player.maxHp += 20; player.hp = player.maxHp;
      player.maxMana += 10; player.mana = player.maxMana;
      player.dmg += 4;
      popup(player.x - 10, player.y - 30, 'LEVEL UP!', '#ffe14d');
      burst(player.x + 13, player.y + 26, '#ffe14d', 30, 220);
      beep(660, 0.12, 'triangle', 0.06); setTimeout(() => beep(880, 0.2, 'triangle', 0.06), 110);
      need = 50 * player.level;
    }
  }
  function damageEnemy(en, dmg, knockDir) {
    en.hp -= dmg; en.hurtT = 0.2;
    en.vx = knockDir * 200; en.vy = -160;
    burst(en.x + en.w / 2, en.y + en.h / 2, '#c8ff7a', 8);
    popup(en.x, en.y - 8, String(dmg), '#fff');
    beep(260, 0.06, 'square', 0.05);
    if (en.hp <= 0) {
      en.dead = true; gainXp(en.xp);
      burst(en.x + en.w / 2, en.y + en.h / 2, '#ffe14d', 18, 200);
      for (let i = 0; i < 2; i++) coins.push({ x: en.x + i * 14, y: en.y - 6, got: false });
    }
    updateHud();
  }
  function endGame(win) {
    state = win ? 'win' : 'over';
    if (ui.endTitle) ui.endTitle.textContent = win ? 'You Win!' : 'Game Over';
    if (ui.endText) ui.endText.textContent = `Level ${player.level} • ${player.coins} coins collected`;
    show(ui.end, true);
  }
  function updateHud() {
    if (!player) return;
    if (ui.hpFill) ui.hpFill.style.width = (player.hp / player.maxHp * 100) + '%';
    if (ui.manaFill) ui.manaFill.style.width = (player.mana / player.maxMana * 100) + '%';
    if (ui.xpFill) ui.xpFill.style.width = (player.xp / (50 * player.level) * 100) + '%';
    if (ui.level) ui.level.textContent = 'Lv ' + player.level;
    if (ui.coins) ui.coins.textContent = player.coins;
  }
  const GRAV = 1500, SPEED = 230, JUMP = 600;
  function update(dt) {
    const p = player;
    p.inv = Math.max(0, p.inv - dt);
    p.atkT = Math.max(0, p.atkT - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.magicCd = Math.max(0, p.magicCd - dt);
    p.mana = Math.min(p.maxMana, p.mana + 6 * dt);
    const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (p.inv < 0.75) {
      p.vx = move * SPEED;
      if (move) p.dir = move;
    }
    p.coyote = p.onGround ? 0.1 : p.coyote - dt;
    p.jumpBuf = pressed.jump ? 0.12 : p.jumpBuf - dt;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP; p.coyote = 0; p.jumpBuf = 0; beep(520, 0.08, 'square', 0.03);
    }
    if (!keys.jump && p.vy < -200) p.vy += GRAV * 1.5 * dt;
    p.vy = Math.min(p.vy + GRAV * dt, 900);
    if (pressed.attack && p.atkCd <= 0) {
      p.atkT = 0.22; p.atkCd = 0.32; p.hit.clear(); beep(340, 0.07, 'sawtooth', 0.04);
    }
    if (pressed.magic && p.magicCd <= 0 && p.mana >= 20) {
      p.mana -= 20; p.magicCd = 0.4;
      fireballs.push({ x: p.x + p.w / 2, y: p.y + 20, vx: p.dir * 520, life: 1.2, w: 16, h: 16 });
      beep(180, 0.15, 'sawtooth', 0.05);
      updateHud();
    }
    p.hitWall = false;
    moveEntity(p, dt);
    p.x = clamp(p.x, 0, LEVEL_W - p.w);
    if (p.y > H + 120) {
      hurtPlayer(20, p.x);
      if (state === 'play') { p.x = respawn.x; p.y = respawn.y; p.vx = p.vy = 0; p.inv = 1.5; }
    }
    checkpoints.forEach(c => {
      if (p.x > c.x && respawn.x < c.x + 10 && c.x >= respawn.x) {
        if (c.x > respawn.x || (c.x === respawn.x && !c.on)) {
          respawn = { x: c.x, y: GROUND_Y - 60 };
          if (c.x > 100 && !c.on) { popup(p.x, p.y - 30, 'Checkpoint!', '#7af0ff'); beep(780, 0.1, 'triangle', 0.05); }
          c.on = true;
        }
      }
    });
    if (p.atkT > 0) {
      const hb = { x: p.dir > 0 ? p.x + p.w : p.x - 54, y: p.y + 4, w: 54, h: 44 };
      enemies.forEach(en => {
        if (!en.dead && !p.hit.has(en) && overlap(hb, en)) {
          p.hit.add(en); damageEnemy(en, p.dmg, p.dir);
        }
      });
    }
    fireballs.forEach(f => {
      f.x += f.vx * dt; f.life -= dt;
      particles.push({ x: f.x, y: f.y, vx: 0, vy: -20, life: 0.25, max: 0.25, color: '#ff9a3c' });
      enemies.forEach(en => {
        if (!f.dead && !en.dead && overlap({ x: f.x - 8, y: f.y - 8, w: 16, h: 16 }, en)) {
          f.dead = true; damageEnemy(en, Math.round(p.dmg * 1.6), Math.sign(f.vx));
          burst(f.x, f.y, '#ff9a3c', 14);
        }
      });
      if (platforms.some(pl => !pl.oneWay && overlap({ x: f.x - 8, y: f.y - 8, w: 16, h: 16 }, pl))) f.dead = true;
    });
    fireballs = fireballs.filter(f => !f.dead && f.life > 0);
    enemies.forEach(en => {
      en.hurtT = Math.max(0, en.hurtT - dt);
      en.t += dt;
      en.hitWall = false;
      const dx = (p.x + p.w / 2) - (en.x + en.w / 2);
      const dist = Math.abs(dx);
      if (en.type === 'bat') {
        const chase = dist < 380;
        const targetY = chase ? p.y + 10 : en.baseY + Math.sin(en.t * 2) * 30;
        if (en.hurtT <= 0) {
          en.vx = (chase ? Math.sign(dx) : en.dir) * en.speed;
          en.vy = clamp((targetY - en.y) * 2, -120, 120);
        }
        en.x += en.vx * dt; en.y += en.vy * dt;
        if (!chase && Math.random() < 0.005) en.dir *= -1;
      } else {
        if (en.hurtT <= 0) {
          const chase = en.type === 'goblin' ? dist < 320 : dist < 160;
          if (chase) en.dir = Math.sign(dx) || en.dir;
          en.vx = en.dir * en.speed * (chase ? 1.4 : 1);
        }
        en.vy = Math.min(en.vy + GRAV * dt, 900);
        moveEntity(en, dt);
        if (en.onGround && en.hurtT <= 0 && (en.hitWall || !groundAhead(en))) en.dir *= -1;
        if (en.type === 'goblin' && en.onGround && dist < 140 && p.y + p.h < en.y - 10 && Math.random() < 0.02) en.vy = -520;
        if (en.y > H + 200) en.dead = true;
      }
      en.x = clamp(en.x, 0, LEVEL_W - en.w);
      if (!en.dead && overlap(p, en)) hurtPlayer(en.dmg, en.x + en.w / 2);
    });
    enemies = enemies.filter(e => !e.dead);
    coins.forEach(c => {
      if (!c.got && Math.abs(c.x - (p.x + p.w / 2)) < 24 && Math.abs(c.y - (p.y + p.h / 2)) < 36) {
        c.got = true; p.coins++; beep(980, 0.05, 'triangle', 0.04); updateHud();
      }
    });
    if (overlap(p, PORTAL)) endGame(true);
    particles.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; q.life -= dt; });
    particles = particles.filter(q => q.life > 0);
    popups.forEach(q => { q.y -= 40 * dt; q.life -= dt; });
    popups = popups.filter(q => q.life > 0);
    cam.x += (clamp(p.x + p.w / 2 - W / 2, 0, LEVEL_W - W) - cam.x) * Math.min(1, dt * 6);
    shake = Math.max(0, shake - dt * 30);
    updateHud();
  }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2a5c'); g.addColorStop(0.6, '#4a5fa8'); g.addColorStop(1, '#f2a65a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 173 - cam.x * 0.05) % W + (i * 173 - cam.x * 0.05 < 0 ? W : 0), (i * 61) % 220, 2, 2);
    [[0.2, '#2b3a78', 260, 120], [0.4, '#222d5e', 330, 90]].forEach(([sp, col, base, amp]) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        const wx = x + cam.x * sp;
        ctx.lineTo(x, base - Math.abs(Math.sin(wx * 0.004) * amp) - Math.sin(wx * 0.011) * 18);
      }
      ctx.lineTo(W, H); ctx.fill();
    });
  }
  function drawPlatforms() {
    platforms.forEach(p => {
      const x = p.x - cam.x;
      if (x > W || x + p.w < 0) return;
      if (p.oneWay) {
        ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#4fc15a'; ctx.fillRect(x, p.y, p.w, 6);
      } else {
        ctx.fillStyle = '#4a3322'; ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#5b402b';
        for (let i = 0; i < p.w; i += 40) ctx.fillRect(x + i + 6, p.y + 30 + (i % 80), 18, 10);
        ctx.fillStyle = '#4fc15a'; ctx.fillRect(x, p.y, p.w, 12);
        ctx.fillStyle = '#6fe07a'; ctx.fillRect(x, p.y, p.w, 4);
      }
    });
  }
  function drawPortal() {
    const x = PORTAL.x - cam.x, t = performance.now() / 300;
    ctx.save();
    ctx.fillStyle = `rgba(150,100,255,${0.5 + Math.sin(t) * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x + 30, PORTAL.y + 55, 30, 55, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e0ccff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }
  function drawCheckpoints() {
    checkpoints.forEach(c => {
      const x = c.x - cam.x;
      ctx.fillStyle = '#ddd'; ctx.fillRect(x, GROUND_Y - 70, 4, 70);
      ctx.fillStyle = c.on ? '#4dff88' : '#ff5a5a';
      ctx.beginPath(); ctx.moveTo(x + 4, GROUND_Y - 70); ctx.lineTo(x + 34, GROUND_Y - 58); ctx.lineTo(x + 4, GROUND_Y - 46); ctx.fill();
    });
  }
  function drawCoins() {
    const t = performance.now() / 200;
    coins.forEach(c => {
      if (c.got) return;
      const x = c.x - cam.x;
      if (x < -20 || x > W + 20) return;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(x, c.y, Math.abs(Math.cos(t + c.x)) * 7 + 2, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
    });
  }
  function drawEnemy(en) {
    const x = en.x - cam.x, y = en.y;
    if (x < -60 || x > W + 60) return;
    const flash = en.hurtT > 0;
    if (en.type === 'slime') {
      const sq = Math.sin(en.t * 6) * 2;
      ctx.fillStyle = flash ? '#fff' : '#58d46a';
      ctx.beginPath(); ctx.ellipse(x + en.w / 2, y + en.h - 2, en.w / 2 + sq, en.h - 2 - sq, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - sq, y + en.h - 6, en.w + sq * 2, 6);
    } else if (en.type === 'goblin') {
      ctx.fillStyle = flash ? '#fff' : '#3d8f3a'; ctx.fillRect(x + 4, y + 14, 22, 32);
      ctx.fillStyle = flash ? '#fff' : '#58b84f'; ctx.fillRect(x + 2, y, 26, 18);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + (en.dir > 0 ? 16 : 6), y + 6, 6, 5);
      ctx.fillStyle = '#ccc'; ctx.fillRect(x + (en.dir > 0 ? 28 : -10), y + 22, 12, 4);
    } else {
      const f = Math.sin(en.t * 18) * 8;
      ctx.fillStyle = flash ? '#fff' : '#7a4fb8';
      ctx.beginPath(); ctx.ellipse(x + 16, y + 11, 10, 9, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x - 8, y + 2 - f); ctx.lineTo(x + 8, y + 18); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 24, y + 10); ctx.lineTo(x + 40, y + 2 - f); ctx.lineTo(x + 24, y + 18); ctx.fill();
      ctx.fillStyle = '#ff5a5a'; ctx.fillRect(x + 11, y + 8, 3, 3); ctx.fillRect(x + 18, y + 8, 3, 3);
    }
    if (en.hp < en.maxHp) {
      ctx.fillStyle = '#000a'; ctx.fillRect(x, y - 10, en.w, 4);
      ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x, y - 10, en.w * en.hp / en.maxHp, 4);
    }
  }
  function drawPlayer() {
    const p = player, x = p.x - cam.x, y = p.y;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) return;
    ctx.save();
    ctx.translate(x + p.w / 2, y);
    ctx.scale(p.dir, 1);
    ctx.fillStyle = '#c0392b';
    const sway = Math.sin(performance.now() / 120) * 3 + (p.onGround ? 0 : -p.vy * 0.01);
    ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(-22, 40 + sway); ctx.lineTo(-4, 38); ctx.fill();
    const step = p.onGround && Math.abs(p.vx) > 10 ? Math.sin(performance.now() / 70) * 5 : 0;
    ctx.fillStyle = '#3b3b5c';
    ctx.fillRect(-9 + step, 38, 8, 14); ctx.fillRect(1 - step, 38, 8, 14);
    ctx.fillStyle = '#4a7bd8'; ctx.fillRect(-10, 14, 20, 26);
    ctx.fillStyle = '#f2c9a0'; ctx.fillRect(-9, 0, 18, 15);
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-10, -2, 20, 6);
    ctx.fillStyle = '#222'; ctx.fillRect(3, 6, 3, 3);
    ctx.save();
    ctx.translate(8, 26);
    const prog = p.atkT > 0 ? 1 - p.atkT / 0.22 : 0;
    ctx.rotate(p.atkT > 0 ? -1.6 + prog * 2.8 : -0.5);
    ctx.fillStyle = '#d8e6ff'; ctx.fillRect(0, -3, 44, 6);
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-6, -5, 8, 10);
    if (p.atkT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 44, -1.1, 0.6); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBackground();
    drawPlatforms(); drawCheckpoints(); drawPortal(); drawCoins();
    enemies.forEach(drawEnemy);
    drawPlayer();
    fireballs.forEach(f => {
      const x = f.x - cam.x;
      const g = ctx.createRadialGradient(x, f.y, 2, x, f.y, 12);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(1, '#ff6a00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, f.y, 11, 0, 7); ctx.fill();
    });
    particles.forEach(q => {
      ctx.globalAlpha = Math.max(0, q.life / (q.max || 0.8));
      ctx.fillStyle = q.color; ctx.fillRect(q.x - cam.x, q.y, 4, 4);
    });
    ctx.globalAlpha = 1;
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    popups.forEach(q => {
      ctx.globalAlpha = Math.min(1, q.life * 2); ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x - cam.x, q.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === 'play') update(dt);
    if (player) render();
    else { ctx.fillStyle = '#1b2a5c'; ctx.fillRect(0, 0, W, H); }
    for (const k in pressed) pressed[k] = false;
    requestAnimationFrame(frame);
  }
  function startGame() { show(ui.start, false); show(ui.end, false); newGame(); beep(500, 0.1, 'triangle', 0.05); }
  if (ui.startBtn) ui.startBtn.addEventListener('click', startGame);
  if (ui.restartBtn) ui.restartBtn.addEventListener('click', startGame);
  addEventListener('keydown', (e) => {
    if ((e.code === 'Enter') && state !== 'play') startGame();
  });
  state = 'menu';
  requestAnimationFrame(frame);
})();