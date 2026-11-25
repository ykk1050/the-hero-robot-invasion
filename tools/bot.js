// playtest 전용 봇: 시작 → 문제 8개 맞히기(오답 한 번 섞기) → 보상 → 상점 → 랭킹 창 → 이어하기 저장까지 눌러 봄.
// 실행: sh /d/자동화/playtest/run.sh /d/자동화/the-hero-robot-invasion --path "index.html?ranktest=1" --bot /d/자동화/the-hero-robot-invasion/tools/bot.js
// 반드시 ?ranktest=1 로 돌릴 것 (실제 랭킹 서버에 기록이 남지 않게)
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!RANK_TEST) return { 막힘: '?ranktest=1 이 아니라서 멈춤' };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= -1; };
  document.querySelector('.start-btn').click();
  await wait(500);
  const out = { 맞힘: 0, 막힘: null, 제출버튼보임: visible(document.querySelector('.virtual-keypad .submit')) };
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
  }
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
