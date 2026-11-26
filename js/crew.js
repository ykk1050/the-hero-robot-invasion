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
    return { id, energy: ENERGY_COST, walls: [], beams: [], rings: [], drone: null, slowUntil: 0, gesture: null, hintAt: 0 };
}

// 기술 한 번의 세기: 강화를 할수록 기술도 세짐
function skillPower(g) {
    return g.player.damage * (1 + 0.3 * (g.player.projectileCount - 1)) * Math.sqrt(800 / Math.max(60, g.player.fireRate));
}

function playSound(id) {
    const a = document.getElementById(id);
    if (!a) return;
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
        const dmg = skillPower(g) * 2.8;
        [...g.enemies].forEach(e => {
            if (Math.hypot(e.x - at.x, e.y - at.y) > r + e.radius * 0.5) return;
            e.frozenUntil = g.gameTime + (e.boss ? 2500 : 6000);
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
