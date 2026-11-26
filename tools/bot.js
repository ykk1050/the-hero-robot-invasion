// playtest 전용 봇: 시작 → 문제 8개 맞히기(오답 한 번 섞기) → 보상 → 보스(에너지 고르게 나누기) → 기술 → 상점 → 랭킹 창 → 이어하기 저장까지 눌러 봄.
// 실행: sh /d/자동화/playtest/run.sh /d/자동화/the-hero-robot-invasion --path "index.html?ranktest=1" --bot /d/자동화/the-hero-robot-invasion/tools/bot.js
// 반드시 ?ranktest=1 로 돌릴 것 (실제 랭킹 서버에 기록이 남지 않게)
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!RANK_TEST) return { 막힘: '?ranktest=1 이 아니라서 멈춤' };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= -1; };
  document.querySelector('.start-btn').click();
  await wait(500);
  const out = { 맞힘: 0, 막힘: null, 제출버튼보임: visible(document.querySelector('.virtual-keypad .submit')) };
  game.player.hp = game.player.maxHp = 1e6;
  const keys = [...document.querySelectorAll('.virtual-keypad button')];
  const press = d => keys.find(k => k.textContent.trim() === String(d)).click();
  for (let i = 0; i < 8; i++) {
    await wait(350);
    if (i === 2) { press(0); keys.find(k => k.textContent.includes('제출')).click(); await wait(50); }
    const before = game.player.level;
    document.getElementById('answer-input').value = '';
    String(currentProblem.answer).split('').forEach(press);
    keys.find(k => k.textContent.includes('제출')).click();
    await wait(50);
    const cards = [...document.querySelectorAll('.upgrade-card')];
    if (cards.length !== 4 || !cards.every(visible)) { out.막힘 = `보상 카드가 안 보임 (${i + 1}번째)`; return out; }
    cards[i % 4].click();
    if (game.player.level !== before + 1) { out.막힘 = '레벨이 안 오름'; return out; }
    out.맞힘++;
    await wait(60);
    for (let k = 0; k < 50 && game.state === 'intro'; k++) await wait(100);   // 보스 등장 연출이 끝날 때까지
    const boss = bossOf(game);
    if (boss && boss.shield) {
      out.보스 = (out.보스 || 0) + 1;
      if (!visible(document.getElementById('tank-msg'))) { out.막힘 = '에너지 통이 다 안 보임'; return out; }
      for (let k = 0; k < 30 && !tanksEven(boss.tanks); k++) {
        const t = boss.tanks;
        moveEnergy(t.indexOf(Math.max(...t)), t.indexOf(Math.min(...t)));
      }
      await wait(2200);
      if (boss.shield || getComputedStyle(document.getElementById('quiz-container')).display === 'none') { out.막힘 = '방어막이 안 깨짐'; return out; }
    }
  }
  const hold = bossOf(game);
  if (hold) { game.damageEnemy(hold, 1e9); out.보스고침 = game.stats.boss; }
  out.기술 = CREW.map(c => {
    game.crew.id = c.id;
    const a = { x: 100, y: 100 }, b = { x: 300, y: 200 };
    try { CREW_SKILLS[c.id](game, c.id === 'engineer' ? [a, b] : a, b); return c.id; } catch (e) { return `${c.id} 오류: ${e.message}`; }
  }).join(',');
  await wait(400);
  game.gold = 300;
  document.querySelector('.shop-button').click(); await wait(100);
  document.querySelector('.shop-item').click(); game.toggleShop(); await wait(100);
  out.상점뒤 = [game.state, game.skills.bomb];
  await openRankingModal(); await wait(100);
  out.랭킹중 = game.state;
  closeRankingModal(); await wait(100);
  out.랭킹뒤 = game.state;
  game.saveGame();
  out.저장 = !!store.getItem('mathSaveData');
  out.앞글자없는저장 = Object.keys(localStorage).filter(k => !k.startsWith('avghero_'));
  return out;
}
