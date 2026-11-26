// 대원 5명과 손동작 기술 (평균의 수호자)
// - 정답을 맞히면 기술 힘이 차고, 전투 화면에 손동작을 하면 기술이 나감. 손가락·마우스 모두 Pointer Events로 받음.
// - 여는 조건은 속도나 뽑기가 아니라 노력(누적 정답, 다시 도전, 보스 고치기)으로만 둠.

const CREW = [
    { id: 'blaster', name: '블래스터', skill: '관통 광선', gesture: '쭉 긋기', icon: '⚡', color: '#63b3ed', guide: '전투 화면을 쭉 그으면 광선이 나가요',
      need: 0, unlock: '처음부터 함께해요', have: () => 0 },
    { id: 'engineer', name: '방벽 기술자', skill: '에너지 벽', gesture: '선 그리기', icon: '🧱', color: '#ecc94b', guide: '선을 그리면 로봇을 막는 벽이 생겨요',
      need: 10, unlock: '정답 10개', have: () => countOf('mathGlobalCorrect') },
    { id: 'ice', name: '얼음 과학자', skill: '얼리기', gesture: '콕 찍기', icon: '❄️', color: '#9decf9', guide: '로봇이 모인 곳을 콕 찍으면 얼어요',
      need: 1, unlock: '보스 1번 고치기', have: () => crewStats().boss },
    { id: 'drone', name: '드론 조종사', skill: '치료 드론', gesture: '끌어서 옮기기', icon: '🛸', color: '#68d391', guide: '드론을 부르고 손가락으로 끌고 다녀요',
      need: 20, unlock: '한 번에 맞힌 문제 20개', have: () => crewStats().first },
    { id: 'time', name: '시간 요원', skill: '느린 시간', gesture: '꾹 누르기', icon: '⏳', color: '#b794f4', guide: '꾹 누르고 있으면 로봇이 느려져요',
      need: 10, unlock: '틀린 뒤 다시 맞힌 문제 10개 (또는 정답 60개)',
      have: () => countOf('mathGlobalCorrect') >= 60 ? 10 : crewStats().retry }
];

const ENERGY_MAX = 8;
const ENERGY_COST = 2;
const WALL_MS = 11000;
const ICE_R = 215;

function countOf(key) { return Math.max(0, parseInt(store.getItem(key)) || 0); }

// 대원을 여는 데 쓰는 누적 기록
function crewStats() {
    const s = localStorageHelper.load('crewStats');
    const n = k => (s && Number.isFinite(s[k]) ? s[k] : 0);
    return { first: n('first'), retry: n('retry'), boss: n('boss'), rescued: n('rescued') };
}
function addCrewStat(key, n = 1) {
    const s = crewStats();
    s[key] += n;
    localStorageHelper.save('crewStats', s);
}

function crewOf(id) { return CREW.find(c => c.id === id) || CREW[0]; }
function crewUnlocked(c) { return c.have() >= c.need; }
function selectedCrewId() {
    const c = crewOf(store.getItem('crew'));
    return crewUnlocked(c) ? c.id : 'blaster';
}

// 새로 열린 대원이 있으면 한 번만 알림
function checkCrewUnlocks(silent) {
    const seen = localStorageHelper.load('crewSeen');
    const list = Array.isArray(seen) ? seen : ['blaster'];
    const fresh = CREW.filter(c => crewUnlocked(c) && !list.includes(c.id));
    if (!fresh.length) return;
    localStorageHelper.save('crewSeen', [...list, ...fresh.map(c => c.id)]);
    if (!silent) showToast(`🎉 새 대원 합류! ${fresh.map(c => c.name).join(', ')} (다음 작전부터)`);
}

// 시작 화면의 대원 고르기
function renderCrewPicker() {
    const box = document.getElementById('crew-picker');
    if (!box) return;
    const current = selectedCrewId();
    box.innerHTML = '';
    CREW.forEach(c => {
        const open = crewUnlocked(c);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'crew-card' + (c.id === current ? ' chosen' : '') + (open ? '' : ' locked');
        card.style.setProperty('--crew', c.color);
        card.innerHTML = '<img alt=""><b></b><span class="crew-skill"></span><span class="crew-how"></span>';
        card.querySelector('img').src = `images/hero_${c.id}.webp?v=${window.VERSION}`;
        card.querySelector('b').textContent = c.name;
        card.querySelector('.crew-skill').textContent = open ? `${c.icon} ${c.skill}` : '🔒 잠김';
        card.querySelector('.crew-how').textContent = open ? c.gesture : `${c.unlock} (${Math.min(c.have(), c.need)}/${c.need})`;
        card.onclick = () => {
            if (!open) { showToast(`${c.name}: ${c.unlock} 하면 함께해요`); return; }
            store.setItem('crew', c.id);
            renderCrewPicker();
        };
        box.appendChild(card);
    });
    const g = document.getElementById('crew-guide');
    if (g) g.textContent = `${crewOf(current).icon} ${crewOf(current).guide}`;
}

// ---------- 전투 중 대원 상태 ----------
function newCrewState(id) {
    return { id, energy: ENERGY_COST, walls: [], beams: [], rings: [], drone: null, slowUntil: 0, gesture: null, hintAt: 0, shards: [], frost: [] };
}

// 기술 한 번의 세기: 강화를 할수록 기술도 세짐
function skillPower(g) {
    return g.player.damage * (1 + 0.3 * (g.player.projectileCount - 1)) * Math.sqrt(800 / Math.max(60, g.player.fireRate));
}

// 상점·랭킹 창처럼 게임을 멈춘 동안은 소리를 모두 멈추고, 다시 시작하면 배경 음악만 다시 켬
function pauseAllSound() {
    document.querySelectorAll('audio').forEach(a => a.pause());
}
function resumeMusic() {
    if (!document.hidden) document.getElementById('bgm').play().catch(() => {});
}

function playSound(id) {
    const a = document.getElementById(id);
    if (!a || (typeof game !== 'undefined' && game.state !== 'playing')) return;
    try { a.currentTime = 0; } catch (e) { /* 아직 못 받은 소리 */ }
    a.play().catch(() => {});
}

function gainEnergy(g, n) {
    g.crew.energy = Math.min(ENERGY_MAX, g.crew.energy + n);
    updateCrewGauge(g);
}

function spendEnergy(g) {
    if (g.crew.energy < ENERGY_COST) return false;
    g.crew.energy -= ENERGY_COST;
    updateCrewGauge(g);
    return true;
}

function updateCrewGauge(g) {
    const el = document.getElementById('crew-gauge');
    if (!el) return;
    const c = crewOf(g.crew.id);
    const ready = g.crew.energy >= ENERGY_COST;
    el.classList.toggle('ready', ready);
    el.style.setProperty('--crew', c.color);
    document.getElementById('crew-gauge-name').textContent = `${c.icon} ${c.skill}`;
    document.getElementById('crew-gauge-tip').textContent = g.crew.drone ? '드론을 끌어서 옮겨요' : ready ? `${c.gesture}!` : '문제를 맞히면 차요';
    document.querySelectorAll('#crew-gauge-pips i').forEach((p, i) => p.classList.toggle('on', i < g.crew.energy));
}

function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
    const x = a.x + dx * t, y = a.y + dy * t;
    return { d: Math.hypot(px - x, py - y), x, y };
}

// ---- 기술 5가지 ----
const CREW_SKILLS = {
    blaster(g, a, b) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const far = canvas.width + canvas.height;
        const p = { x: a.x - ux * far, y: a.y - uy * far }, q = { x: a.x + ux * far, y: a.y + uy * far };
        const width = 90 * g.scale;
        g.crew.beams.push({ p, q, width, life: 350 });
        const dmg = skillPower(g) * 5;
        [...g.enemies].forEach(e => { if (distToSegment(e.x, e.y, p, q).d < e.radius + width / 2) g.damageEnemy(e, dmg); });
        playSound('sfx-laser');
    },
    engineer(g, points) {
        g.crew.walls.push({ points, until: g.gameTime + WALL_MS });
        if (g.crew.walls.length > 3) g.crew.walls.shift();
        playSound('sfx-wall');
    },
    ice(g, at) {
        const r = ICE_R * g.scale;
        g.crew.rings.push({ x: at.x, y: at.y, r, life: 500, color: '#9decf9' });
        for (let i = 0; i < 26; i++) {   // 찍은 자리에서 눈꽃이 퍼짐
            const a = i / 26 * Math.PI * 2 + Math.random() * 0.2, sp = 4 + Math.random() * 4;
            g.crew.frost.push({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 550 + Math.random() * 250, size: 4 + Math.random() * 4 });
        }
        const dmg = skillPower(g) * 2.8;
        [...g.enemies].forEach(e => {
            if (Math.hypot(e.x - at.x, e.y - at.y) > r + e.radius * 0.5) return;
            encaseInIce(g, e, e.boss ? 2500 : 6000);
            g.damageEnemy(e, dmg);
        });
        playSound('sfx-ice');
    },
    drone(g, at) {
        g.crew.drone = { x: g.player.x, y: g.player.y, tx: at.x, ty: at.y, until: g.gameTime + 10000, fireAt: 0, shot: null };
        playSound('sfx-drone');
        updateCrewGauge(g);
    },
    time(g) {
        g.crew.slowUntil = Math.max(g.crew.slowUntil, g.gameTime) + 9000;
        g.crew.rings.push({ x: g.player.x, y: g.player.y, r: Math.max(canvas.width, canvas.height) * 0.7, life: 700, color: '#b794f4' });
        playSound('sfx-time');
    }
};

// 로봇이 움직이는 빠르기 (얼음 0, 느린 시간 0.2). 느린 시간에는 치료 광선도 더 빨리 나감
function firePace(g) { return g.gameTime < g.crew.slowUntil ? 0.6 : 1; }
function enemyPace(g, e) {
    if (e.frozenUntil > g.gameTime) return 0;
    return g.gameTime < g.crew.slowUntil ? 0.2 : 1;
}

// 벽에 닿으면 들어온 쪽으로 밀려남
function blockByWalls(g, e) {
    let touched = false;
    g.crew.walls.forEach(w => {
        for (let i = 1; i < w.points.length; i++) {
            const c = distToSegment(e.x, e.y, w.points[i - 1], w.points[i]);
            const limit = e.radius * 0.7 + 8;
            if (c.d >= limit) continue;
            const d = c.d || 0.01;
            e.x = c.x + (e.x - c.x) / d * limit;
            e.y = c.y + (e.y - c.y) / d * limit;
            touched = true;
        }
    });
    return touched;
}

function updateCrew(g, dt) {
    const s = g.crew;
    updateIce(g, dt);
    s.walls = s.walls.filter(w => w.until > g.gameTime);
    s.beams.forEach(b => { b.life -= dt; });
    s.beams = s.beams.filter(b => b.life > 0);
    s.rings.forEach(r => { r.life -= dt; });
    s.rings = s.rings.filter(r => r.life > 0);

    // 벽은 닿은 로봇을 조금씩 고침
    if (s.walls.length) {
        [...g.enemies].forEach(e => {
            if (!blockByWalls(g, e) || g.gameTime < (e.wallAt || 0)) return;
            e.wallAt = g.gameTime + 500;
            g.damageEnemy(e, skillPower(g) * 1.1);
        });
    }

    // 꾹 누르기: 0.45초
    const ge = s.gesture;
    if (ge && s.id === 'time' && !ge.done && performance.now() - ge.at >= 450) {
        ge.done = true;
        if (spendEnergy(g)) CREW_SKILLS.time(g);
    }

    const d = s.drone;
    if (!d) return;
    if (d.until <= g.gameTime) { s.drone = null; updateCrewGauge(g); return; }
    const gap = Math.hypot(d.tx - d.x, d.ty - d.y);
    const step = Math.min(gap, 0.9 * dt);
    if (gap > 0.5) { d.x += (d.tx - d.x) / gap * step; d.y += (d.ty - d.y) / gap * step; }
    if (d.shot && (d.shot.life -= dt) <= 0) d.shot = null;
    if (g.gameTime < d.fireAt) return;
    const range = 260 * g.scale;
    let best = null, bd = range;
    g.enemies.forEach(e => {
        if (e.shield) return;
        const k = Math.hypot(e.x - d.x, e.y - d.y) - e.radius;
        if (k < bd) { bd = k; best = e; }
    });
    if (best) {
        d.fireAt = g.gameTime + 300;
        d.shot = { x: best.x, y: best.y, life: 120 };
        g.damageEnemy(best, skillPower(g) * 0.42);
    }
}

// ---------- 얼음 감옥 ----------
// 찍은 자리에서 서리가 퍼지고, 닿은 로봇은 각진 얼음덩어리에 갇힘. 풀리기 직전엔 금이 가며 떨리다가 조각으로 깨짐.
const ICE_APPEAR = 220, ICE_CRACK = 1300;

function encaseInIce(g, e, ms) {
    const until = g.gameTime + ms;
    if (e.ice && e.frozenUntil > g.gameTime) { e.frozenUntil = Math.max(e.frozenUntil, until); return; }   // 이미 갇혀 있으면 시간만 늘림
    e.frozenUntil = until;
    const n = 9;
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i / n * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        pts.push([a, 0.98 + Math.random() * 0.3 + (Math.abs(Math.sin(a)) > 0.85 && Math.sin(a) < 0 ? 0.18 : 0)]);   // 위쪽은 뾰족하게
    }
    const cracks = [];
    for (let k = 0; k < 4; k++) {   // 가운데 근처에서 바깥으로 뻗는 금
        let a = Math.random() * Math.PI * 2, r = 0.1, line = [[a, r]];
        for (let j = 0; j < 4; j++) { a += (Math.random() - 0.5) * 0.7; r += 0.22 + Math.random() * 0.1; line.push([a, Math.min(1, r)]); }
        cracks.push(line);
    }
    e.ice = { at: g.gameTime, pts, cracks, tilt: (Math.random() - 0.5) * 0.25 };
    for (let i = 0; i < 10; i++) {   // 얼어붙는 순간 튀는 서리
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3;
        g.crew.frost.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 400 + Math.random() * 200, size: 3 + Math.random() * 3 });
    }
}

// 얼음이 깨지며 조각이 튐
function shatterIce(g, e) {
    if (!e.ice) return;
    const R = e.radius * (e.boss ? 1.2 : 1.15);
    e.ice.pts.forEach(([a, k], i) => {
        const [b, m] = e.ice.pts[(i + 1) % e.ice.pts.length];
        const x1 = Math.cos(a) * R * k, y1 = Math.sin(a) * R * k, x2 = Math.cos(b) * R * m, y2 = Math.sin(b) * R * m;
        const mid = (a + b) / 2, sp = 3 + Math.random() * 3;
        g.crew.shards.push({ x: e.x, y: e.y, pts: [[0, 0], [x1, y1], [x2, y2]].map(([x, y]) => [x * 0.55, y * 0.55]),
            vx: Math.cos(mid) * sp, vy: Math.sin(mid) * sp - 2.5, rot: 0, vr: (Math.random() - 0.5) * 0.3, life: 750 });
    });
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
        g.crew.frost.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 500, size: 2 + Math.random() * 3 });
    }
    e.ice = null;
    g.crew.shards = g.crew.shards.slice(-120);
    playSound('sfx-ice');
}

function updateIce(g, dt) {
    const s = g.crew, f = dt * 0.06;
    g.enemies.forEach(e => { if (e.ice && g.gameTime >= e.frozenUntil) shatterIce(g, e); });
    s.shards.forEach(p => { p.life -= dt; p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.25 * f; p.rot += p.vr * f; });
    s.shards = s.shards.filter(p => p.life > 0);
    s.frost.forEach(p => { p.life -= dt; p.x += p.vx * f; p.y += p.vy * f; p.vx *= 0.96; p.vy *= 0.96; });
    s.frost = s.frost.filter(p => p.life > 0).slice(-200);
}

function iceShape(e, R, grow) {
    ctx.beginPath();
    e.ice.pts.forEach(([a, k], i) => {
        const x = e.x + Math.cos(a) * R * k * grow, y = e.y + Math.sin(a) * R * k * grow;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
}

// 로봇 위에 얼음덩어리를 그림
function drawIce(g, e) {
    if (!e.ice) return;
    const t = g.gameTime - e.ice.at, left = e.frozenUntil - g.gameTime;
    const k = Math.min(1, t / ICE_APPEAR);
    const grow = k < 1 ? 1 + 0.25 * Math.sin(k * Math.PI) - 0.25 * (1 - k) : 1;   // 톡 커졌다 자리잡기
    const R = e.radius * (e.boss ? 1.2 : 1.15);
    const shake = left < 600 ? Math.sin(g.gameTime / 25) * 2.5 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    // 얼음 몸통: 위는 밝고 아래는 푸르게
    const grad = ctx.createLinearGradient(e.x - R, e.y - R, e.x + R, e.y + R);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.45, 'rgba(178, 235, 255, 0.32)');
    grad.addColorStop(1, 'rgba(99, 179, 237, 0.45)');
    iceShape(e, R, grow);
    ctx.fillStyle = grad;
    ctx.fill();
    // 면이 꺾이는 선 (각진 얼음처럼)
    ctx.save();
    iceShape(e, R, grow);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    const cx = e.x - R * 0.15, cy = e.y - R * 0.2;
    e.ice.pts.forEach(([a, m], i) => {
        if (i % 2) return;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(e.x + Math.cos(a) * R * m, e.y + Math.sin(a) * R * m); ctx.stroke();
    });
    // 얼어붙는 순간 비스듬한 빛이 한 번 쓸고 지나감
    if (t < 700) {
        const p = t / 700, bx = e.x - R * 1.4 + p * R * 2.8;
        const glint = ctx.createLinearGradient(bx - 30, e.y - R, bx + 30, e.y + R);
        glint.addColorStop(0, 'rgba(255,255,255,0)'); glint.addColorStop(0.5, 'rgba(255,255,255,0.75)'); glint.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glint;
        ctx.fillRect(e.x - R * 1.5, e.y - R * 1.5, R * 3, R * 3);
    }
    // 반짝이는 윗면
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath(); ctx.ellipse(e.x - R * 0.35, e.y - R * 0.55, R * 0.28, R * 0.09, -0.5, 0, Math.PI * 2); ctx.fill();
    // 풀리기 직전 금이 감
    if (left < ICE_CRACK) {
        const c = 1 - left / ICE_CRACK;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        e.ice.cracks.forEach(line => {
            const upto = Math.max(1, Math.round(c * (line.length - 1)) + 1);
            ctx.beginPath();
            line.slice(0, upto).forEach(([a, r], i) => {
                const x = e.x + Math.cos(a) * R * r, y = e.y + Math.sin(a) * R * r;
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            ctx.stroke();
        });
    }
    ctx.restore();
    // 테두리
    iceShape(e, R, grow);
    ctx.strokeStyle = 'rgba(235, 248, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 발밑 서리
    ctx.fillStyle = 'rgba(235, 248, 255, 0.4)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.98, R * 0.85, R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawSnowflake(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
}

// 깨진 조각과 서리 가루
function drawIceBits(g) {
    const s = g.crew;
    s.shards.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 300);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); p.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        ctx.fillStyle = 'rgba(190, 235, 255, 0.75)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
    });
    ctx.strokeStyle = '#e6fffa';
    ctx.lineWidth = 1.5;
    s.frost.forEach(p => {
        ctx.globalAlpha = Math.min(1, p.life / 250);
        drawSnowflake(p.x, p.y, p.size);
    });
    ctx.globalAlpha = 1;
}

// ---------- 구조 파동 (상점 아이템) ----------
// 용사에게 빛이 모였다가 물결로 퍼지고, 물결이 지나가는 로봇부터 차례로 고쳐짐 (보스는 바이러스 30%)
const WAVE_CHARGE = 250, WAVE_SPREAD = 950;
function startRescueWave(g) {
    const far = Math.max(...[[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]]
        .map(([x, y]) => Math.hypot(x - g.player.x, y - g.player.y))) + 60;
    g.waves.push({ x: g.player.x, y: g.player.y, t: 0, r: 0, max: far, hit: new Set(), sparks: [] });
    playSound('sfx-time');
}

function waveRadius(w) {
    if (w.t < WAVE_CHARGE) return 0;
    const k = Math.min(1, (w.t - WAVE_CHARGE) / WAVE_SPREAD);
    return w.max * (1 - Math.pow(1 - k, 3));   // 처음엔 빠르고 끝으로 갈수록 천천히
}

function updateWaves(g, dt) {
    g.waves.forEach(w => {
        w.t += dt;
        if (w.t >= WAVE_CHARGE && !w.released) {   // 모았던 힘을 터뜨림
            w.released = true;
            playSound('sfx-hit');
            g.shakeBy(0.55);
            g.flash = 1;
        }
        w.r = waveRadius(w);
        if (w.released) {
            [...g.enemies].forEach(e => {
                if (w.hit.has(e) || Math.hypot(e.x - w.x, e.y - w.y) > w.r + e.radius * 0.5) return;
                w.hit.add(e);
                if (e.boss) g.damageEnemy(e, e.maxHp * 0.3);
                else g.killEnemy(g.enemies.indexOf(e));
            });
        }
        // 물결 둘레의 반짝이
        if (w.released && w.r < w.max) {
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2;
                w.sparks.push({ x: w.x + Math.cos(a) * w.r, y: w.y + Math.sin(a) * w.r, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 450 });
            }
        }
        w.sparks.forEach(s => { s.life -= dt; s.x += s.vx * dt * 0.06; s.y += s.vy * dt * 0.06; });
        w.sparks = w.sparks.filter(s => s.life > 0).slice(-160);
    });
    g.waves = g.waves.filter(w => w.t < WAVE_CHARGE + WAVE_SPREAD + 500);
    g.flash = Math.max(0, (g.flash || 0) - dt / 260);
}

function drawWaves(g) {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const label = '💫 구조 파동!';
    g.waves.forEach(w => {
        if (w.t < WAVE_CHARGE) {   // 모으기: 용사 둘레로 빛이 빨려 들어옴
            const k = w.t / WAVE_CHARGE;
            ctx.strokeStyle = '#f6e05e';
            ctx.lineWidth = 4 + 6 * k;
            ctx.globalAlpha = 0.4 + 0.6 * k;
            ctx.beginPath(); ctx.arc(w.x, w.y, 160 * g.scale * (1 - k) + 40 * g.scale, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            return;
        }
        const k = Math.min(1, (w.t - WAVE_CHARGE) / WAVE_SPREAD);
        const fade = 1 - Math.max(0, (w.t - WAVE_CHARGE - WAVE_SPREAD) / 500);
        // 물결이 지나간 안쪽은 옅은 초록
        ctx.globalAlpha = 0.18 * (1 - k) * fade;
        ctx.fillStyle = '#68d391';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
        // 두꺼운 초록 물결 + 얇은 흰 테두리
        [[46, '#68d391', 0.35], [18, '#9ae6b4', 0.7], [5, '#ffffff', 1]].forEach(([lw, col, al]) => {
            ctx.globalAlpha = al * fade;
            ctx.strokeStyle = col;
            ctx.lineWidth = lw * (1 - 0.5 * k) * Math.max(0.7, g.scale);
            ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.fillStyle = '#f6e05e';
        w.sparks.forEach(s => {
            ctx.globalAlpha = Math.min(1, s.life / 300) * fade;
            ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
        });
        // 글자가 톡 커졌다가 사라짐
        if (w.t < WAVE_CHARGE + 900) {
            const tk = (w.t - WAVE_CHARGE) / 900;
            const pop = tk < 0.2 ? 0.6 + 2.4 * tk : 1.08 - 0.08 * Math.min(1, (tk - 0.2) * 4);
            ctx.globalAlpha = Math.min(1, (1 - tk) * 2);
            ctx.font = Math.round(44 * Math.max(0.7, g.scale) * pop) + 'px Jua, sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#1a202c';
            ctx.strokeText(label, w.x, w.y - 110 * g.scale);
            ctx.fillStyle = '#f0fff4';
            ctx.fillText(label, w.x, w.y - 110 * g.scale);
            ctx.textAlign = 'start';
        }
    });
    ctx.globalAlpha = 1;
    if (g.flash > 0 && !reduce) {
        ctx.fillStyle = 'rgba(240, 255, 244, ' + (0.35 * g.flash) + ')';
        ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    }
}

// ---- 그리기 ----
function drawCrewUnder(g) {
    const s = g.crew;
    if (g.gameTime < s.slowUntil) {
        ctx.fillStyle = 'rgba(128, 90, 213, 0.16)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.walls.forEach(w => {
        const left = (w.until - g.gameTime) / WALL_MS;
        [[16, 0.25], [6, 0.9]].forEach(([lw, al]) => {
            ctx.globalAlpha = al * Math.min(1, left * 4);
            ctx.strokeStyle = '#f6e05e';
            ctx.lineWidth = lw * Math.max(0.7, g.scale);
            ctx.beginPath();
            w.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.stroke();
        });
    });
    ctx.globalAlpha = 1;
}

function drawCrewOver(g) {
    const s = g.crew;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.beams.forEach(b => {
        const k = b.life / 350;
        [[b.width, '#63b3ed', 0.35], [b.width * 0.5, '#bee3f8', 0.7], [b.width * 0.2, '#ffffff', 1]].forEach(([lw, col, al]) => {
            ctx.globalAlpha = al * k;
            ctx.strokeStyle = col;
            ctx.lineWidth = lw * (0.4 + 0.6 * k);
            ctx.beginPath(); ctx.moveTo(b.p.x, b.p.y); ctx.lineTo(b.q.x, b.q.y); ctx.stroke();
        });
    });
    s.rings.forEach(r => {
        const k = Math.max(0, r.life / 600);
        ctx.globalAlpha = Math.min(0.8, k);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const d = s.drone;
    if (d) {
        if (d.shot) {
            ctx.strokeStyle = '#9ae6b4'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.shot.x, d.shot.y); ctx.stroke();
        }
        const r = 22 * Math.max(0.7, g.scale);
        ctx.fillStyle = '#2f855a'; ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.35, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9ae6b4'; ctx.beginPath(); ctx.arc(d.x, d.y - r * 0.25, r * 0.6, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#f0fff4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.35, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        // 남은 시간
        ctx.strokeStyle = '#68d391'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 1.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.until - g.gameTime) / 10000); ctx.stroke();
    }
    const ge = s.gesture;
    if (!ge) return;
    const now = ge.now;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = ctx.fillStyle = crewOf(s.id).color;
    if (s.id === 'blaster') {
        ctx.lineWidth = 6; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(ge.start.x, ge.start.y); ctx.lineTo(now.x, now.y); ctx.stroke(); ctx.setLineDash([]);
    } else if (s.id === 'engineer') {
        ctx.lineWidth = 6;
        ctx.beginPath(); ge.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    } else if (s.id === 'ice') {
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(now.x, now.y, ICE_R * g.scale, 0, Math.PI * 2); ctx.stroke();
    } else if (s.id === 'time' && !ge.done) {
        const k = Math.min(1, (performance.now() - ge.at) / 450);
        ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(now.x, now.y, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

// ---- 손동작 ----
function setupCrewGestures() {
    const pos = ev => {
        const r = canvas.getBoundingClientRect();
        return { x: (ev.clientX - r.left) * canvas.width / (r.width || 1), y: (ev.clientY - r.top) * canvas.height / (r.height || 1) };
    };
    const hint = text => {
        const s = game.crew;
        if (performance.now() - s.hintAt < 1200) return;
        s.hintAt = performance.now();
        showToast(text);
    };
    canvas.addEventListener('pointerdown', ev => {
        if (game.state !== 'playing' || game.crew.gesture || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        ev.preventDefault();
        const s = game.crew, p = pos(ev);
        if (s.energy < ENERGY_COST && !s.drone) { hint('⚡ 문제를 맞히면 기술을 쓸 수 있어요!'); return; }
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 안 되는 기기 */ }
        s.gesture = { pid: ev.pointerId, start: p, now: p, points: [p], len: 0, at: performance.now(), done: false };
        if (s.id === 'drone' && s.drone) { s.drone.tx = p.x; s.drone.ty = p.y; }
    });
    canvas.addEventListener('pointermove', ev => {
        const s = game.crew, ge = s.gesture;
        if (!ge || ge.pid !== ev.pointerId) return;
        const p = pos(ev);
        ge.now = p;
        if (s.id === 'engineer') {
            const last = ge.points[ge.points.length - 1];
            const step = Math.hypot(p.x - last.x, p.y - last.y);
            if (step >= 12 && ge.len < 360 * game.scale) { ge.points.push(p); ge.len += step; }
        }
        if (s.id === 'drone' && s.drone) { s.drone.tx = p.x; s.drone.ty = p.y; }
    });
    canvas.addEventListener('pointerup', ev => {
        const g = game, s = g.crew, ge = s.gesture;
        if (!ge || ge.pid !== ev.pointerId) return;
        s.gesture = null;
        if (g.state !== 'playing') return;
        const p = pos(ev), moved = Math.hypot(p.x - ge.start.x, p.y - ge.start.y);
        if (s.id === 'blaster') {
            if (moved < 50 * g.scale) { hint('손가락으로 쭉 그어 보세요!'); return; }
            if (spendEnergy(g)) CREW_SKILLS.blaster(g, ge.start, p);
        } else if (s.id === 'engineer') {
            if (ge.len < 50 * g.scale) { hint('선을 길게 그려 보세요!'); return; }
            if (spendEnergy(g)) CREW_SKILLS.engineer(g, ge.points);
        } else if (s.id === 'ice') {
            if (spendEnergy(g)) CREW_SKILLS.ice(g, p);
        } else if (s.id === 'drone') {
            if (!s.drone && spendEnergy(g)) CREW_SKILLS.drone(g, p);
        } else if (s.id === 'time') {
            if (!ge.done) hint('손가락을 떼지 말고 꾹 눌러 보세요!');
        }
    });
    canvas.addEventListener('pointercancel', () => { game.crew.gesture = null; });
}
