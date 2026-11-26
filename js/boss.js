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
        boss: true, n, x: g.player.x + Math.cos(angle) * canvas.width * 0.6, y: g.player.y + Math.sin(angle) * canvas.height * 0.6,
        hp, maxHp: hp, radius: 95 * g.scale, speed: 0.7, shield: true, phase: 1, phases: n >= 3 ? 2 : 1,
        tanks, first: [...tanks], shotAt: g.gameTime + 6000, stunUntil: 0, frozenUntil: 0
    });
    g.shakeBy(0.5);
    playSound('sfx-boss');
    showToast('⚠️ 들쭉날쭉 보스 등장! 에너지를 고르게 나눠요');
    showSidePanel();
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

// ---------- 그리기 ----------
function drawBoss(g, b) {
    const fixedTint = g.gameTime < b.stunUntil;
    const wob = fixedTint ? Math.sin(g.gameTime / 60) * 3 : 0;
    drawSpriteFit(imgBoss, b.x + wob, b.y, b.radius * 2.1, '#805ad5');
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
