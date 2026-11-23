// Weekly endless-mode leaderboard, kept in the artifact's shared database (db capability).
// One document per player at lb/<userId>: { season, score, level, turn, at, lastSeason, lastScore }.
// A new week starts on Monday (UTC). When a player opens the game after a week ends, the
// previous week's top three get their reward once: 1st the champion crown, a golden ball and
// 1000G; 2nd and 3rd 300G. Outside claude.ai (for example in the Expo app) there is no shared
// store, so the board says so and only the local best is kept.
const RANK = { db: null, user: null, me: null, writable: null, state: 'loading', rows: [], names: {} };
const REWARD = { 1: { gold: 1000, crown: true }, 2: { gold: 300 }, 3: { gold: 300 } };

function seasonId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), week = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}
const prevSeasonId = () => seasonId(new Date(Date.now() - 7 * 864e5));
function seasonEndsIn() {
  const now = new Date(), day = now.getUTCDay() || 7;
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day));
  const h = Math.max(0, Math.floor((end - now) / 36e5));
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${h}시간`;
}
const withTimeout = (p, ms = 10000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function rankInit() {
  if (!window.claude || typeof window.claude.use !== 'function') { RANK.state = 'offline'; return; }
  try {
    const [db, user] = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]));
    if (!db || !user) { RANK.state = 'offline'; return; }
    RANK.db = db; RANK.user = user;
    RANK.me = await user.id();
    RANK.writable = await user.can('data.write');
    RANK.state = 'ready';
    checkChampion();
  } catch (e) { RANK.state = 'offline'; }
}

async function submitScore(score, level, turn) {
  if (RANK.state !== 'ready' || !RANK.me || RANK.writable === false || score <= 0) return;
  const ref = RANK.db.doc('lb/' + RANK.me), season = seasonId();
  try {
    const snap = await withTimeout(ref.get());
    const cur = snap.exists ? snap.data() : null;
    if (cur && cur.season === season && cur.score >= score) return;
    const carry = cur && cur.season !== season ? { lastSeason: cur.season, lastScore: cur.score } : { lastSeason: cur ? cur.lastSeason || '' : '', lastScore: cur ? cur.lastScore || 0 : 0 };
    await withTimeout(ref.set({ season, score, level, turn, at: Date.now(), ...carry }));
  } catch (e) {
    if (e && e.code === 'invalid_argument') RANK.writable = false;
  }
}

async function loadBoard() {
  if (RANK.state !== 'ready') return [];
  const snap = await withTimeout(RANK.db.collection('lb').where('season', '==', seasonId()).orderBy('score', 'desc').limit(50).get());
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  try { const ps = await RANK.user.profiles(rows.map(r => r.id)); for (const r of rows) r.name = (ps[r.id] && ps[r.id].name) || ''; } catch (e) {}
  return rows;
}

// Last week's standings come from two places: players still on that season, and players who
// already moved on (their old score sits in lastSeason/lastScore).
async function checkChampion() {
  const prev = prevSeasonId();
  if (RANK.state !== 'ready' || SAVE.champSeasons[prev] !== undefined) return;
  try {
    const col = RANK.db.collection('lb');
    const [a, b] = await withTimeout(Promise.all([
      col.where('season', '==', prev).orderBy('score', 'desc').limit(3).get(),
      col.where('lastSeason', '==', prev).orderBy('lastScore', 'desc').limit(3).get(),
    ]));
    const all = [...a.docs.map(d => ({ id: d.id, s: d.data().score })), ...b.docs.map(d => ({ id: d.id, s: d.data().lastScore }))]
      .sort((x, y) => y.s - x.s).slice(0, 3);
    const place = all.findIndex(r => r.id === RANK.me) + 1;
    SAVE.champSeasons[prev] = place;
    if (REWARD[place]) {
      SAVE.gold += REWARD[place].gold;
      if (REWARD[place].crown) SAVE.champion = true;
      showTitleNote(place === 1 ? `지난주 무한 모드 1위! 챔피언 왕관과 황금 공, ${REWARD[1].gold}G를 받았어요` : `지난주 무한 모드 ${place}위! ${REWARD[place].gold}G를 받았어요`);
      if (REWARD[place].crown) applyTheme(TH.land);
      refreshTitle();
    }
    writeSave();
  } catch (e) {}
}
function showTitleNote(text) { const n = $('titleNote'); n.textContent = text; n.hidden = false; }

// ---------- leaderboard screen ----------
let rankReturn = null;
async function openRank(from) {
  rankReturn = from; if (from) from.hidden = true;
  $('rank').hidden = false;
  $('rankSeason').textContent = `${seasonId()} 시즌 · 종료까지 ${seasonEndsIn()}`;
  $('rankMine').textContent = SAVE.bestScore ? `내 최고 점수 ${SAVE.bestScore.toLocaleString()}` : '아직 기록이 없어요';
  const list = $('rankList');
  if (RANK.state === 'offline') { list.innerHTML = '<p class="note">랭킹은 claude.ai에서 게임을 열었을 때 함께 겨룰 수 있어요. 지금은 내 기록만 저장됩니다.</p>'; return; }
  if (RANK.state !== 'ready') { list.innerHTML = '<p class="note">랭킹을 불러오는 중…</p>'; setTimeout(() => { if (!$('rank').hidden) openRank(from); }, 1500); return; }
  list.innerHTML = '<p class="note">랭킹을 불러오는 중…</p>';
  try {
    const rows = await loadBoard();
    if (!rows.length) { list.innerHTML = '<p class="note">이번 주 첫 기록의 주인공이 되어보세요!</p>'; }
    else list.innerHTML = rows.map((r, i) => `<div class="rrow${r.id === RANK.me ? ' me' : ''}"><b>${i + 1}</b><span>${escapeHtml(r.name || (r.id === RANK.me ? '나' : '플레이어'))}</span><em>LV ${r.level}</em><i>${Number(r.score).toLocaleString()}</i></div>`).join('');
    if (RANK.writable === false) list.insertAdjacentHTML('beforeend', '<p class="note">보기 권한이라 기록을 올릴 수 없어요. 공유한 사람에게 참여 권한을 받으면 함께 겨룰 수 있어요.</p>');
  } catch (e) {
    list.innerHTML = '<p class="note">랭킹을 지금 불러올 수 없어요. 잠시 후 다시 열어주세요.</p>';
  }
}
function closeRank() { $('rank').hidden = true; if (rankReturn) rankReturn.hidden = false; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
