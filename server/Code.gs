// ==========================================
// 평균의 수호자 - 랭킹 서버 (Google Apps Script)
// ==========================================
// 설치 방법은 같은 폴더의 README.md를 보세요.
//
// 기록은 'Ranking' 탭에 저장함 (처음 기록이 들어올 때 자동으로 만들어짐).
// 예전 방식(직접 입력 닉네임)의 기록이 든 'RankData' 탭은 건드리지 않고 읽기만 함:
// 학생이 새 닉네임을 처음 만들면, 같은 기기(예전 sessionId)의 예전 최고 기록을 한 번 옮겨 줌.
//
// 시트 열 구성 (1행은 제목줄, 처음 기록이 들어올 때 자동으로 만들어짐)
//  A 닉네임 번호(예: 2-0-3-1) | B 최고 레벨 | C 최다 정답 | D 최장 생존(초) | E 최대 연속 정답
//  F 닉네임 글자(확인용) | G 닉네임 주인(기기 열쇠의 해시값) | H 마지막 반영(서버 시각) | I 기록 시각 | J 시즌
//
// 닉네임은 학생이 단어 4개를 골라 만든 조합형만 받음. 글자는 서버가 번호로 직접 만듦.
//
// 관리하는 법
//  - 이상한 기록은 그 줄을 지우면 랭킹에서 사라짐.
//  - 학생이 기기를 바꿔서 자기 닉네임을 못 쓰면 → 그 줄의 G칸(닉네임 주인)을 지워 주세요.
//    새 기기에서 같은 닉네임을 고르면 그 기기가 주인이 됨.
//  - 새 시즌을 시작하려면 → 아래 SEASON과 게임(index.html)의 RANK_SEASON을 같이 1 올리세요.
//    지난 시즌 줄은 랭킹에 안 보임.

const SEASON = 1;
const SHEET_NAME = 'Ranking';      // 새 랭킹 탭
const LEGACY_SHEET = 'RankData';   // 예전 랭킹 탭 (읽기만 함)

// 정상 플레이를 막지 않도록 넉넉하게 잡은 기준
// 판 시작표: '작전 개시' 때 서버가 서버 시계로 시작 시각을 적고 서명한 표를 줌.
//  게임하는 동안 2분마다 도장(beat)을 받아, 표 안에 '플레이한 시간'이 쌓임 (도장 사이가 비면 5분까지만 인정)
//  게임 오버 때 그 표를 함께 받아, 쌓인 시간보다 긴 생존·빠른 풀이는 잘라 냄
//  → 숫자만 고치거나, 표만 받아 두고 기다려서는 기록을 부풀릴 수 없음.
const LIMITS = {
  TICKET_MAX_AGE_MS: 24 * 3600 * 1000, // 시작표는 24시간 안에만 씀 (이어하기 포함)
  BEAT_GAP_SEC: 300,                   // 도장 사이에 인정하는 최대 시간 (인터넷이 잠깐 끊겨도 괜찮게)
  BEATS_PER_DEVICE_PER_HOUR: 120,
  SURVIVAL_SLACK_SEC: 30,              // 서버와 기기 시계 차이 여유
  MIN_SEC_PER_PROBLEM: 5,              // 문장제 한 문제에 최소 5초 (실제 상위권은 9초 이상)
  PROBLEMS_BUFFER: 2,
  MAX_RESULTS_PER_SAVE: 10,            // 한 번에 올리는 판 결과 수
  TICKETS_PER_DEVICE_PER_HOUR: 120,
  MIN_WRITE_INTERVAL_MS: 2000,       // 같은 닉네임은 2초에 한 번까지만 반영
  NEW_NAMES_PER_10MIN: 150,          // 서버 전체: 10분 동안 새 닉네임 150개까지
  NEW_NAMES_PER_DEVICE_PER_HOUR: 10  // 기기 하나: 1시간 동안 새 닉네임 10개까지
};

const COL = { NAME: 0, LEVEL: 1, PROBLEMS: 2, SURVIVAL: 3, COMBO: 4, TEXT: 5, OWNER: 6, LAST: 7, TIME: 8, SEASON: 9 };
const HEADERS = ['닉네임 번호', '최고 레벨', '최다 정답', '최장 생존(초)', '최대 연속 정답', '닉네임 글자', '닉네임 주인', '마지막 반영', '기록 시각', '시즌'];
const TYPES = { level: 'level', problems: 'problems', survival: 'survival' };

// ---------- 조합형 닉네임 단어 (게임 index.html의 NICK_WORDS와 완전히 같아야 함) ----------
// 단어는 맨 뒤에 덧붙이기만 할 것 (순서 변경·삭제 금지: 기존 닉네임이 다른 말로 바뀜)
const NICK_WORDS = [
  ["민트빛", "칠흑의", "황금빛", "파스텔", "형광색", "보랏빛", "투명한", "노을빛", "하늘빛", "은빛", "무지갯빛", "진홍빛", "연둣빛", "새하얀", "바닷빛", "별빛", "달빛", "햇살빛", "복숭앗빛", "레몬빛", "초록빛", "산호빛", "라벤더빛", "청록빛", "구릿빛", "샛노란", "오로라빛", "벚꽃빛", "단풍빛", "쪽빛", "주황빛", "우윳빛", "크림빛", "숲빛", "비취빛", "호박빛", "은하수빛", "진주빛", "새파란", "분홍빛", "초콜릿빛", "솜사탕빛", "봄빛", "눈빛", "푸른", "붉은", "하얀", "노란", "우주빛", "강철빛", "네온빛"],
  ["보드게임 즐기는", "떡볶이 좋아하는", "노래 부르는", "수학을 사랑하는", "야식을 탐내는", "코딩하는", "젤리 좋아하는", "책 읽는", "그림 그리는", "축구하는", "피아노 치는", "줄넘기하는", "춤추는", "요리하는", "별을 보는", "공룡 박사인", "곤충을 관찰하는", "식물을 키우는", "블록 쌓는", "종이접기하는", "퍼즐 푸는", "역사를 탐험하는", "박물관 좋아하는", "유물을 찾는", "지도를 그리는", "여행을 꿈꾸는", "수영하는", "자전거 타는", "농구하는", "배드민턴 치는", "달리기하는", "태권도하는", "바둑 두는", "체스 두는", "만화 그리는", "동화를 쓰는", "시를 쓰는", "일기 쓰는", "사진 찍는", "우쿨렐레 치는", "리코더 부는", "드럼 치는", "콧노래 부르는", "과학 실험하는", "로봇 만드는", "발명하는", "우주를 꿈꾸는", "바다를 좋아하는", "산을 오르는", "캠핑 가는", "낚시하는", "김밥 싸는", "아이스크림 좋아하는", "붕어빵 좋아하는", "귤 좋아하는", "수박 좋아하는", "딸기 좋아하는", "호떡 좋아하는", "쿠키 굽는", "핫초코 마시는", "라면 끓이는", "볶음밥 만드는", "고구마 좋아하는", "감자 좋아하는", "옥수수 좋아하는", "팝콘 좋아하는", "강아지 좋아하는", "고양이 좋아하는", "꽃을 가꾸는", "구름을 세는", "낮잠 자는", "수수께끼 내는", "퀴즈 푸는", "탐정놀이 하는", "보물을 찾는", "마술하는", "노을을 보는", "비눗방울 부는", "연날리기 하는", "눈사람 만드는", "줄다리기 하는", "팽이 돌리는", "공기놀이 하는", "제기 차는", "윷놀이 하는", "딱지 치는", "실뜨기 하는", "썰매 타는", "스케이트 타는", "인라인 타는", "탁구 치는", "야구하는", "배구하는", "피구하는", "등산하는", "산책하는", "별자리 찾는", "돌멩이 모으는", "스티커 모으는", "우표 모으는", "조개 줍는", "나뭇잎 모으는", "화석을 찾는", "고분을 탐사하는", "탑을 그리는", "도자기 빚는", "한자 공부하는", "영어 공부하는", "받아쓰기 잘하는", "구구단 외우는", "과일 깎는", "샌드위치 만드는", "케이크 굽는", "주먹밥 만드는", "만두 빚는", "떡 좋아하는", "송편 빚는", "수제비 좋아하는", "팥빙수 좋아하는", "식혜 마시는", "기타 치는", "바이올린 켜는", "하모니카 부는", "노래 만드는", "동요 부르는", "랩 하는", "박수 치는", "휘파람 부는", "실로폰 치는", "장구 치는", "평균을 구하는", "로봇을 막아내는", "우주를 지키는", "작전을 세우는", "문제를 척척 푸는"],
  ["전설의", "엉뚱한", "느긋한", "위풍당당한", "수줍은", "재빠른", "천재적인", "씩씩한", "용감한", "다정한", "똑똑한", "명랑한", "신비로운", "차분한", "부지런한", "호기심 많은", "행복한", "꿈꾸는", "상냥한", "활발한", "든든한", "웃음 많은", "친절한", "슬기로운", "날쌘", "침착한", "유쾌한", "귀여운", "멋진", "늠름한", "끈기 있는", "성실한", "기운찬", "포근한", "당당한", "지혜로운", "상상력 넘치는", "꼼꼼한", "대담한", "졸린", "배고픈", "빛나는", "즐거운", "신나는", "조용한", "평화로운", "반가운", "사랑스러운", "듬직한", "재치 있는", "센스 있는", "깜찍한", "총명한", "부드러운", "튼튼한", "날렵한", "산뜻한", "말랑말랑한", "보송보송한", "반짝반짝한", "무적의", "불굴의", "정확한", "계산이 빠른"],
  ["고양이", "드래곤", "펭귄", "마법사", "너구리", "해적", "탐정", "슬라임", "개발자", "강아지", "토끼", "다람쥐", "판다", "수달", "고래", "돌고래", "거북이", "부엉이", "독수리", "여우", "사슴", "기린", "코끼리", "사자", "호랑이", "곰", "햄스터", "알파카", "미어캣", "카멜레온", "공룡", "유니콘", "로봇", "우주인", "기사", "탐험가", "고고학자", "박물관장", "역사가", "화가", "요리사", "과학자", "발명가", "음악가", "작가", "시인", "선장", "비행사", "정원사", "등대지기", "우체부", "사서", "천문학자", "마술사", "요정", "도깨비", "해태", "봉황", "장수풍뎅이", "무당벌레", "나비", "반딧불이", "해파리", "문어", "상어", "앵무새", "참새", "까치", "두루미", "백조", "홍학", "코알라", "캥거루", "고슴도치", "두더지", "아기 양", "아기 염소", "망아지", "병아리", "오리", "청설모", "물개", "바다사자", "북극곰", "눈표범", "치타", "얼룩말", "하마", "낙타", "라마", "거북선 선장", "탐사대장", "해설사", "큐레이터", "복원 전문가", "지도 제작자", "파수꾼", "수호신", "용사", "모험가", "우주 요원", "수학자", "전략가", "평균 탐정", "방어 대장"]
];

function parseNickId(id) {
  var ix = String(id || '').split('-').map(Number);
  if (ix.length !== 4) return null;
  for (var k = 0; k < 4; k++) {
    if (!Number.isInteger(ix[k]) || ix[k] < 0 || ix[k] >= NICK_WORDS[k].length) return null;
  }
  return ix;
}

function nickText(ix) {
  return ix.map(function (n, k) { return NICK_WORDS[k][n]; }).join(' ');
}

// ---------- 공통 도구 ----------

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message) {
  return reply({ success: false, code: code, message: message });
}

function checkToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(token);
}

function hashToken(token) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'avg-hero:' + token);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// 0 이상의 정수만 허용, 아니면 null
function toCount(value) {
  var n = Number(value);
  if (value === null || value === undefined || value === '' || typeof value === 'boolean' || !isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sheet.getRange('A:A').setNumberFormat('@');   // "2-0-3-1"이 날짜로 바뀌지 않게
  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  var current = header.getValues()[0];
  if (current.some(function (v) { return !v; })) {
    for (var i = 0; i < HEADERS.length; i++) if (!current[i]) current[i] = HEADERS[i];
    header.setValues([current]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow(values, name) {
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][COL.NAME]).trim() === name) return i;
  }
  return -1;
}

function rowSeason(row) {
  return Number(row[COL.SEASON]) || SEASON;
}

function allowNewName(ownerHash) {
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var globalKey = 'new10m_' + Math.floor(now / 600000);
  var deviceKey = 'newDev_' + ownerHash.slice(0, 32) + '_' + Math.floor(now / 3600000);
  var globalCount = Number(cache.get(globalKey)) || 0;
  var deviceCount = Number(cache.get(deviceKey)) || 0;
  if (globalCount >= LIMITS.NEW_NAMES_PER_10MIN || deviceCount >= LIMITS.NEW_NAMES_PER_DEVICE_PER_HOUR) return false;
  cache.put(globalKey, String(globalCount + 1), 900);
  cache.put(deviceKey, String(deviceCount + 1), 3900);
  return true;
}

// 기록끼리 앞뒤가 맞는지 (한 판 안에서: 레벨 ≤ 정답+1, 정답 ≤ 생존 ÷ 5초, 연속 정답 ≤ 정답)
function isPossible(r) {
  if (r.survival > LIMITS.TICKET_MAX_AGE_MS / 1000) return false;
  if (r.level > r.problems + 1) return false;
  if (r.problems > Math.floor(r.survival / LIMITS.MIN_SEC_PER_PROBLEM) + LIMITS.PROBLEMS_BUFFER) return false;
  if (r.combo > r.problems) return false;
  return true;
}

// ---------- 판 시작표 ----------
// 서명 열쇠는 코드에 두지 않고 스크립트 속성에 한 번 만들어 둠 (코드를 봐도 표를 위조할 수 없음)
function ticketSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('TICKET_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TICKET_SECRET', secret);
  }
  return secret;
}

function signTicket(startMs, ownerHash) {
  var bytes = Utilities.computeHmacSha256Signature(startMs + '.' + ownerHash, ticketSecret());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '').slice(0, 32);
}

// 새 표: 시작.쌓인초.마지막도장.서명
function buildTicket(startMs, playedSec, lastMs, ownerHash) {
  var body = startMs + '.' + playedSec + '.' + lastMs;
  return body + '.' + signTicket('v2.' + body, ownerHash);
}

function makeTicket(ownerHash) {
  var now = Date.now();
  return buildTicket(now, 0, now, ownerHash);
}

// 이 기기가 받은 진짜 표인지 확인하고 { start, played(초) }를 돌려줌 (아니면 null)
function readTicket(ticket, ownerHash, now) {
  var text = String(ticket || '');
  var m = /^(\d{13})\.(\d{1,6})\.(\d{13})\.([A-Za-z0-9_-]{32})$/.exec(text);
  if (m) {
    var startMs = Number(m[1]), lastMs = Number(m[3]);
    if (startMs > now + 60000 || now - startMs > LIMITS.TICKET_MAX_AGE_MS) return null;
    if (signTicket('v2.' + m[1] + '.' + m[2] + '.' + m[3], ownerHash) !== m[4]) return null;
    var gap = Math.max(0, Math.floor((now - lastMs) / 1000));
    return { start: startMs, played: Number(m[2]) + Math.min(gap, LIMITS.BEAT_GAP_SEC) };
  }
  // 0.033~0.034 때 받은 표: 새로 나가지 않으므로 24시간 뒤에는 모두 사라짐
  m = /^(\d{13})\.([A-Za-z0-9_-]{32})$/.exec(text);
  if (!m) return null;
  var oldStart = Number(m[1]);
  if (oldStart > now + 60000 || now - oldStart > LIMITS.TICKET_MAX_AGE_MS) return null;
  return signTicket(oldStart, ownerHash) === m[2] ? { start: oldStart, played: Math.floor((now - oldStart) / 1000) } : null;
}

function allowTicket(ownerHash, kind, limit) {
  var cache = CacheService.getScriptCache();
  var key = kind + '_' + ownerHash.slice(0, 32) + '_' + Math.floor(Date.now() / 3600000);
  var count = Number(cache.get(key)) || 0;
  if (count >= limit) return false;
  cache.put(key, String(count + 1), 3900);
  return true;
}

// 한 판 결과를 시작표 기준으로 잘라 냄: 생존 ≤ 도장으로 쌓인 시간, 정답 ≤ 생존 ÷ 5초
function clampResult(r, playedSec) {
  var level = toCount(r && r.level), problems = toCount(r && r.problems);
  var survival = toCount(r && r.survival), combo = toCount(r && r.combo);
  if (level === null || problems === null || survival === null || combo === null) return null;
  survival = Math.min(survival, playedSec + LIMITS.SURVIVAL_SLACK_SEC);
  problems = Math.min(problems, Math.floor(survival / LIMITS.MIN_SEC_PER_PROBLEM) + LIMITS.PROBLEMS_BUFFER);
  return { level: Math.min(level, problems + 1), problems: problems, survival: survival, combo: Math.min(combo, problems) };
}

// 예전 RankData 탭에서 같은 기기(sessionId)의 최고 기록 찾기 (기기마다 한 번만 옮김)
// RankData 열: A 시각 | B 닉네임 | C 레벨 | D 문제 수 | E 최대 콤보 | F 생존(초) | G 시도 | H sessionId | I 서명
function takeLegacyRecords(sessionId) {
  var none = { level: 0, problems: 0, survival: 0, combo: 0, found: false };
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{16,64}$/.test(sessionId)) return none;
  var props = PropertiesService.getScriptProperties();
  var key = 'legacy_' + sessionId.slice(0, 64);
  if (props.getProperty(key)) return none;   // 이미 옮김
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEGACY_SHEET);
  if (!sheet) return none;
  var values = sheet.getDataRange().getValues();
  var best = none;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[7]) !== sessionId) continue;
    var r = { level: toCount(row[2]) || 0, problems: toCount(row[3]) || 0, combo: toCount(row[4]) || 0, survival: toCount(row[5]) || 0 };
    if (!isPossible(r)) continue;   // 앞뒤가 안 맞는 기록은 옮기지 않음
    best = {
      level: Math.max(best.level, r.level), problems: Math.max(best.problems, r.problems),
      survival: Math.max(best.survival, r.survival), combo: Math.max(best.combo, r.combo), found: true
    };
  }
  if (best.found) props.setProperty(key, String(Date.now()));
  return best;
}

// ---------- POST: 닉네임 정하기(claim) / 기록 저장(save) ----------

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var data = JSON.parse(e.postData.contents);

    // 판 시작표 받기 (닉네임이 없어도 됨)
    if (data.action === 'start') {
      if (!checkToken(data.token) || Number(data.season) !== SEASON) return fail('OLD_VERSION', '게임을 새로고침한 뒤 다시 해 주세요.');
      var startOwner = hashToken(data.token);
      if (!allowTicket(startOwner, 'ticket', LIMITS.TICKETS_PER_DEVICE_PER_HOUR)) return fail('TOO_MANY', '잠시 후 다시 해 주세요.');
      return reply({ success: true, code: 'STARTED', ticket: makeTicket(startOwner) });
    }

    // 시작표에 도장 받기 (플레이한 시간이 쌓임)
    if (data.action === 'beat') {
      if (!checkToken(data.token) || Number(data.season) !== SEASON) return fail('OLD_VERSION', '게임을 새로고침한 뒤 다시 해 주세요.');
      var beatOwner = hashToken(data.token), beatNow = Date.now();
      if (!allowTicket(beatOwner, 'beat', LIMITS.BEATS_PER_DEVICE_PER_HOUR)) return fail('TOO_MANY', '잠시 후 다시 해 주세요.');
      var beat = readTicket(data.ticket, beatOwner, beatNow);
      if (!beat) return fail('NO_TICKET', '이 기록은 랭킹에 올릴 수 없어요.');
      return reply({ success: true, code: 'BEAT', ticket: buildTicket(beat.start, beat.played, beatNow, beatOwner) });
    }

    var nickIx = parseNickId(data.username);
    if (!nickIx) return fail('BAD_NAME', '단어를 골라 만든 닉네임만 쓸 수 있어요. 게임을 새로고침해 주세요.');
    var name = nickIx.join('-');
    var text = nickText(nickIx);

    if (!checkToken(data.token) || Number(data.season) !== SEASON) return fail('OLD_VERSION', '게임을 새로고침한 뒤 다시 해 주세요.');
    var ownerHash = hashToken(data.token);

    var isClaim = data.action === 'claim';
    var rec = { level: 0, problems: 0, survival: 0, combo: 0 };
    if (!isClaim) {
      // 판 결과마다 이 기기가 받은 시작표가 있어야 함. 표 기준으로 잘라 낸 뒤 가장 좋은 값만 씀
      var results = Array.isArray(data.results) ? data.results.slice(0, LIMITS.MAX_RESULTS_PER_SAVE) : [];
      var checkNow = Date.now(), valid = 0;
      results.forEach(function (r) {
        var t = readTicket(r && r.ticket, ownerHash, checkNow);
        if (!t) return;
        var c = clampResult(r, t.played);
        if (!c) return;
        valid++;
        rec = { level: Math.max(rec.level, c.level), problems: Math.max(rec.problems, c.problems),
                survival: Math.max(rec.survival, c.survival), combo: Math.max(rec.combo, c.combo) };
      });
      if (!valid) return fail('NO_TICKET', '이 기록은 랭킹에 올릴 수 없어요.');
    }

    lock.waitLock(10000);
    locked = true;
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var index = findRow(values, name);
    var now = Date.now();

    if (index < 0) {
      if (!allowNewName(ownerHash)) return fail('TOO_MANY', '지금은 새 닉네임을 만들 수 없어요. 잠시 후 다시 해 주세요.');
      var legacy = takeLegacyRecords(data.legacy);
      sheet.appendRow([name, Math.max(rec.level, legacy.level), Math.max(rec.problems, legacy.problems),
                       Math.max(rec.survival, legacy.survival), Math.max(rec.combo, legacy.combo),
                       text, ownerHash, isClaim ? 0 : now, new Date().toISOString(), SEASON]);   // 닉네임만 정할 때는 바로 이어지는 기록 저장을 막지 않게 0
      return reply({ success: true, code: isClaim ? 'CLAIMED' : 'SAVED', migrated: legacy.found });
    }

    var row = values[index];
    var rowNumber = index + 1;
    var owner = String(row[COL.OWNER] || '');
    if (owner && owner !== ownerHash) return fail('NAME_TAKEN', '이미 다른 기기에서 쓰고 있는 닉네임이에요. 다른 닉네임을 골라 주세요.');

    var old = rowSeason(row) < SEASON;   // 지난 시즌 기록이면 0부터
    var prev = {
      level: old ? 0 : (toCount(row[COL.LEVEL]) || 0),
      problems: old ? 0 : (toCount(row[COL.PROBLEMS]) || 0),
      survival: old ? 0 : (toCount(row[COL.SURVIVAL]) || 0),
      combo: old ? 0 : (toCount(row[COL.COMBO]) || 0)
    };
    var last = Number(row[COL.LAST]) || 0;
    if (!isClaim && last && now - last < LIMITS.MIN_WRITE_INTERVAL_MS) return fail('TOO_FAST', '잠시 후 다시 해 주세요.');

    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([[
      name,
      Math.max(prev.level, rec.level),
      Math.max(prev.problems, rec.problems),
      Math.max(prev.survival, rec.survival),
      Math.max(prev.combo, rec.combo),
      text, ownerHash, isClaim ? last : now, new Date().toISOString(), SEASON
    ]]);
    return reply({ success: true, code: isClaim ? 'CLAIMED' : 'SAVED' });

  } catch (error) {
    return fail('ERROR', '서버 오류가 났어요. 잠시 후 다시 해 주세요.');
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ---------- GET: 닉네임 중복 확인 / 랭킹 조회 ----------

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();

    // ?action=check&id=a-b-c-d → { taken }
    if (p.action === 'check') {
      var checkIx = parseNickId(p.id);
      if (!checkIx) return reply({ error: 'fail' });
      return reply({ taken: findRow(values, checkIx.join('-')) >= 0 });
    }

    // ?type=level|problems|survival&username=a-b-c-d → 위 100명 (+ 100위 밖이면 내 줄)
    var key = TYPES[p.type] || 'level';
    var me = String(p.username || '').trim();
    var data = values.slice(1)
      .filter(function (row) { return parseNickId(String(row[COL.NAME]).trim()) && rowSeason(row) === SEASON; })
      .map(function (row) {
        var id = String(row[COL.NAME]).trim();
        return {
          id: id,
          username: nickText(parseNickId(id)),
          level: toCount(row[COL.LEVEL]) || 0,
          problems: toCount(row[COL.PROBLEMS]) || 0,
          survival: toCount(row[COL.SURVIVAL]) || 0,
          combo: toCount(row[COL.COMBO]) || 0
        };
      })
      .filter(function (r) { return r[key] > (key === 'level' ? 1 : 0); })   // 닉네임만 있고 기록이 없는 줄 제외
      .sort(function (a, b) { return b[key] - a[key]; });

    var result = data.slice(0, 100);
    if (me) {
      for (var i = 100; i < data.length; i++) {
        if (data[i].id === me) { var mine = data[i]; mine.rank = i + 1; result.push(mine); break; }
      }
    }
    return reply(result);
  } catch (error) {
    return reply([]);
  }
}
