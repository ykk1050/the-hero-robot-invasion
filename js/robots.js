// 로봇 4종과 강화 (평균의 수호자)
// - 로봇마다 잘 통하는 강화가 달라서, 한 가지만 몰아 찍으면 어떤 로봇에게는 밀림 → 상황을 보고 고르게 찍어야 오래 버팀.
// - 강화에는 최대치가 없음. 대신 연사력·방어는 고를수록 조금씩 덜 늘어나고, 다중 사격의 늘어난 발은 70% 세기.

// 난이도 손잡이 (자동 전투로 맞춘 값: 상황 보고 찍으면 30분 넘게, 한 가지만 몰아 찍으면 3~5분)
const BAL = {
    lateFrom: 300,          // 이때부터 시간에 따라 로봇이 세짐(초)
    timeHp: 0.2,            // 1초마다 늘어나는 체력
    timeSpeed: 0.002,       // 1초마다 늘어나는 빠르기
    maxSpeed: 3.0,
    armorLevel: 2.2,        // 레벨 1마다 늘어나는 철갑
    spawnSlope: 1.2,          // 4분 뒤 1초마다 줄어드는 출현 간격(ms)
    spawnFloor: 550,        // 가장 짧은 출현 간격(ms)
    extra1: 0.08,           // 4분 뒤 한 마리 더 나올 확률
    extra2: 0.15            // 8분 뒤 한 마리 더 나올 확률
};

// 로봇이 나오는 간격(ms): 4분까지 2초 → 약 1초, 그 뒤로 천천히 짧아짐
function spawnInterval(sec) {
    if (sec < 240) return 2000 - sec * 4;
    return Math.max(BAL.spawnFloor, 1040 - (sec - 240) * BAL.spawnSlope);
}

const ROBOT_TYPES = {
    normal:  { name: '치우친 로봇', icon: '', img: 'robot', hp: 1, speed: 1, radius: 50 },
    armored: { name: '철갑 로봇', icon: '⚔️', counter: '공격력', img: 'robot_armored', hp: 1.5, speed: 0.75, radius: 58, from: 70, weight: 0.4 },
    swarm:   { name: '떼 로봇', icon: '💥', counter: '다중 사격', img: 'robot_swarm', hp: 0.32, speed: 1.15, radius: 30, from: 100, weight: 0.3 },
    fast:    { name: '날쌘 로봇', icon: '⚡', counter: '연사력', img: 'robot_fast', hp: 0.6, speed: 2.1, radius: 40, from: 40, weight: 0.35 },
    turret:  { name: '포탑 로봇', icon: '❤️', counter: '체력', img: 'robot_turret', hp: 1.25, speed: 0.9, radius: 54, from: 130, weight: 0.3 }
};

// ---------- 강화 ----------
const UPGRADES = {
    d: { name: '공격력 +10', hint: '⚔️ 철갑 로봇에 강해요' },
    h: { name: '체력 +50 · 방어', hint: '❤️ 포탑 로봇에 강해요' },
    f: { name: '연사력 UP', hint: '⚡ 날쌘 로봇에 강해요' },
    m: { name: '다중 사격 +1', hint: '💥 떼 로봇에 강해요' }
};

function upgradeCounts(p) {
    if (!p.ups || typeof p.ups !== 'object') p.ups = { d: 0, h: 0, f: 0, m: 0 };
    ['d', 'h', 'f', 'm'].forEach(k => { if (!Number.isFinite(p.ups[k])) p.ups[k] = 0; });
    return p.ups;
}

// 1초에 쏘는 발 수: 처음엔 0.5발씩, 고를수록 조금씩 덜 늘어남 (최대치 없음)
function shotsPerSec(nFire) {
    let s = 1.25;
    for (let i = 0; i < nFire; i++) s += 0.5 / (1 + 0.12 * i);
    return s;
}

// 받는 피해 비율: 체력 강화를 고를수록 줄지만 줄어드는 정도도 점점 작아짐
function damageTaken(p) { return 1 / (1 + 0.15 * upgradeCounts(p).h); }

function applyUpgrade(g, key) {
    const p = g.player, u = upgradeCounts(p);
    u[key]++;
    if (key === 'd') p.damage += 10;
    if (key === 'h') { p.maxHp += 50; p.hp = p.maxHp; }
    if (key === 'f') p.fireRate = 1000 / shotsPerSec(u.f);
    if (key === 'm') p.projectileCount++;
}

// 화면에 보여 줄 '내 강화 평균' (게임에는 영향 없음)
function upgradeAverageText(p) {
    const u = upgradeCounts(p), total = u.d + u.h + u.f + u.m;
    if (!total) return '아직 없음';
    const avg = Math.round(total / 4 * 100) / 100;
    return `${avg} (공${u.d} 체${u.h} 연${u.f} 다${u.m})`;
}

// ---------- 로봇 만들기 ----------
function pickRobotType(g) {
    const sec = g.gameTime / 1000;
    const list = [['normal', 1]];
    Object.entries(ROBOT_TYPES).forEach(([k, t]) => { if (t.from !== undefined && sec >= t.from) list.push([k, t.weight]); });
    let r = Math.random() * list.reduce((a, x) => a + x[1], 0);
    for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
    return 'normal';
}

// 철갑: 한 번 맞을 때 이만큼 덜 아픔 (약한 공격은 거의 막음)
function armorOf(g) { return 6 + g.player.level * BAL.armorLevel + Math.max(0, g.gameTime / 1000 - BAL.lateFrom) * 0.03; }

function makeRobot(g, x, y, hp, speed) {
    const type = pickRobotType(g), t = ROBOT_TYPES[type];
    const one = (xx, yy) => ({ x: xx, y: yy, type, hp: hp * t.hp, maxHp: hp * t.hp, radius: t.radius * g.scale, speed: speed * t.speed,
        armor: type === 'armored' ? armorOf(g) : 0, shotAt: g.gameTime + 2500 + Math.random() * 1500 });
    const list = [one(x, y)];
    if (type === 'swarm') for (let i = 0; i < 4; i++) list.push(one(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90));
    list.forEach(e => g.enemies.push(e));
    if (type !== 'normal' && !g.seenTypes[type]) {   // 이 판에서 처음 나오면 약점을 알려 줌
        g.seenTypes[type] = true;
        showToast(`${t.icon} ${t.name} 등장! ${t.counter}이(가) 잘 통해요`);
    }
}

// 포탑 로봇은 멀리 멈춰 서서 에너지를 쏨
function robotPace(g, e) {
    if (e.type !== 'turret') return 1;
    return Math.hypot(e.x - g.player.x, e.y - g.player.y) < 300 * g.scale ? 0 : 1;
}

function updateRobots(g) {
    g.enemies.forEach(e => {
        if (e.type !== 'turret' || g.gameTime < e.shotAt || enemyPace(g, e) === 0) return;
        if (Math.hypot(e.x - g.player.x, e.y - g.player.y) > 330 * g.scale) return;
        e.shotAt = g.gameTime + 3400;
        const a = Math.atan2(g.player.y - e.y, g.player.x - e.x);
        g.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.6, vy: Math.sin(a) * 3.6, life: 5000, dmg: 6, small: true });
    });
}

// 맞을 때 실제로 들어가는 세기 (철갑은 덜 아픔, 그래도 15%는 들어감)
function hitAmount(e, dmg) {
    if (!e.armor) return dmg;
    return Math.max(dmg * 0.15, dmg - e.armor);
}

// ---------- 그리기 ----------
const robotImgs = {};
function robotImg(type) {
    if (!robotImgs[type]) robotImgs[type] = loadSprite(`images/${ROBOT_TYPES[type].img}.webp?v=${window.VERSION}`);
    return robotImgs[type];
}

function drawRobot(g, e) {
    const type = ROBOT_TYPES[e.type] ? e.type : 'normal', t = ROBOT_TYPES[type];
    drawSpriteFit(e.ice ? imgEnemyFrozen : robotImg(type), e.x, e.y, e.radius * 2.1, '#b83280');
    drawIce(g, e);
    // 남은 바이러스
    const w = Math.max(26, e.radius * 0.8);
    ctx.fillStyle = '#1a202c'; ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 6);
    ctx.fillStyle = '#b794f4'; ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), 6);
    // 약점 표시
    if (t.icon) {
        const bx = e.x + w / 2 + 10, by = e.y - e.radius - 8, r = 11;
        ctx.fillStyle = 'rgba(26, 32, 44, 0.85)';
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.icon, bx, by + 1);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
}
