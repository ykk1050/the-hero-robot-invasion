// 중간 보스와 '에너지 고르게 나누기' (평균의 수호자)
// - 정답 5개마다 보스가 나타남. 방어막이 있는 동안은 치료 광선이 통하지 않음.
// - 높이가 다른 에너지 통을 한 칸씩 옮겨 모두 같게 만들면(= 평균) 방어막이 깨짐.
// - 보스를 고치면 다시 정답 5개 뒤에 다음 보스가 나옴.

const BOSS_EVERY = 5;
const TANK_MAX = 10;

function bossOf(g) { return g.enemies.find(e => e.boss) || null; }
function bossShielded(g) { const b = bossOf(g); return !!(b && b.shield); }

// 에너지 통 만들기: 합이 통 수로 나누어떨어지고, 옮기는 횟수가 너무 많지 않게
function makeTanks(n) {
    const count = n >= 3 ? 4 : 3;
    const minMoves = n >= 2 ? 4 : 3, maxMoves = n >= 3 ? 8 : 6;
    for (let tries = 0; tries < 300; tries++) {
        const avg = 3 + Math.floor(Math.random() * 5);   // 3~7
        const v = [];
        for (let i = 0; i < count - 1; i++) v.push(1 + Math.floor(Math.random() * TANK_MAX));
        v.push(avg * count - v.reduce((a, b) => a + b, 0));
        if (v[count - 1] < 1 || v[count - 1] > TANK_MAX) continue;
        const moves = v.reduce((a, x) => a + Math.max(0, x - avg), 0);
        if (moves >= minMoves && moves <= maxMoves) return v;
    }
    return count === 4 ? [8, 3, 6, 3] : [9, 3, 6];
}

function tanksEven(t) { return t.every(x => x === t[0]); }

function startBoss(g) {
    const n = g.bossCount + 1;
    g.bossCount = n;
    const seconds = g.gameTime / 1000;
    const base = 30 + g.player.level * 5 + Math.max(0, seconds - 240) * 0.5;
    const hp = Math.round(base * (5 + Math.min(n, 6)));
    const angle = (-75 + Math.random() * 80) * Math.PI / 180;   // 오른쪽 위에서 나타남 (아래쪽 버튼에 가리지 않게)
    const tanks = makeTanks(n);
    g.enemies.push({
        boss: true, n, x: g.player.x + Math.cos(angle) * canvas.width * 0.36, y: g.player.y + Math.sin(angle) * canvas.height * 0.3,   // 화면 안에 착지
        hp, maxHp: hp, radius: 95 * g.scale, speed: 0.7, shield: true, phase: 1, phases: n >= 3 ? 2 : 1,
        tanks, first: [...tanks], shotAt: g.gameTime + 6000, stunUntil: 0, frozenUntil: 0
    });
    startBossIntro(g, g.enemies[g.enemies.length - 1]);
}

function maybeStartBoss(g) {
    if (bossOf(g) || g.stats.correct < g.nextBossAt) return;
    startBoss(g);
}

// 보스의 움직임: 방어막이 있으면 조금 떨어져서 에너지 덩어리를 쏘고, 방어막이 깨지면 잠깐 멈췄다가 다가옴
function updateBoss(g, dt) {
    const b = bossOf(g);
    if (b && b.shield && g.gameTime >= b.shotAt && enemyPace(g, b) > 0) {
        b.shotAt = g.gameTime + 5000;
        const a = Math.atan2(g.player.y - b.y, g.player.x - b.x);
        g.orbs.push({ x: b.x, y: b.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 6000 });
    }
    if (!g.orbs.length) return;
    const f = dt * 0.06 * (g.gameTime < g.crew.slowUntil ? 0.3 : 1);
    g.orbs.forEach(o => {
        o.x += o.vx * f;
        o.y += o.vy * f;
        o.life -= dt;
        if (g.crew.walls.some(w => w.points.some((p, i) => i && distToSegment(o.x, o.y, w.points[i - 1], p).d < 16))) { o.life = 0; return; }
        if (Math.hypot(o.x - g.player.x, o.y - g.player.y) < 55 * g.scale) {
            o.life = 0;
            if (!g.isInvincible) { g.player.hp -= 6; g.shakeBy(0.3); }
        }
    });
    g.orbs = g.orbs.filter(o => o.life > 0);
}

// 보스가 이번 순간 움직이는 빠르기
function bossPace(g, b) {
    if (g.gameTime < b.stunUntil) return 0;
    if (b.shield && Math.hypot(b.x - g.player.x, b.y - g.player.y) < 240 * g.scale + b.radius * 0.5) return 0;
    return 1;
}

// 체력이 반이 되면 방어막을 한 번 더 침 (세 번째 보스부터)
function bossHit(g, b) {
    if (b.phase >= b.phases || b.hp > b.maxHp / 2 || b.hp <= 0) return;
    b.phase++;
    b.shield = true;
    b.tanks = makeTanks(b.n);
    b.first = [...b.tanks];
    b.shotAt = g.gameTime + 4000;
    playSound('sfx-wall');
    showToast('⚠️ 방어막을 다시 쳤어요! 한 번 더 고르게!');
    showSidePanel();
}

function bossFixed(g) {
    g.nextBossAt = g.stats.correct + BOSS_EVERY;
    g.orbs = [];
    g.gold += 100;
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.4);
    gainEnergy(g, ENERGY_MAX);
    addCrewStat('boss');
    g.stats.boss = (g.stats.boss || 0) + 1;
    g.shakeBy(0.7);
    playSound('sfx-fixed');
    showToast('🤖 보스를 고쳤어요! 100G · 체력 회복 · 기술 가득');
    checkCrewUnlocks();
    showSidePanel();
}

// ---------- 문제 칸: 문제 / 보상 / 에너지 나누기 중 하나만 보여 줌 ----------
function showSidePanel() {
    const boss = !game.rewardOpen && bossShielded(game);
    document.getElementById('quiz-container').style.display = !game.rewardOpen && !boss ? 'flex' : 'none';
    document.getElementById('upgrade-container').style.display = game.rewardOpen ? 'flex' : 'none';
    document.getElementById('boss-panel').style.display = boss ? 'flex' : 'none';
    if (boss) { tankPick = null; renderTanks(); checkTanks(); }
}

let tankPick = null;   // 고른 통 번호
let tankDown = null;

function renderTanks() {
    const b = bossOf(game);
    const box = document.getElementById('tank-row');
    if (!b || !b.tanks) return;
    if (box.children.length !== b.tanks.length) {
        box.innerHTML = '';
        b.tanks.forEach((v, i) => {
            const t = document.createElement('div');
            t.className = 'tank';
            t.dataset.i = i;
            t.innerHTML = `<div class="tank-cells">${'<i></i>'.repeat(TANK_MAX)}</div><b></b>`;
            box.appendChild(t);
        });
    }
    b.tanks.forEach((v, i) => {
        const t = box.children[i];
        t.classList.toggle('pick', i === tankPick || i === tankDown);
        t.querySelector('b').textContent = v;
        [...t.querySelectorAll('i')].forEach((c, k) => c.classList.toggle('on', TANK_MAX - k <= v));
    });
}

function moveEnergy(from, to) {
    const b = bossOf(game);
    if (!b || !b.shield || b.solved || game.state !== 'playing' || from === to) return false;
    const t = b.tanks;
    if (!(t[from] > 0) || !(t[to] < TANK_MAX)) return false;
    t[from]--;
    t[to]++;
    playSound('sfx-tank');
    if (t[from] === 0) tankPick = null;
    renderTanks();
    checkTanks();
    return true;
}

// 모두 같은 높이가 되면 방어막이 깨짐
function checkTanks() {
    const b = bossOf(game);
    const msg = document.getElementById('tank-msg');
    if (!b || !b.shield) return;
    if (!tanksEven(b.tanks)) { msg.className = ''; msg.textContent = '통을 누른 다음 옮길 통을 눌러요. 끌어서 옮겨도 돼요. (한 칸씩)'; return; }
    if (b.solved) return;
    b.solved = true;
    const sum = b.first.reduce((a, x) => a + x, 0);
    msg.className = 'good';
    msg.textContent = `모두 ${b.tanks[0]}칸! (${b.first.join(' + ')}) ÷ ${b.first.length} = ${sum / b.first.length}, 바로 평균이에요!`;
    setTimeout(() => breakShield(b), 1900);
}

function breakShield(b) {
    if (!b.shield || !game.enemies.includes(b)) { b.solved = false; return; }
    if (game.state === 'paused') { setTimeout(() => breakShield(b), 300); return; }   // 상점에 있으면 돌아올 때까지 기다림
    b.solved = false;
    b.shield = false;
    b.stunUntil = game.gameTime + 7000;
    game.shakeBy(0.6);
    playSound('sfx-break');
    showToast('💥 방어막이 깨졌어요! 지금 고쳐요!');
    showSidePanel();
}

function setupTanks() {
    const box = document.getElementById('tank-row');
    const at = ev => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const t = el && el.closest ? el.closest('.tank') : null;
        return t ? Number(t.dataset.i) : null;
    };
    box.addEventListener('pointerdown', ev => {
        const i = at(ev);
        if (i === null || tankDown !== null) return;
        ev.preventDefault();
        tankDown = i;
        renderTanks();
    });
    window.addEventListener('pointerup', ev => {
        if (tankDown === null) return;
        const from = tankDown, to = at(ev);
        tankDown = null;
        if (to !== null && to !== from) { tankPick = null; moveEnergy(from, to); }          // 끌어서 옮기기
        else if (to === from) {                                                               // 눌러서 옮기기
            if (tankPick !== null && tankPick !== from) moveEnergy(tankPick, from);
            else tankPick = tankPick === from ? null : from;
        }
        renderTanks();
    });
    window.addEventListener('pointercancel', () => { tankDown = null; });
}

// ---------- 보스 등장 연출 (약 3초) ----------
// 예고(땅울림·그림자) → 착지(느리게 떨어짐·검은 띠) → 충격파·흔들림 → 이름표와 들쭉날쭉한 에너지 → 시작
// 연출 동안은 전투·타이머·문제 풀이가 멈춤. 두 번째 보스부터, 또는 전에 본 학생은 화면을 누르면 건너뜀.
// '동작 줄이기'를 켠 기기에서는 떨어짐·흔들림·충격파 없이 이름표만 짧게 보여 줌.
const INTRO_LONG = 3200, INTRO_SHORT = 1400;
const INTRO_LAND = 1250;   // 착지하는 순간

function startBossIntro(g, b) {
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const seen = store.getItem('bossIntroSeen') === '1';
    store.setItem('bossIntroSeen', '1');
    g.intro = { b, t: 0, len: reduce ? INTRO_SHORT : INTRO_LONG, reduce, skippable: seen || b.n > 1, landed: false };
    g.state = 'intro';
    pauseAllSound();   // 정적: 음악을 끊음
    if (!reduce) playIntroSound('sfx-time');   // 낮게 울리는 소리
}

function playIntroSound(id) {
    const a = document.getElementById(id);
    if (!a) return;
    try { a.currentTime = 0; } catch (e) { /* 아직 못 받은 소리 */ }
    a.play().catch(() => {});
}

function updateIntro(g, dt) {
    const it = g.intro;
    if (!it) return;
    it.t += dt;
    g.shake = Math.max(0, g.shake - dt * 0.0016);
    if (!it.reduce && it.t < INTRO_LAND && it.t > 300) g.shake = Math.max(g.shake, 0.18);   // 땅울림
    if (!it.reduce && !it.landed && it.t >= INTRO_LAND) {
        it.landed = true;
        playIntroSound('sfx-boss');
        g.shake = 0.95;
    }
    if (it.t >= it.len) endBossIntro(g);
}

function endBossIntro(g) {
    if (!g.intro) return;
    g.intro = null;
    if (g.state !== 'intro') return;
    g.state = 'playing';
    g.lastTime = performance.now();
    resumeMusic();
    showSidePanel();
}

function skipBossIntro(g) {
    const it = g.intro;
    if (!it || !it.skippable || it.t < 250) return;
    if (!it.landed && !it.reduce) { it.landed = true; g.shake = 0.4; }
    it.t = Math.max(it.t, it.len - 260);   // 바로 사라지기 시작
}

// 착지 전에는 보스를 위에서 떨어뜨려 그림 (0이면 제자리)
function bossDropOffset(g, b) {
    const it = g.intro;
    if (!it || it.b !== b) return 0;
    if (it.reduce) return 0;
    if (it.t < INTRO_LAND - 450) return null;   // 아직 안 보임
    const k = Math.min(1, (it.t - (INTRO_LAND - 450)) / 450);
    const slow = k < 0.75 ? k / 0.75 * 0.55 : 0.55 + (k - 0.75) / 0.25 * 0.45;   // 처음엔 빠르게, 땅에 닿기 직전 느리게
    return -(1 - slow) * (canvas.height * 0.9);
}

function drawBossIntro(g) {
    const it = g.intro;
    if (!it) return;
    const W = canvas.width, Hh = canvas.height, b = it.b, t = it.t, len = it.len;
    const out = Math.max(0, Math.min(1, (len - t) / 260));    // 끝날 때 사라지기
    const inn = Math.min(1, t / 260);
    const show = Math.min(inn, out);
    // 어둡게
    ctx.fillStyle = `rgba(5, 8, 20, ${0.38 * show})`;
    ctx.fillRect(0, 0, W, Hh);
    if (!it.reduce) {
        // 예고: 떨어질 자리에 그림자가 커짐
        if (t < INTRO_LAND) {
            const k = Math.min(1, t / INTRO_LAND);
            ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + 0.4 * k})`;
            ctx.beginPath(); ctx.ellipse(b.x, b.y + b.radius * 0.95, b.radius * (0.3 + 1.0 * k), b.radius * (0.08 + 0.22 * k), 0, 0, Math.PI * 2); ctx.fill();
            if (Math.floor(t / 220) % 2 === 0) {
                ctx.font = `${Math.round(40 * Math.max(0.7, g.scale))}px Jua, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fc8181';
                ctx.fillText('⚠ 경고 ⚠', W / 2, Hh * 0.3);
                ctx.textAlign = 'start';
            }
        }
        // 착지 충격파
        const s = t - INTRO_LAND;
        if (s > 0 && s < 700) {
            const k = s / 700;
            [[0, 10, '#e9d8fd'], [0.12, 5, '#b794f4']].forEach(([lag, lw, col]) => {
                const kk = Math.max(0, k - lag);
                ctx.globalAlpha = (1 - kk) * 0.9;
                ctx.strokeStyle = col;
                ctx.lineWidth = lw;
                ctx.beginPath(); ctx.ellipse(b.x, b.y + b.radius * 0.95, kk * W * 0.6, kk * W * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        }
    }
    // 이름표: 착지 뒤(동작 줄이기면 바로) 톡 나타나고, 들쭉날쭉한 에너지 막대가 하나씩 차오름
    const p0 = it.reduce ? 0 : INTRO_LAND + 100;
    if (t > p0) {
        const k = Math.min(1, (t - p0) / 220);
        const pop = it.reduce ? 1 : (k < 1 ? 0.7 + 0.45 * k : 1.15 - 0.15 * Math.min(1, (t - p0 - 220) / 150));
        const cy = Hh * 0.68, sc = Math.max(0.7, g.scale);
        ctx.save();
        ctx.globalAlpha = Math.min(k, out);
        ctx.translate(W / 2, cy);
        ctx.scale(pop, pop);
        const bw = Math.min(W * 0.86, 460 * sc), bh = 150 * sc;
        ctx.fillStyle = 'rgba(26, 16, 46, 0.88)';
        ctx.strokeStyle = '#b794f4';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 18) : ctx.rect(-bw / 2, -bh / 2, bw, bh);
        ctx.fill(); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d6bcfa';
        ctx.font = `${Math.round(16 * sc)}px Jua, sans-serif`;
        ctx.fillText(b.n > 1 ? `${b.n}번째 보스가 나타났어요!` : '보스가 나타났어요!', 0, -bh / 2 + 26 * sc);
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(38 * sc)}px Jua, sans-serif`;
        ctx.fillText('들쭉날쭉 보스', 0, -bh / 2 + 68 * sc);
        // 에너지 막대
        const n = b.tanks.length, colW = 26 * sc, gap = 14 * sc, maxH = 46 * sc, base = bh / 2 - 14 * sc;
        const x0 = -((n * colW + (n - 1) * gap) / 2);
        b.tanks.forEach((v, i) => {
            const fill = Math.max(0, Math.min(1, (t - p0 - 200 - i * 160) / 260));
            const h = maxH * v / TANK_MAX * fill;
            ctx.fillStyle = '#2d3748';
            ctx.fillRect(x0 + i * (colW + gap), base - maxH, colW, maxH);
            ctx.fillStyle = '#4fd1c5';
            ctx.fillRect(x0 + i * (colW + gap), base - h, colW, h);
        });
        ctx.restore();
        ctx.textAlign = 'start';
    }
    // 위아래 검은 띠 (영화 화면처럼)
    const bar = Hh * 0.1 * show;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, Hh - bar, W, bar);
    if (it.skippable && show > 0.5) {
        ctx.font = '16px Jua, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
        ctx.fillText('화면을 누르면 넘어가요 ▶', W - 16, Hh - bar / 2 + 6);
        ctx.textAlign = 'start';
    }
}

function setupBossIntro() {
    document.addEventListener('pointerdown', () => { if (game.state === 'intro') skipBossIntro(game); }, true);
}

// ---------- 그리기 ----------
function drawBoss(g, b) {
    const drop = bossDropOffset(g, b);
    if (drop === null) return;   // 등장 연출에서 아직 떨어지기 전
    if (drop) { ctx.save(); ctx.translate(0, drop); }
    drawBossBody(g, b);
    if (drop) ctx.restore();
}

function drawBossBody(g, b) {
    const fixedTint = g.gameTime < b.stunUntil;
    const wob = fixedTint ? Math.sin(g.gameTime / 60) * 3 : 0;
    drawSpriteFit(b.ice ? imgBossFrozen : imgBoss, b.x + wob, b.y, b.radius * 2.1, '#805ad5');
    drawIce(g, b);
    if (b.shield) {
        ctx.strokeStyle = '#d6bcfa';
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.6 + Math.sin(g.gameTime / 180) * 0.25;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * 1.15, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
    }
    const w = b.radius * 1.8, y = b.y - b.radius * 1.3;
    ctx.fillStyle = '#1a202c'; ctx.fillRect(b.x - w / 2, y, w, 10);
    ctx.fillStyle = b.shield ? '#718096' : '#b794f4'; ctx.fillRect(b.x - w / 2, y, w * Math.max(0, b.hp / b.maxHp), 10);
    // 들쭉날쭉한 에너지를 머리 위에 막대로
    if (b.shield) {
        const bw = 12 * g.scale + 4, x0 = b.x - (b.tanks.length * (bw + 5)) / 2;
        b.tanks.forEach((v, i) => {
            const h = v * 4 * Math.max(0.7, g.scale);
            ctx.fillStyle = '#4fd1c5';
            ctx.fillRect(x0 + i * (bw + 5), y - 8 - h, bw, h);
        });
    }
}

function drawOrbs(g) {
    g.orbs.forEach(o => {
        ctx.fillStyle = 'rgba(183, 148, 244, 0.4)';
        ctx.beginPath(); ctx.arc(o.x, o.y, 18 * g.scale + 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9d8fd';
        ctx.beginPath(); ctx.arc(o.x, o.y, 9 * g.scale + 3, 0, Math.PI * 2); ctx.fill();
    });
}
