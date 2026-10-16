/* 2교시 리허설 — 시험 화면, AI 어시스턴트(제한된 질문 수·쿨다운·토큰 한도), 채점 */
(function () {
  'use strict';
  const Gen = window.ExamGen;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_KEY = 'rehearsal2-v1';
  const SET_LETTER = { snack: 'A', subscription: 'B', wafer: 'C', travel: 'D' };
  const SET_NAME = { snack: '동아리 간식 수요조사', subscription: 'AI 구독 비용 최적화', wafer: '웨이퍼 검사 로그 분석', travel: '해외 출장비 정산' };
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

  /* 토큰 추정: 한글 음절 ≈ 0.8토큰, 그 외 문자 ≈ 0.3토큰 (GPT 계열 토크나이저 근사) */
  function est(s) {
    let h = 0, o = 0;
    for (const ch of String(s)) { const c = ch.charCodeAt(0); if (c >= 0xac00 && c <= 0xd7a3) h++; else o++; }
    return Math.ceil(h * 0.8 + o * 0.3);
  }
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const randSeed = () => Math.floor(Math.random() * 900000) + 100000;

  const PRESETS = {
    real: { mode: 'real', sets: ['snack', 'subscription', 'wafer', 'travel'], minutes: 90, mult: 2.5, cooldown: 60, cap: 2500, tier: 'default' },
    practice: { mode: 'practice', sets: ['subscription'], minutes: 0, mult: 3, cooldown: 0, cap: 2500, tier: 'default' },
  };

  let cfg = { ...PRESETS.real, seed: randSeed() };
  let S = null; // 진행 중인 시험
  let SETS = []; // 생성된 세트 (시드로 재생성, 저장하지 않음)
  let sample = null;
  let aiStatus = 'pending'; // pending | ready | none | denied
  const ui = { view: 'lobby', q: 0, file: null, tab: 'q', attach: new Set(), sending: false, ctl: null, coach: null, coachBusy: false, confirmSubmit: false, draft: '' };

  /* ───────── 저장 ───────── */
  function save() {
    if (!S) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function loadSaved() {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ } }

  /* ───────── 시험 시작 ───────── */
  function buildSets(c) { return c.sets.map((id) => Gen.generateSet(id, c.seed)); }
  function questionList() {
    const out = [];
    SETS.forEach((set, si) => set.questions.forEach((q, qi) => out.push({ si, qi, key: `${SET_LETTER[set.id]}-${qi + 1}`, set, q })));
    return out;
  }
  let QS = [];

  function startExam(c) {
    SETS = buildSets(c);
    QS = questionList();
    const total = Math.round(QS.length * c.mult);
    S = {
      v: 1, cfg: { ...c }, answers: {}, threads: {}, calls: {}, aiTotal: total, aiLeft: total,
      startedAt: Date.now(), endsAt: c.minutes ? Date.now() + c.minutes * 60e3 : null, cooldownUntil: 0,
      tokensSent: 0, submitted: false, finishedAt: null,
    };
    ui.view = 'exam'; ui.q = 0; ui.file = null; ui.attach.clear(); ui.coach = null; ui.tab = 'q'; ui.confirmSubmit = false; ui.draft = '';
    save(); render();
  }
  function resumeExam(saved) {
    S = saved; cfg = { ...saved.cfg };
    SETS = buildSets(S.cfg); QS = questionList();
    ui.view = S.submitted ? 'result' : 'exam'; ui.q = 0; ui.file = null; ui.attach.clear(); ui.coach = null;
    render();
  }

  /* ───────── 채점 ───────── */
  function normText(s) {
    return String(s ?? '').toLowerCase().replace(/[\s.,'"「」『』()[\]·:!?~]/g, '').replace(/(학번|입니다|이다|임|요)$/u, '');
  }
  function parseNum(s) {
    const t = String(s ?? '').replace(/[−–—]/g, '-').replace(/[,\s원엔개명건달러]|%p|%|p/gi, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }
  function parseMD(s) {
    const m = String(s ?? '').match(/(?:20\d\d\s*[-./년]\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    return m ? `${+m[1]}/${+m[2]}` : null;
  }
  function grade(q, ans) {
    if (ans == null || String(ans).trim() === '') return false;
    if (q.type === 'choice') return ans === q.answer;
    if (q.numeric) { const x = parseNum(ans); return x != null && Math.abs(x - q.answer) <= (q.tolerance || 0) + 1e-9; }
    if (q.date) return parseMD(ans) === q.answer;
    const n = normText(ans);
    return (q.accept || [q.answer]).some((a) => normText(a) === n);
  }

  /* ───────── AI 프롬프트 ───────── */
  function preamble(item) {
    const { set, q, key } = item;
    return [
      '너는 기업 AI 해커톤 예선 2교시 시험 화면에 붙어 있는 AI 어시스턴트다. 응시자가 문제를 풀 때 돕는다.',
      '규칙:',
      '1) 한국어로 간결하게 답한다.',
      '2) 근거는 아래 문항 정보와, 응시자가 이 대화에 첨부한 파일 내용뿐이다. 첨부되지 않은 파일의 내용은 절대 추측하지 말고, 필요한 파일 이름을 말해 첨부를 요청한다.',
      '3) 계산은 정확히 하고, 필요하면 중간 계산을 짧게 보인다. 표 데이터는 빠뜨리는 행이 없도록 주의한다.',
      '4) 응시자가 답만 요구하면 답만 말해도 된다. 정답지는 갖고 있지 않다.',
      '',
      `[문제 세트 ${SET_LETTER[set.id]}] ${set.title}`,
      '[공통 지문]',
      set.intro,
      '',
      '[이 세트에서 첨부할 수 있는 파일 목록 — 이름만 보임, 내용은 첨부해야 보임]',
      ...set.files.map((f) => `- ${f.name}`),
      '',
      `[현재 문항 ${key}]`,
      q.text,
      q.type === 'choice' ? '보기: ' + q.options.map((o, i) => `${CIRCLED[i]} ${o}`).join('  ') : '(단답형)',
    ].join('\n');
  }
  function threadOf(key) { if (!S.threads[key]) S.threads[key] = []; return S.threads[key]; }
  function fileByName(set, name) { return set.files.find((f) => f.name === name); }
  function meter(item, msg) {
    const base = est(preamble(item));
    const att = [...ui.attach].reduce((s, n) => { const f = fileByName(item.set, n); return s + (f ? est(f.content) + 10 : 0); }, 0);
    const m = est(msg || '');
    // 한도는 이번 요청에만 적용된다. 이전 대화는 AI가 기억하지만 한도에 쌓이지 않는다.
    return { base, att, msg: m, total: base + att + m };
  }
  function cooldownLeft() { return Math.max(0, Math.ceil((S.cooldownUntil - Date.now()) / 1000)); }

  function sendBlockReason(item, msg) {
    if (aiStatus === 'none') return 'AI를 쓸 수 없는 환경이에요. 자료를 직접 읽고 풀어 보세요.';
    if (aiStatus === 'denied') return 'AI 사용이 허용되지 않았어요.';
    if (ui.sending) return '답변을 받는 중이에요.';
    if (S.aiLeft <= 0) return 'AI 질문 횟수를 모두 썼어요.';
    const cd = cooldownLeft();
    if (cd > 0) return `다음 질문까지 ${cd}초 기다려야 해요.`;
    if (!msg.trim()) return '';
    const m = meter(item, msg);
    if (S.cfg.cap && m.total > S.cfg.cap) return `토큰 한도 초과 (${fmt(m.total)} / ${fmt(S.cfg.cap)}). 첨부를 줄이거나 나눠서 보내세요.`;
    return '';
  }

  async function send() {
    const item = QS[ui.q];
    const box = $('#msg');
    const text = (box ? box.value : '').trim();
    if (!text || sendBlockReason(item, text) || !sample) return;
    const m = meter(item, text);
    const files = [...ui.attach].map((n) => fileByName(item.set, n)).filter(Boolean);
    const content = text + (files.length ? '\n\n' + files.map((f) => `[첨부 파일: ${f.name}]\n${f.content}`).join('\n\n') : '');
    const thread = threadOf(item.key);
    const userTurn = { role: 'user', content, text, files: files.map((f) => ({ name: f.name, tokens: est(f.content) })), tokens: est(content) + files.length * 10, at: Date.now() };
    thread.push(userTurn);
    S.aiLeft--; S.calls[item.key] = (S.calls[item.key] || 0) + 1;
    S.cooldownUntil = Date.now() + S.cfg.cooldown * 1000;
    S.tokensSent += m.total;
    ui.attach.clear(); ui.draft = '';
    const reply = { role: 'assistant', content: '', pending: true };
    thread.push(reply);
    ui.sending = true;
    save(); renderAI();

    const turns = [{ role: 'user', content: preamble(item) }, ...thread.filter((t) => !t.pending).map((t) => ({ role: t.role, content: t.content }))];
    ui.ctl = new AbortController();
    try {
      const r = await sample(turns, {
        signal: ui.ctl.signal, cache: false, modelTier: S.cfg.tier,
        onText: ({ text: t }) => { reply.content = t; updatePendingBubble(reply); },
      });
      reply.content = r.text; reply.truncated = r.truncated;
    } catch (e) {
      reply.error = e && e.code;
      if (e && e.text) reply.content = e.text;
      if (e && e.code === 'not_granted') aiStatus = 'denied';
      if (!reply.content) {
        // 답을 못 받았으면 횟수와 쿨다운을 돌려준다
        thread.splice(thread.indexOf(reply), 1);
        thread.splice(thread.indexOf(userTurn), 1);
        S.aiLeft++; S.calls[item.key]--; S.cooldownUntil = 0; S.tokensSent -= m.total;
        ui.draft = text;
        files.forEach((f) => ui.attach.add(f.name));
        ui.aiError = errorCopy(e && e.code);
      }
    } finally {
      reply.pending = false; ui.sending = false; ui.ctl = null;
      save(); renderAI();
    }
  }
  function errorCopy(code) {
    return ({
      cancelled: '질문을 취소했어요. 횟수는 차감되지 않았어요.',
      not_granted: 'AI 사용이 허용되지 않았어요. 아티팩트 권한 메뉴에서 허용할 수 있어요.',
      rate_limited: '요청이 너무 잦아요. 잠시 뒤 다시 보내 주세요. 횟수는 차감되지 않았어요.',
      prompt_too_large: '보낸 내용이 너무 커요. 첨부를 줄여 주세요.',
      refused: 'AI가 이 요청에 답하지 않았어요. 질문을 바꿔 보세요.',
      session_expired: '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.',
    })[code] || '답변을 받지 못했어요. 다시 보내 주세요. 횟수는 차감되지 않았어요.';
  }

  /* ───────── 미니 마크다운 ───────── */
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function md(src) {
    const lines = String(src).replace(/\r/g, '').split('\n');
    let html = '', i = 0, list = null;
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        closeList(); let code = ''; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code += lines[i++] + '\n';
        i++; html += `<pre class="code">${esc(code)}</pre>`; continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l)) {
        closeList(); const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
        const [head, ...rest] = body;
        html += '<div class="tbl"><table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
        continue;
      }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { closeList(); const lv = Math.min(6, m[1].length + 2); html += `<h${lv}>${inline(m[2])}</h${lv}>`; i++; continue; }
      if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; i++; continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; i++; continue; }
      if (!l.trim()) { closeList(); i++; continue; }
      closeList();
      let para = l; i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+[.)]\s|```|\s*\|)/.test(lines[i])) para += '\n' + lines[i++];
      html += `<p>${inline(para).replace(/\n/g, '<br>')}</p>`;
    }
    closeList();
    return html;
  }
  function csvTable(text) {
    const rows = [];
    for (const line of text.split('\n')) {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
      }
      out.push(cur); rows.push(out);
    }
    const [h, ...rest] = rows;
    return '<div class="tbl"><table><thead><tr><th class="rn">#</th>' + h.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' +
      rest.map((r, i) => `<tr><td class="rn">${i + 1}</td>` + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  /* ───────── 렌더: 공통 ───────── */
  function render() {
    const view = $('#view');
    if (ui.view === 'lobby') view.innerHTML = lobbyHTML();
    else if (ui.view === 'exam') { view.innerHTML = examHTML(); renderAI(); }
    else view.innerHTML = resultHTML();
    renderBar();
  }
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }
  function renderBar() {
    const bar = $('#bar-stats');
    if (!S || ui.view !== 'exam') { bar.innerHTML = ''; return; }
    const now = Date.now();
    const timeLabel = S.endsAt ? clock(S.endsAt - now) : clock(now - S.startedAt);
    const low = S.endsAt && S.endsAt - now < 5 * 60e3;
    const cd = cooldownLeft();
    const answered = QS.filter((it) => S.answers[it.key] != null && String(S.answers[it.key]).trim() !== '').length;
    bar.innerHTML = `
      <div class="stat ${low ? 'warn' : ''}"><span class="k">${S.endsAt ? '남은 시간' : '경과 시간'}</span><span class="v mono">${timeLabel}</span></div>
      <div class="stat"><span class="k">답안</span><span class="v mono">${answered}/${QS.length}</span></div>
      <div class="stat ${S.aiLeft <= 3 ? 'warn' : ''}"><span class="k">AI 질문</span><span class="v mono">${S.aiLeft}/${S.aiTotal}</span></div>
      ${S.cfg.cooldown ? `<div class="stat ${cd ? 'cool' : ''}"><span class="k">쿨다운</span><span class="v mono">${cd ? cd + '초' : '가능'}</span></div>` : ''}
      ${ui.confirmSubmit
        ? `<div class="confirm"><span>제출할까요?</span><button class="btn danger" data-act="submit-yes">제출</button><button class="btn ghost" data-act="submit-no">취소</button></div>`
        : `<button class="btn primary" data-act="submit">답안 제출</button>`}`;
  }

  /* ───────── 로비 ───────── */
  function lobbyHTML() {
    const saved = loadSaved();
    const opt = (name, val, cur, label) => `<label class="seg-opt"><input type="radio" name="${name}" value="${val}" ${String(cur) === String(val) ? 'checked' : ''}><span>${label}</span></label>`;
    const nQ = cfg.sets.length * 4;
    return `
    <div class="lobby">
      <section class="hero">
        <p class="eyebrow">AI 해커톤 1차 예선 · 2교시 대비</p>
        <h1>2교시 리허설</h1>
        <p class="lede">세트마다 보조자료가 붙은 단답형·객관식 문제를, 횟수가 정해진 AI 어시스턴트와 함께 풉니다. 필요한 파일만 골라 첨부하고, 질문 한 번 한 번을 아껴 쓰는 연습을 합니다.</p>
        ${saved && !saved.submitted ? `<div class="resume"><div><strong>진행 중인 시험이 있어요.</strong><span>${saved.cfg.mode === 'real' ? '실전 모의고사' : '세트 연습'} · 시드 ${saved.cfg.seed}</span></div><button class="btn primary" data-act="resume">이어서 풀기</button><button class="btn ghost" data-act="discard">버리기</button></div>` : ''}
      </section>

      <section class="setup">
        <div class="modes">
          <button class="mode ${cfg.mode === 'real' ? 'on' : ''}" data-act="preset" data-v="real">
            <span class="mode-t">실전 모의고사</span>
            <span class="mode-d">4세트 16문항 · 90분 · AI 40회 · 쿨다운 60초</span>
          </button>
          <button class="mode ${cfg.mode === 'practice' ? 'on' : ''}" data-act="preset" data-v="practice">
            <span class="mode-t">세트 연습</span>
            <span class="mode-d">원하는 세트만 · 시간 제한 없음 · 쿨다운 없음</span>
          </button>
        </div>

        <div class="field">
          <span class="flabel">문제 세트</span>
          <div class="sets">
            ${Gen.SET_ORDER.map((id) => `<label class="setpick"><input type="checkbox" name="sets" value="${id}" ${cfg.sets.includes(id) ? 'checked' : ''}><span class="letter">${SET_LETTER[id]}</span><span>${SET_NAME[id]}</span></label>`).join('')}
          </div>
        </div>
        <div class="grid2">
          <div class="field"><span class="flabel">제한 시간</span><div class="seg">${opt('minutes', 0, cfg.minutes, '없음')}${opt('minutes', 25, cfg.minutes, '25분')}${opt('minutes', 45, cfg.minutes, '45분')}${opt('minutes', 90, cfg.minutes, '90분')}</div></div>
          <div class="field"><span class="flabel">AI 질문 횟수 (문항 수 ×)</span><div class="seg">${opt('mult', 2, cfg.mult, '×2')}${opt('mult', 2.5, cfg.mult, '×2.5')}${opt('mult', 3, cfg.mult, '×3')}</div><span class="hint">이번 설정: ${nQ}문항 → ${Math.round(nQ * cfg.mult)}회</span></div>
          <div class="field"><span class="flabel">질문 간 쿨다운</span><div class="seg">${opt('cooldown', 0, cfg.cooldown, '없음')}${opt('cooldown', 30, cfg.cooldown, '30초')}${opt('cooldown', 60, cfg.cooldown, '60초')}</div></div>
          <div class="field"><span class="flabel">요청당 토큰 한도</span><div class="seg">${opt('cap', 1500, cfg.cap, '1,500')}${opt('cap', 2500, cfg.cap, '2,500')}${opt('cap', 4000, cfg.cap, '4,000')}${opt('cap', 0, cfg.cap, '없음')}</div><span class="hint">질문 1회마다 문항 정보 + 첨부 + 질문을 합친 추정치. 보내고 나면 다시 0부터</span></div>
          <div class="field"><span class="flabel">AI 모델</span><div class="seg">${opt('tier', 'quick', cfg.tier, '빠름')}${opt('tier', 'default', cfg.tier, '표준')}${opt('tier', 'complex', cfg.tier, '고성능')}</div><span class="hint">실제 시험의 GPT-5.2에 가까운 건 「표준」</span></div>
          <div class="field"><span class="flabel">문제 시드</span><div class="seedrow"><input id="seed" class="input mono" inputmode="numeric" value="${cfg.seed}"><button class="btn ghost" data-act="reseed">새 시드</button></div><span class="hint">같은 시드면 같은 데이터가 나와요</span></div>
        </div>
        <div class="start"><button class="btn primary big" data-act="start" ${cfg.sets.length ? '' : 'disabled'}>시험 시작</button>
          <span class="ai-note">${aiNote()}</span></div>
      </section>

      <section class="tips">
        <h2>예비문제에서 확인한 2교시 규칙</h2>
        <ol class="rules">
          <li><b>질문 수 제한</b> 문항 수의 2~3배만 AI에게 물을 수 있다. 쉬운 문항은 AI 없이 읽고 푼다.</li>
          <li><b>토큰 제한</b> 자료를 전부 넣을 수 없다. 한 번 질문할 때 필요한 파일만 골라 첨부한다. 한도는 질문마다 새로 적용되므로 많으면 나눠서 보낸다. 문항이 바뀌면 다시 첨부해야 한다.</li>
          <li><b>문항 맥락은 자동</b> 문항을 고르면 AI가 지문과 문항을 이미 알고 있다. 프롬프트에는 조건과 원하는 출력만 쓴다.</li>
          <li><b>함정 조건</b> 날짜 기준, 무효 규칙, 단위·통화처럼 지문 한 줄에 숨은 조건을 프롬프트에 직접 적어 준다.</li>
          <li><b>단답형</b> 근거는 쓰지 않는다. 그래도 AI 답은 한 번 더 검산한다. 프롬프트가 채점될 수도 있다.</li>
        </ol>
      </section>
    </div>`;
  }
  function aiNote() {
    if (aiStatus === 'pending') return 'AI 연결 확인 중…';
    if (aiStatus === 'ready') return 'AI 어시스턴트: Claude. 첫 질문 때 사용 허락을 한 번 물어봐요.';
    if (aiStatus === 'denied') return 'AI 사용이 허용되지 않았어요. 자료만으로 풀 수 있어요.';
    return '이 화면에서는 AI를 쓸 수 없어요. claude.ai에서 열면 AI와 함께 풀 수 있어요.';
  }
  function readLobby() {
    const v = (n) => { const el = document.querySelector(`input[name="${n}"]:checked`); return el ? el.value : null; };
    cfg.sets = [...document.querySelectorAll('input[name="sets"]:checked')].map((x) => x.value);
    cfg.sets.sort((a, b) => Gen.SET_ORDER.indexOf(a) - Gen.SET_ORDER.indexOf(b));
    cfg.minutes = +v('minutes'); cfg.mult = +v('mult'); cfg.cooldown = +v('cooldown'); cfg.cap = +v('cap'); cfg.tier = v('tier');
    const sd = parseInt(($('#seed') || {}).value, 10);
    if (sd > 0) cfg.seed = sd;
  }

  /* ───────── 시험 화면 ───────── */
  function isAnswered(key) { const a = S.answers[key]; return a != null && String(a).trim() !== ''; }
  function sheetHTML() {
    return SETS.map((set, si) => `
      <div class="sheet-set">
        <div class="sheet-h"><span class="letter">${SET_LETTER[set.id]}</span><span class="sheet-t">${esc(set.title)}</span></div>
        <div class="bubbles">${set.questions.map((q, qi) => {
          const idx = QS.findIndex((it) => it.si === si && it.qi === qi);
          const key = QS[idx].key;
          return `<button class="bubble ${isAnswered(key) ? 'filled' : ''} ${idx === ui.q ? 'cur' : ''}" data-act="goto" data-v="${idx}" aria-label="문항 ${key}">${qi + 1}${S.calls[key] ? `<i class="dot" title="AI ${S.calls[key]}회"></i>` : ''}</button>`;
        }).join('')}</div>
      </div>`).join('');
  }
  function answerHTML(item) {
    const { q, key } = item;
    const cur = S.answers[key];
    if (q.type === 'choice') {
      return `<div class="choices" role="radiogroup">${q.options.map((o, i) => `
        <label class="choice ${cur === o ? 'on' : ''}"><input type="radio" name="ans" value="${esc(o)}" ${cur === o ? 'checked' : ''}><span class="omr">${CIRCLED[i]}</span><span>${esc(o)}</span></label>`).join('')}</div>`;
    }
    return `<div class="short"><input id="ans" class="input big" autocomplete="off" placeholder="${q.numeric ? '숫자로 입력' : q.date ? '예: 9/12' : '답 입력'}" value="${esc(cur ?? '')}">${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}</div>`;
  }
  function examHTML() {
    const item = QS[ui.q];
    const { set, q, key } = item;
    const f = ui.file ? fileByName(set, ui.file) : null;
    return `
    <div class="tabs" role="tablist">
      ${[['q', '문제'], ['f', `자료 ${set.files.length}`], ['ai', 'AI']].map(([k, l]) => `<button role="tab" class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}
    </div>
    <div class="exam tab-${ui.tab}">
      <nav class="sheet" aria-label="답안지">${sheetHTML()}</nav>
      <section class="paper">
        <div class="setintro">
          <div class="set-h"><span class="letter">${SET_LETTER[set.id]}</span><h2>${esc(set.title)}</h2></div>
          <p>${esc(set.intro).replace(/\n/g, '<br>')}</p>
        </div>
        <article class="question">
          <div class="q-h"><span class="q-key mono">${key}</span><span class="q-type">${q.type === 'choice' ? '객관식' : '단답형'}</span>${S.calls[key] ? `<span class="q-ai">AI ${S.calls[key]}회 사용</span>` : ''}</div>
          <p class="q-text">${esc(q.text)}</p>
          ${answerHTML(item)}
          <div class="q-nav">
            <button class="btn ghost" data-act="prev" ${ui.q === 0 ? 'disabled' : ''}>이전 문항</button>
            <button class="btn ghost" data-act="next" ${ui.q === QS.length - 1 ? 'disabled' : ''}>다음 문항</button>
          </div>
        </article>
      </section>
      <section class="files">
        <div class="files-h"><h3>보조자료</h3><span class="hint">추정 토큰 · 한도 ${S.cfg.cap ? fmt(S.cfg.cap) : '없음'}</span></div>
        <ul class="flist">${set.files.map((fl) => {
          const t = est(fl.content);
          const on = ui.attach.has(fl.name);
          return `<li class="${ui.file === fl.name ? 'viewing' : ''}">
            <button class="fname" data-act="view" data-v="${esc(fl.name)}"><span class="ext">${fl.kind === 'csv' ? 'CSV' : 'MD'}</span><span class="nm">${esc(fl.name)}</span></button>
            <span class="tok mono">${fmt(t)}</span>
            <button class="att ${on ? 'on' : ''}" data-act="attach" data-v="${esc(fl.name)}" aria-pressed="${on}">${on ? '첨부됨' : '첨부'}</button>
          </li>`;
        }).join('')}</ul>
        ${f ? `<div class="viewer"><div class="viewer-h"><span class="mono">${esc(f.name)}</span><button class="btn ghost sm" data-act="close-view">닫기</button></div><div class="viewer-b">${f.kind === 'csv' ? csvTable(f.content) : `<div class="mdv">${md(f.content)}</div>`}</div></div>` : '<p class="viewer-empty">파일 이름을 누르면 여기서 내용을 볼 수 있어요. AI 없이 읽고 푸는 것도 실력이에요.</p>'}
      </section>
      <aside class="ai" id="ai"></aside>
    </div>`;
  }

  function bubbleHTML(t, i) {
    if (t.role === 'user') {
      return `<div class="msg me"><div class="msg-b">${esc(t.text)}</div>${t.files && t.files.length ? `<div class="msg-files">${t.files.map((f) => `<span class="chip">${esc(f.name)} · ${fmt(f.tokens)}</span>`).join('')}</div>` : ''}</div>`;
    }
    return `<div class="msg bot ${t.pending ? 'pending' : ''}" ${t.pending ? 'id="pending"' : ''}><div class="msg-b mdv">${t.content ? md(t.content) : '<span class="thinking">생각하는 중…</span>'}</div>${t.truncated ? '<div class="note">답변이 길어서 중간에 끊겼어요.</div>' : ''}${t.error && t.content ? '<div class="note">답변이 중간에 멈췄어요.</div>' : ''}</div>`;
  }
  function updatePendingBubble(t) {
    const el = $('#pending .msg-b');
    if (el) { el.innerHTML = md(t.content); const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight; }
  }
  function renderAI() {
    const el = $('#ai');
    if (!el || !S) return;
    const item = QS[ui.q];
    const thread = threadOf(item.key);
    const draft = ui.draft;
    const m = meter(item, draft);
    const cap = S.cfg.cap;
    const pct = cap ? Math.min(100, (m.total / cap) * 100) : 0;
    const over = cap && m.total > cap;
    const reason = sendBlockReason(item, draft || ' ');
    el.innerHTML = `
      <div class="ai-h">
        <div><span class="ai-t">AI 어시스턴트</span><span class="ai-sub">문항 ${item.key} 대화 · Claude ${({ quick: '빠름', default: '표준', complex: '고성능' })[S.cfg.tier] || ''} · 지문과 문항은 이미 알고 있음</span></div>
        <button class="btn ghost sm" data-act="newchat" ${thread.length && !ui.sending ? '' : 'disabled'}>새 대화</button>
      </div>
      <div class="thread" id="thread">
        ${thread.length ? thread.map(bubbleHTML).join('') : `<div class="empty-thread">${aiStatus === 'none' ? aiNote() : '이 문항에 대해 질문해 보세요. 필요한 자료는 아래에서 골라 첨부하세요. 이전 문항의 첨부는 따라오지 않아요.'}</div>`}
      </div>
      ${ui.aiError ? `<div class="ai-err">${esc(ui.aiError)}</div>` : ''}
      <div class="composer">
        <div class="att-row">
          ${[...ui.attach].map((n) => { const f = fileByName(item.set, n); return f ? `<button class="chip on" data-act="attach" data-v="${esc(n)}" title="첨부 해제">${esc(n)} · ${fmt(est(f.content))} ✕</button>` : ''; }).join('') || '<span class="hint">첨부 없음 · 자료 목록에서 「첨부」를 누르세요</span>'}
        </div>
        <textarea id="msg" class="input" rows="3" placeholder="예: 첨부한 주문표에서 규칙 ②로 취소되는 주문을 메뉴별로 세어 줘. 표로만 답해.">${esc(draft)}</textarea>
        <div class="meter ${over ? 'over' : ''}">
          <div class="meter-bar"><span style="width:${pct}%"></span></div>
          <div class="meter-t mono" id="meter-t">${meterText(m, cap)}</div>
        </div>
        <div class="send-row">
          <span class="block" id="block">${esc(reason)}</span>
          ${ui.sending ? '<button class="btn danger" data-act="stop">중지</button>' : `<button class="btn primary" data-act="send" id="send-btn" ${reason || !draft.trim() ? 'disabled' : ''}>보내기 <span class="mono">(${S.aiLeft})</span></button>`}
        </div>
      </div>`;
    const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight;
  }
  function meterText(m, cap) {
    return `이번 요청: 문항 ${fmt(m.base)} + 첨부 ${fmt(m.att)} + 질문 ${fmt(m.msg)} = <b>${fmt(m.total)}</b>${cap ? ' / ' + fmt(cap) : ''}`;
  }
  function refreshComposerState() {
    if (!S || ui.view !== 'exam') return;
    const item = QS[ui.q];
    const m = meter(item, ui.draft);
    const cap = S.cfg.cap;
    const mt = $('#meter-t'); if (mt) mt.innerHTML = meterText(m, cap);
    const bar = $('.meter-bar span'); if (bar) bar.style.width = (cap ? Math.min(100, (m.total / cap) * 100) : 0) + '%';
    const mw = $('.meter'); if (mw) mw.classList.toggle('over', !!(cap && m.total > cap));
    const reason = sendBlockReason(item, ui.draft || ' ');
    const b = $('#block'); if (b) b.textContent = reason;
    const btn = $('#send-btn'); if (btn) btn.disabled = !!reason || !ui.draft.trim();
  }

  /* ───────── 결과 ───────── */
  function resultHTML() {
    const rows = QS.map((it) => ({ ...it, mine: S.answers[it.key], ok: grade(it.q, S.answers[it.key]) }));
    const score = rows.filter((r) => r.ok).length;
    const used = S.aiTotal - S.aiLeft;
    const took = (S.finishedAt || Date.now()) - S.startedAt;
    const ansLabel = (q) => (q.numeric ? fmt(q.answer) : q.answer) + (q.unit ? ' ' + q.unit : '');
    return `
    <div class="result">
      <section class="score">
        <p class="eyebrow">${S.cfg.mode === 'real' ? '실전 모의고사' : '세트 연습'} · 시드 ${S.cfg.seed}</p>
        <div class="score-big"><span class="mono">${score}</span><span class="of">/ ${QS.length}</span></div>
        <div class="score-stats">
          <div><span class="k">걸린 시간</span><span class="v mono">${clock(took)}</span></div>
          <div><span class="k">AI 질문</span><span class="v mono">${used} / ${S.aiTotal}</span></div>
          <div><span class="k">보낸 토큰(추정)</span><span class="v mono">${fmt(S.tokensSent)}</span></div>
          <div><span class="k">AI 없이 푼 문항</span><span class="v mono">${rows.filter((r) => !S.calls[r.key]).length}</span></div>
        </div>
        <div class="score-acts">
          <button class="btn primary" data-act="retry-same">같은 문제 다시 풀기</button>
          <button class="btn" data-act="retry-new">새 문제로 다시</button>
          <button class="btn ghost" data-act="lobby">처음 화면</button>
        </div>
      </section>
      <section class="review">
        <h2>문항별 채점과 해설</h2>
        ${rows.map((r) => `
          <details class="rv ${r.ok ? 'ok' : 'no'}">
            <summary>
              <span class="mark">${r.ok ? '정답' : '오답'}</span>
              <span class="q-key mono">${r.key}</span>
              <span class="rv-q">${esc(r.q.text)}</span>
              <span class="rv-ai mono">${S.calls[r.key] ? 'AI ' + S.calls[r.key] : 'AI 0'}</span>
            </summary>
            <div class="rv-b">
              <div class="rv-ans"><div><span class="k">내 답</span><span class="v">${isAnswered(r.key) ? esc(r.mine) : '<em>미응답</em>'}</span></div><div><span class="k">정답</span><span class="v">${esc(ansLabel(r.q))}</span></div></div>
              <p class="rv-exp">${esc(r.q.explain)}</p>
              ${(S.threads[r.key] || []).filter((t) => t.role === 'user').length ? `<div class="rv-prompts"><span class="k">내가 보낸 프롬프트</span>${S.threads[r.key].filter((t) => t.role === 'user').map((t) => `<div class="pp">${esc(t.text)}${t.files.length ? `<span class="pp-f">첨부: ${t.files.map((f) => esc(f.name)).join(', ')}</span>` : ''}</div>`).join('')}</div>` : ''}
            </div>
          </details>`).join('')}
      </section>
      <section class="coach">
        <h2>프롬프트 코칭</h2>
        <p class="hint">보낸 프롬프트를 AI 활용 역량 4D(위임·설명·판별·책임) 기준으로 평가받아요. 시험 횟수에는 포함되지 않아요.</p>
        ${coachHTML(used)}
      </section>
    </div>`;
  }
  function coachHTML(used) {
    if (!used) return '<p class="muted">AI에게 보낸 질문이 없어서 평가할 프롬프트가 없어요.</p>';
    if (aiStatus === 'none' || aiStatus === 'denied') return `<p class="muted">${aiNote()}</p>`;
    if (ui.coachBusy) return '<p class="thinking">프롬프트를 읽는 중… (30초 정도 걸려요)</p>';
    const c = ui.coach;
    if (!c) return '<button class="btn primary" data-act="coach">코칭 받기</button>';
    if (c.error) return `<p class="ai-err">${esc(c.error)}</p><button class="btn" data-act="coach">다시 시도</button>`;
    const sc = c.scores || {};
    return `
      <div class="d4">${['위임', '설명', '판별', '책임'].map((k) => `<div class="d4-i"><span class="k">${k}</span><span class="v mono">${esc(sc[k] ?? '-')}<small>/5</small></span><span class="d4-bar"><span style="width:${(Number(sc[k]) || 0) * 20}%"></span></span></div>`).join('')}</div>
      ${c.summary ? `<p class="coach-sum">${esc(c.summary)}</p>` : ''}
      <div class="grid2">
        <div><h3>잘한 점</h3><ul>${(c.good || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h3>고칠 점</h3><ul>${(c.improve || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      ${c.rewrite && c.rewrite.after ? `<div class="rewrite"><h3>다시 써 본 프롬프트 ${c.rewrite.q ? `<span class="mono">(${esc(c.rewrite.q)})</span>` : ''}</h3><div class="pp before">${esc(c.rewrite.before || '')}</div><div class="pp after">${esc(c.rewrite.after)}</div></div>` : ''}`;
  }
  async function runCoach() {
    if (!sample || ui.coachBusy) return;
    const log = QS.map((it) => {
      const turns = (S.threads[it.key] || []).filter((t) => t.role === 'user');
      if (!turns.length) return null;
      return `[${it.key}] 문항: ${it.q.text}\n결과: ${grade(it.q, S.answers[it.key]) ? '정답' : '오답'}\n` +
        turns.map((t, i) => `  프롬프트 ${i + 1}: ${t.text}\n  첨부: ${t.files.length ? t.files.map((f) => `${f.name}(${f.tokens}토큰)`).join(', ') : '없음'}`).join('\n');
    }).filter(Boolean).join('\n\n');
    const prompt = [
      '너는 AI 활용 역량 코치다. 아래는 응시자가 AI 해커톤 예선 2교시 연습에서 문항별로 AI에게 보낸 프롬프트 기록이다.',
      '시험 조건: AI 질문 횟수 제한(문항 수의 2~3배), 요청당 토큰 한도 때문에 필요한 파일만 골라 첨부해야 함, AI는 문항 지문을 이미 알고 있음, 답은 단답형.',
      '평가 기준(4D): 위임(무엇을 AI에게 맡기고 무엇을 직접 할지 나눴는가, 횟수를 아꼈는가), 설명(조건·함정 규칙·출력 형식을 명확히 적었는가), 판별(필요한 자료만 골라 첨부했는가, AI 답을 검산했는가), 책임(최종 답을 스스로 확인했는가).',
      '각 항목을 1~5점으로 매기고, 구체적인 프롬프트를 근거로 짧게 조언하라. 한국어로.',
      '오직 JSON 하나로 답하라. 형식: {"scores":{"위임":3,"설명":4,"판별":2,"책임":3},"summary":"두 문장 총평","good":["잘한 점 2~3개"],"improve":["고칠 점 2~3개"],"rewrite":{"q":"문항 키","before":"응시자 원래 프롬프트","after":"개선한 프롬프트"}}',
      '',
      log,
    ].join('\n');
    ui.coachBusy = true; render();
    try {
      ui.coach = await sample.json(prompt, { modelTier: 'default' });
    } catch (e) {
      ui.coach = { error: e && e.code === 'not_granted' ? 'AI 사용이 허용되지 않았어요.' : '코칭을 받지 못했어요. 다시 시도해 주세요.' };
    } finally { ui.coachBusy = false; render(); }
  }

  /* ───────── 제출 ───────── */
  function submit() {
    if (!S || S.submitted) return;
    if (ui.ctl) ui.ctl.abort();
    S.submitted = true; S.finishedAt = Date.now();
    ui.view = 'result'; ui.confirmSubmit = false;
    save(); render(); window.scrollTo(0, 0);
  }

  /* ───────── 이벤트 ───────── */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, v = b.dataset.v;
    switch (act) {
      case 'preset': readLobby(); { const seed = cfg.seed; const sets = cfg.mode === v ? cfg.sets : PRESETS[v].sets.slice(); cfg = { ...PRESETS[v], sets, seed }; } render(); break;
      case 'reseed': readLobby(); cfg.seed = randSeed(); render(); break;
      case 'start': readLobby(); if (cfg.sets.length) startExam(cfg); break;
      case 'resume': { const s = loadSaved(); if (s) resumeExam(s); break; }
      case 'discard': clearSaved(); render(); break;
      case 'goto': ui.q = +v; ui.attach.clear(); ui.aiError = ''; ui.draft = ''; ui.tab = ui.tab === 'f' ? 'f' : 'q'; keepFileIfSameSet(); render(); break;
      case 'prev': if (ui.q > 0) { ui.q--; ui.attach.clear(); ui.aiError = ''; ui.draft = ''; keepFileIfSameSet(); render(); } break;
      case 'next': if (ui.q < QS.length - 1) { ui.q++; ui.attach.clear(); ui.aiError = ''; ui.draft = ''; keepFileIfSameSet(); render(); } break;
      case 'tab': ui.tab = v; render(); break;
      case 'view': ui.file = ui.file === v ? null : v; if (ui.file && window.innerWidth < 900) ui.tab = 'f'; render(); break;
      case 'close-view': ui.file = null; render(); break;
      case 'attach': if (ui.attach.has(v)) ui.attach.delete(v); else ui.attach.add(v); render(); break;
      case 'send': send(); break;
      case 'stop': if (ui.ctl) ui.ctl.abort(); break;
      case 'newchat': if (!ui.sending) { S.threads[QS[ui.q].key] = []; ui.aiError = ''; save(); renderAI(); } break;
      case 'submit': ui.confirmSubmit = true; renderBar(); break;
      case 'submit-no': ui.confirmSubmit = false; renderBar(); break;
      case 'submit-yes': submit(); break;
      case 'retry-same': startExam({ ...S.cfg }); break;
      case 'retry-new': startExam({ ...S.cfg, seed: randSeed() }); break;
      case 'lobby': cfg = { ...S.cfg, seed: randSeed() }; ui.view = 'lobby'; render(); break;
      case 'coach': runCoach(); break;
    }
  });
  let lastSet = null;
  function keepFileIfSameSet() {
    const si = QS[ui.q].si;
    if (lastSet !== si) ui.file = null;
    lastSet = si;
  }
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (ui.view === 'lobby' && t.name) { readLobby(); render(); return; }
    if (ui.view === 'exam' && t.name === 'ans') {
      S.answers[QS[ui.q].key] = t.value; save();
      document.querySelectorAll('.choice').forEach((c) => c.classList.toggle('on', c.querySelector('input').checked));
      $('.sheet').innerHTML = sheetHTML(); renderBar();
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (ui.view !== 'exam') return;
    if (t.id === 'ans') { S.answers[QS[ui.q].key] = t.value; save(); $('.sheet').innerHTML = sheetHTML(); renderBar(); }
    if (t.id === 'msg') { ui.draft = t.value; refreshComposerState(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'msg' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });

  /* 1초마다: 타이머, 쿨다운 */
  setInterval(() => {
    if (!S || ui.view !== 'exam') return;
    if (S.endsAt && Date.now() >= S.endsAt) { submit(); return; }
    if (!ui.confirmSubmit) renderBar();
    refreshComposerState();
  }, 1000);

  /* ───────── 부팅 ───────── */
  function boot(data) {
    if (data && data.S) { S = data.S; cfg = { ...S.cfg }; SETS = buildSets(S.cfg); QS = questionList(); ui.view = data.view || 'exam'; ui.q = data.q || 0; }
    render();
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('sample').then((fn) => {
        sample = fn; aiStatus = fn ? 'ready' : 'none';
        if (ui.view === 'lobby') render(); else if (ui.view === 'exam') renderAI();
      }).catch(() => { aiStatus = 'none'; render(); });
    } else {
      aiStatus = 'none';
      setTimeout(render, 0);
    }
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ S, view: ui.view, q: ui.q }));
  if (hot && typeof hot.ready === 'function') hot.ready(boot); else boot((hot && hot.data) || {});
})();
