/* 문제 세트 생성기 — 시드마다 새 데이터를 만들고, 정답은 코드로 계산한다.
 * 각 생성기는 함정 조건(순진한 풀이와 정답이 갈리는지, 동점이 없는지)을
 * 만족할 때까지 다시 뽑는다. */
(function (G) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const f = mulberry32(seed);
    const R = {
      f,
      int: (a, b) => a + Math.floor(f() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(f() * arr.length)],
      shuffle: (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(f() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
    };
    R.sample = (arr, n) => R.shuffle(arr).slice(0, n);
    return R;
  }

  const SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노하곽성차주우구민유나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용'.split('');
  const GIVEN = ['민준','서연','도윤','지우','하준','서윤','시우','하은','주원','지민','예준','수아','지호','지유','준서','채원','건우','소율','현우','다은','우진','예린','선우','가은','연우','시은','유찬','민서','정우','윤서','승현','하린','지환','수빈','태윤','나연','은호','유나','재윤','서진','민재','예은','한결','다인','지훈','소희','성민','지안','동현','채은','상우','아린','준혁','수민','태민','혜원','진우','보람','경민','세아'];

  function uniqueNames(R, n) {
    const out = new Set();
    while (out.size < n) out.add(R.pick(SURNAMES) + R.pick(GIVEN));
    return [...out];
  }

  const won = (n) => Math.round(n).toLocaleString('ko-KR');
  const csv = (headers, rows) => [headers.join(','), ...rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(','))].join('\n');

  function argmaxUnique(map) {
    const e = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (e.length < 2) return e[0] ? e[0][0] : null;
    return e[0][1] > e[1][1] ? e[0][0] : null;
  }
  function topMargin(map) {
    const v = Object.values(map).sort((a, b) => b - a);
    return v.length < 2 ? Infinity : (v[0] - v[1]) / Math.max(1e-9, Math.abs(v[0]));
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function D(s) { return new Date(s + 'T00:00:00'); }
  function md(s) { const d = D(s); return `${d.getMonth() + 1}/${d.getDate()}`; }

  /* ───────────── 세트 A: 동아리 간식 수요조사 ───────────── */
  function genSnack(R) {
    const MENUS = ['떡볶이', '순대', '김밥', '치킨', '피자', '핫도그', '츄러스'];
    const DEPTS = [['컴퓨터공학과', '11'], ['전자공학과', '12'], ['경영학과', '31'], ['산업공학과', '14'], ['수학과', '21']];
    const COHORTS = [20, 21, 22, 23, 24, 25];
    const NOTES = ['', '', '', '', '맵게', '덜 맵게', '소스 많이', '늦게 도착해요', '콜라 추가 가능?', '', '반반 가능하면', ''];

    for (let attempt = 0; attempt < 2000; attempt++) {
      const counts = COHORTS.map(() => 2);
      let left = 17 - 12;
      while (left > 0) { const i = R.int(0, 5); if (counts[i] < 4) { counts[i]++; left--; } }
      const names = uniqueNames(R, 19);
      const used = new Set();
      const mkId = (c) => { let id; do { id = `20${c}${R.pick(DEPTS)[1]}${pad2(R.int(1, 99))}`; } while (used.has(id)); used.add(id); return id; };
      const members = [];
      let k = 0;
      COHORTS.forEach((c, ci) => {
        for (let j = 0; j < counts[ci]; j++) {
          const id = mkId(c);
          const dept = DEPTS.find((d) => d[1] === id.slice(4, 6))[0];
          members.push({ id, name: names[k++], dept, cohort: c });
        }
      });
      const empty = R.pick(COHORTS);
      const active = members.filter((m) => m.cohort !== empty);
      const nonmembers = [
        { id: mkId(empty), name: names[17], non: true },
        { id: mkId(R.pick(COHORTS.filter((c) => c !== empty))), name: names[18], non: true },
      ];

      // 주문 건수: 4건 이상 주문자 3명, 나머지 1~3건, 회원 주문 합 48건
      const heavy = R.sample(active, 3);
      const n = new Map(active.map((m) => [m, heavy.includes(m) ? R.int(4, 6) : R.int(1, 3)]));
      let sum = [...n.values()].reduce((a, b) => a + b, 0);
      let guard = 0;
      while (sum !== 48 && guard++ < 500) {
        const m = R.pick(active);
        const lo = heavy.includes(m) ? 4 : 1, hi = heavy.includes(m) ? 6 : 3;
        if (sum < 48 && n.get(m) < hi) { n.set(m, n.get(m) + 1); sum++; }
        else if (sum > 48 && n.get(m) > lo) { n.set(m, n.get(m) - 1); sum--; }
      }
      if (sum !== 48) continue;

      const slots = [];
      for (const [m, c] of n) for (let i = 0; i < c; i++) slots.push(m);
      slots.push(...nonmembers);
      const order = R.shuffle(slots);
      let t = D('2026-10-13').getTime() + 9 * 3600e3;
      const weights = [3, 2, 3, 4, 3, 2, 2];
      const pickMenu = () => { let x = R.f() * weights.reduce((a, b) => a + b); for (let i = 0; i < MENUS.length; i++) { x -= weights[i]; if (x < 0) return MENUS[i]; } return MENUS[0]; };
      const orders = order.map((m, i) => {
        t += R.int(3, 55) * 60e3;
        const d = new Date(t);
        return {
          no: i + 1, time: `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
          id: m.id, name: m.name, menu: pickMenu(), qty: R.f() < 0.75 ? 1 : 2, note: R.pick(NOTES), m,
        };
      });

      // 판정
      const byPerson = new Map();
      for (const o of orders) { if (!byPerson.has(o.m)) byPerson.set(o.m, []); byPerson.get(o.m).push(o); }
      for (const o of orders) {
        if (o.m.non) o.status = '무효';
        else {
          const list = byPerson.get(o.m);
          o.status = list.length >= 4 && list[list.length - 1] !== o ? '취소' : '유효';
        }
      }
      const cancelled = {}, validQty = {}, naiveQty = {};
      MENUS.forEach((x) => { cancelled[x] = 0; validQty[x] = 0; naiveQty[x] = 0; });
      for (const o of orders) {
        naiveQty[o.menu] += o.qty;
        if (o.status === '취소') cancelled[o.menu]++;
        if (o.status === '유효') validQty[o.menu] += o.qty;
      }
      const qCancel = argmaxUnique(cancelled);
      const qTop = argmaxUnique(validQty);
      const naiveTop = argmaxUnique(naiveQty);
      if (!qCancel || !qTop || qTop === naiveTop) continue;
      if (qCancel === qTop) continue;

      const target = R.pick(heavy);
      const tl = byPerson.get(target);
      const last = tl[tl.length - 1];
      if (tl[0].menu === last.menu) continue;
      const lastCount = tl.filter((o) => o.menu === last.menu).length;
      if (lastCount > 1) continue; // 최빈 메뉴로 찍으면 틀리게

      const cohortsWithValid = new Set(orders.filter((o) => o.status === '유효').map((o) => o.m.cohort));
      const emptyCohorts = COHORTS.filter((c) => !cohortsWithValid.has(c));
      if (emptyCohorts.length !== 1 || emptyCohorts[0] !== empty) continue;

      const ordersFile = csv(['주문번호', '접수시각', '학번', '이름', '메뉴', '수량', '요청사항'],
        orders.map((o) => [o.no, o.time, o.id, o.name, o.menu, o.qty, o.note]));
      const rosterRows = R.shuffle(members).sort((a, b) => a.id.localeCompare(b.id));
      const rosterFile = csv(['학번', '이름', '학과', '연락처'],
        rosterRows.map((m) => [m.id, m.name, m.dept, `010-****-${pad2(R.int(10, 99))}${pad2(R.int(0, 99))}`]));

      const tlDesc = tl.map((o) => `#${o.no} ${o.time} ${o.menu}`).join(' → ');
      const cancelDesc = Object.entries(cancelled).filter((e) => e[1]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}건`).join(', ');
      const validDesc = Object.entries(validQty).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      const naiveDesc = Object.entries(naiveQty).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');

      return {
        id: 'snack',
        title: '동아리 간식 수요조사',
        intro: 'IT 동아리 「바이트」는 10월 정기모임 간식 수요조사를 진행했다. 주문 집계 규칙은 다음과 같다.\n① 회원 명단에 있는 학번으로 접수된 주문만 유효하다.\n② 한 사람이 주문을 4건 이상 넣은 경우, 가장 마지막에 접수된 1건만 유효하고 그 이전 주문은 모두 취소된다. (3건 이하이면 모두 유효)',
        files: [
          { name: '간식_주문_수요조사.csv', kind: 'csv', content: ordersFile },
          { name: '동아리_회원명단.csv', kind: 'csv', content: rosterFile },
        ],
        questions: [
          {
            text: `${target.name} 회원(학번 ${target.id})이 최종적으로 받게 되는 간식 메뉴는 무엇인가?`,
            type: 'short', answer: last.menu, accept: [last.menu],
            explain: `${target.name} 회원은 ${tl.length}건을 주문했으므로 규칙 ②가 적용된다. 접수 순서: ${tlDesc}. 마지막 주문인 「${last.menu}」만 유효하다.`,
          },
          {
            text: '규칙 ②에 따라 취소된 주문 건수가 가장 많은 메뉴는 무엇인가?',
            type: 'choice', options: MENUS.slice(), answer: qCancel,
            explain: `4건 이상 주문한 ${heavy.length}명의 앞선 주문이 취소 대상이다. 메뉴별 취소 건수: ${cancelDesc}. 회원 명단에 없는 학번의 주문은 「취소」가 아니라 「무효」이므로 세지 않는다.`,
          },
          {
            text: '유효한 주문이 한 건도 없는 입학년도(학번)는 몇 학번인가?',
            type: 'choice', options: COHORTS.map((c) => `${c}학번`), answer: `${empty}학번`,
            explain: `회원 명단의 ${empty}학번 회원은 아무도 주문하지 않았다. 주문 목록에 학번 ${nonmembers[0].id}(${nonmembers[0].name})의 주문이 있지만 명단에 없는 학번이라 무효다. 주문 목록만 보고 학번 앞자리를 세면 함정에 걸린다.`,
          },
          {
            text: '유효한 주문만 집계했을 때, 주문 수량 합계가 가장 많은 메뉴는 무엇인가?',
            type: 'short', answer: qTop, accept: [qTop],
            explain: `유효 주문 수량 합계: ${validDesc}. 취소·무효 주문까지 모두 더하면 ${naiveDesc} 순이 되어 답이 달라진다.`,
          },
        ],
      };
    }
    throw new Error('snack 생성 실패');
  }

  /* ───────────── 세트 B: AI 구독 비용 최적화 ───────────── */
  const FEATURES = ['문서 작성', '요약·번역', '이미지 생성', '데이터 분석', '업무 자동화', 'API 연동', 'SSO·감사 로그'];
  const PLANS = [
    { key: 'Lite', price: 15000, credit: 400, rate: 15, feat: 2, min: 1, max: 5 },
    { key: 'Pro', price: 32000, credit: 1200, rate: 12, feat: 4, min: 2, max: 15 },
    { key: 'Team', price: 48000, credit: 2500, rate: 9, feat: 5, min: 5, max: 40 },
    { key: 'Enterprise', price: 72000, credit: 5000, rate: 7, feat: 7, min: 20, max: null },
  ];
  const FEATURE_USE = {
    '문서 작성': ['주간 보고서·회의록 초안 작성', '대외 공문 초안과 사내 공지 작성', '제안서 목차와 초안 작성'],
    '요약·번역': ['해외 자료 번역과 요약', '긴 계약서·규정 요약', '고객 문의 메일 번역'],
    '이미지 생성': ['홍보물 시안 이미지 제작', '교육 자료용 삽화 제작', '제품 콘셉트 이미지 제작'],
    '데이터 분석': ['월간 실적 데이터 분석', '설비 로그 통계 분석', '설문 결과 집계·분석'],
    '업무 자동화': ['정기 리포트 생성 워크플로 운영', '결재 문서 분류 자동화', '고객 문의 자동 분류'],
    'API 연동': ['사내 시스템과 API 연동', '사내 챗봇 백엔드 연동'],
    'SSO·감사 로그': ['보안 감사 대응을 위한 접속 기록 관리', '사내 계정 통합 로그인(SSO) 필수'],
  };
  const DEPT_INFO = {
    경영기획팀: '전사 사업계획과 경영 실적 보고를 담당한다.',
    인사팀: '채용, 평가, 인사 발령과 교육 운영을 담당한다.',
    재무팀: '결산, 예산 관리, 자금 집행을 담당한다.',
    법무팀: '계약 검토와 법률 리스크 관리를 담당한다.',
    마케팅팀: '브랜드 캠페인과 디지털 광고를 운영한다.',
    디자인팀: '제품 UI와 홍보물 디자인을 담당한다.',
    영업1팀: '국내 B2B 고객 영업을 담당한다.',
    영업2팀: '해외 대리점 영업을 담당한다.',
    고객지원팀: '고객 문의 응대와 기술 지원을 담당한다.',
    품질관리팀: '출하 품질 검사와 불량 분석을 담당한다.',
    생산기술팀: '생산 라인 공정 개선과 설비 관리를 담당한다.',
    연구개발1팀: '차세대 제품 선행 연구를 담당한다.',
    연구개발2팀: '양산 제품 개선 연구를 담당한다.',
    데이터분석팀: '전사 데이터 분석과 대시보드 운영을 담당한다.',
    IT인프라팀: '사내 시스템, 보안, 계정 관리를 담당한다.',
  };
  const FILLER = [
    '9월에는 분기 마감 업무가 겹쳐 사용량이 다소 늘었다.',
    '신규 입사자 대상 AI 활용 교육을 1회 진행했다.',
    '부서 내 프롬프트 템플릿 공유 문서를 만들어 활용 중이다.',
    '보안 가이드에 따라 고객 개인정보는 입력하지 않도록 안내했다.',
    '사용량은 월말에 몰리는 경향이 있다.',
    '부서장 요청으로 다음 분기 사용 계획을 검토 중이다.',
    '일부 구성원은 아직 기본 기능 위주로만 사용한다.',
    '팀 공용 워크스페이스에 자주 쓰는 지시문을 정리해 두었다.',
  ];

  function overage(plan, seats, used) {
    return Math.max(0, used - plan.credit * seats) * plan.rate;
  }

  function genSubscription(R) {
    const deptNames = Object.keys(DEPT_INFO);
    for (let attempt = 0; attempt < 5000; attempt++) {
      const planIdx = R.shuffle([0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 1]);
      const depts = deptNames.map((name, i) => {
        const p = planIdx[i];
        const plan = PLANS[p];
        let seats;
        if (p === 3) seats = R.int(24, 38);
        else seats = R.int(Math.max(plan.min, p === 2 ? 6 : plan.min), p === 2 ? 30 : plan.max);
        // 필수 기능 수준: 현재 플랜 이하
        const needTop = R.f() < 0.45 ? R.int(Math.max(0, PLANS[Math.max(0, p - 1)].feat - 1), plan.feat - 1) : R.int(0, plan.feat - 1);
        const need = new Set([0]);
        need.add(needTop);
        for (let f = 1; f < needTop; f++) if (R.f() < 0.5) need.add(f);
        const factor = 0.4 + R.f() * 1.1;
        const used = Math.round((plan.credit * seats * factor) / 10) * 10;
        const aug = Math.round((used * (0.75 + R.f() * 0.4)) / 10) * 10;
        const trial = FEATURES.slice(0, plan.feat).filter((_, f) => !need.has(f));
        return { name, p, seats, need: [...need].sort((a, b) => a - b), used, aug, trialFeat: trial.length && R.f() < 0.6 ? R.pick(trial) : null };
      });

      const cost = (d, p) => PLANS[p].price * d.seats + overage(PLANS[p], d.seats, d.used);
      const ov = {};
      depts.forEach((d) => { ov[d.name] = overage(PLANS[d.p], d.seats, d.used); });
      const ovTop = argmaxUnique(ov);
      if (!ovTop || topMargin(ov) < 0.05) continue;
      const usedTop = argmaxUnique(Object.fromEntries(depts.map((d) => [d.name, d.used])));
      if (usedTop === ovTop) continue;
      const augOv = {};
      depts.forEach((d) => { augOv[d.name] = overage(PLANS[d.p], d.seats, d.aug); });
      if (argmaxUnique(augOv) === ovTop) continue; // 8월 수치를 쓰면 틀리게

      const feasible = (d) => {
        if (d.p === 0) return false;
        const lo = PLANS[d.p - 1];
        return d.need[d.need.length - 1] < lo.feat && d.seats >= lo.min && (lo.max == null || d.seats <= lo.max);
      };
      const save = {}, naiveSave = {};
      depts.forEach((d) => {
        if (d.p === 0) return;
        naiveSave[d.name] = (PLANS[d.p].price - PLANS[d.p - 1].price) * d.seats;
        if (feasible(d)) save[d.name] = cost(d, d.p) - cost(d, d.p - 1);
      });
      const feas = Object.keys(save);
      if (feas.length < 3) continue;
      const saveTop = argmaxUnique(save);
      if (!saveTop || save[saveTop] <= 0 || topMargin(save) < 0.05) continue;
      if (argmaxUnique(naiveSave) === saveTop) continue;
      // 기본요금 절감만 보면 1등인 '가능' 부서가 초과요금 때문에 밀리는 함정이 있으면 더 좋다
      const feasNaive = {};
      feas.forEach((n) => { feasNaive[n] = naiveSave[n]; });
      if (argmaxUnique(feasNaive) === saveTop && R.f() < 0.7) continue;
      if (saveTop === ovTop) continue;

      // Q4: 사용량 30% 증가 — 현재는 초과가 없거나 작지만 증가 후 초과가 생기는 부서
      const q4cands = depts.filter((d) => d.name !== ovTop && d.name !== saveTop && overage(PLANS[d.p], d.seats, d.used) === 0 && overage(PLANS[d.p], d.seats, d.used * 1.3) > 0);
      if (!q4cands.length) continue;
      const q4 = R.pick(q4cands);
      const q4ans = overage(PLANS[q4.p], q4.seats, Math.round(q4.used * 1.3));

      // 인사 변동 내역 (기준: 10/1자 회수, 9/30까지 발효된 휴직·퇴직)
      const people = uniqueNames(R, 34);
      let pi = 0;
      const rows = [];
      const pickDept = () => R.pick(depts);
      const idle = [];
      const addRow = (name, d, type, date, note = '') => rows.push({ emp: '', name, dept: d.name, type, date, note });
      const nIdle = R.int(5, 7);
      for (let i = 0; i < nIdle; i++) {
        const d = pickDept(); const name = people[pi++];
        const type = R.f() < 0.5 ? '퇴직' : '휴직';
        const date = `2026-${R.pick(['07', '08', '09'])}-${pad2(R.int(1, 28))}`;
        addRow(name, d, type, date, type === '휴직' ? R.pick(['육아휴직', '병가 휴직', '학업 휴직']) : R.pick(['자진 퇴사', '계약 만료', '']));
        idle.push({ name, d });
      }
      // 함정 1: 9/30 이후 발효 퇴직·휴직
      for (let i = 0; i < 2; i++) { const d = pickDept(); addRow(people[pi++], d, R.pick(['퇴직', '휴직']), `2026-10-${pad2(R.int(2, 30))}`, '예정'); }
      // 함정 2: 휴직 후 9/30 이전 복직
      for (let i = 0; i < 2; i++) {
        const d = pickDept(); const name = people[pi++];
        addRow(name, d, '휴직', `2026-0${R.int(6, 7)}-${pad2(R.int(1, 28))}`, '병가 휴직');
        addRow(name, d, '복직', `2026-09-${pad2(R.int(1, 25))}`, '');
      }
      // 함정 3: 휴직 중이고 복직 예정일이 10/1 이후 → 여전히 유휴
      {
        const d = pickDept(); const name = people[pi++];
        addRow(name, d, '휴직', `2026-08-${pad2(R.int(1, 28))}`, '육아휴직');
        addRow(name, d, '복직', `2026-11-${pad2(R.int(1, 28))}`, '복직 예정');
        idle.push({ name, d });
      }
      // 함정 4: 입사·전보 (계정 회수 대상 아님)
      for (let i = 0; i < 3; i++) addRow(people[pi++], pickDept(), R.pick(['입사', '부서 이동']), `2026-09-${pad2(R.int(1, 28))}`, '');
      // 엔터프라이즈 최소 인원 침범 금지
      const idleByDept = {};
      idle.forEach((x) => { idleByDept[x.d.name] = (idleByDept[x.d.name] || 0) + 1; });
      if (Object.entries(idleByDept).some(([n, c]) => { const d = depts.find((x) => x.name === n); return PLANS[d.p].min > d.seats - c; })) continue;
      const idleSave = idle.reduce((s, x) => s + PLANS[x.d.p].price, 0);

      const hr = R.shuffle(rows).sort((a, b) => a.date.localeCompare(b.date));
      let empNo = 2014001;
      const empIds = {};
      hr.forEach((r) => { if (!empIds[r.name]) empIds[r.name] = String(empNo += R.int(37, 400)); r.emp = empIds[r.name]; });

      // 파일
      const pricing = [
        '# Nimbus AI 기업용 요금 견적서',
        '견적일: 2026-09-01 / 유효기간: 2026-12-31 / 계약 형태: 월간 계약 기준',
        '',
        '## 1. 플랜별 요금과 제공량 (VAT 별도)',
        '| 플랜 | 인당 월 요금 | 인당 월 기본 크레딧 | 초과 1크레딧당 요금 | 인원 조건 |',
        '|---|---|---|---|---|',
        ...PLANS.map((p) => `| ${p.key} | ${won(p.price)}원 | ${won(p.credit)} | ${p.rate}원 | ${p.max ? `${p.min}~${p.max}석` : `${p.min}석 이상`} |`),
        '',
        '## 2. 플랜별 포함 기능 (상위 플랜은 하위 플랜 기능을 모두 포함)',
        ...PLANS.map((p, i) => `- ${p.key}: ${FEATURES.slice(i ? PLANS[i - 1].feat : 0, p.feat).map((f) => f).join(', ')}${i ? ` (+ ${PLANS[i - 1].key} 기능 전체)` : ''}`),
        '',
        '## 3. 과금 기준',
        '- 기본 크레딧은 같은 부서(같은 구독) 안에서 합산해 공유한다. 미사용 크레딧은 다음 달로 이월되지 않는다.',
        '- 부서 합산 사용량이 부서 합산 기본 크레딧을 넘으면, 넘은 크레딧에 해당 플랜의 초과 단가를 곱해 청구한다.',
        '- 플랜 변경은 다음 달 1일부터 적용되며, 변경 후 플랜의 인원 조건을 충족해야 한다.',
        '- 연간 계약 시 인당 요금 15% 할인 (현재 귀사는 월간 계약 중이므로 해당 없음).',
        '- 좌석(라이선스) 회수 시 다음 달 1일부터 해당 좌석의 인당 월 요금이 청구되지 않는다.',
      ].join('\n');

      const summary = csv(['부서', '사용 플랜', '좌석 수'], depts.map((d) => [d.name, PLANS[d.p].key, d.seats]));

      const deptFiles = depts.map((d, i) => {
        const plan = PLANS[d.p];
        const lines = [
          `# ${d.name} 2026년 9월 AI 서비스 사용 현황`,
          `작성: ${d.name} 업무지원 담당 / 제출일: 2026-10-0${R.int(2, 6)}`,
          '',
          '## 1. 부서 개요',
          `${DEPT_INFO[d.name]} ${R.pick(FILLER)}`,
          '',
          '## 2. 구독 현황',
          `- 사용 플랜: ${plan.key}`,
          `- 라이선스(좌석) 수: ${d.seats}석`,
          `- 인당 월 요금: ${won(plan.price)}원`,
          `- 인당 월 기본 제공 크레딧: ${won(plan.credit)}`,
          '',
          '## 3. 사용량 (부서 합계)',
          `- 8월 실사용 크레딧: ${won(d.aug)}`,
          `- 9월 실사용 크레딧: ${won(d.used)}`,
          '',
          '## 4. 업무상 반드시 필요한 기능',
          ...d.need.map((f) => `- ${FEATURES[f]}: ${R.pick(FEATURE_USE[FEATURES[f]])}`),
        ];
        if (d.trialFeat) lines.push('', '## 5. 참고', `- ${d.trialFeat} 기능은 9월에 시범 삼아 몇 차례 써 봤으나 업무상 필수 기능은 아니다.`, `- ${R.pick(FILLER)}`);
        else lines.push('', '## 5. 참고', `- ${R.pick(FILLER)}`);
        return { name: `부서_${pad2(i + 1)}_${d.name}.md`, kind: 'text', content: lines.join('\n') };
      });

      const hrFile = csv(['사번', '이름', '부서', '변동 구분', '발효일', '비고'], hr.map((r) => [r.emp, r.name, r.dept, r.type, r.date, r.note]));

      const ovDesc = Object.entries(ov).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${won(v)}원`).join(', ');
      const top = depts.find((d) => d.name === ovTop);
      const sv = depts.find((d) => d.name === saveTop);
      const saveDesc = Object.entries(save).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${won(v)}원`).join(', ');
      const infeasible = depts.filter((d) => d.p > 0 && !feasible(d)).map((d) => d.name);
      const naiveBest = argmaxUnique(naiveSave);

      return {
        id: 'subscription',
        title: 'AI 구독 비용 최적화',
        intro: '(주)한결테크는 15개 부서가 각자 Nimbus AI를 구독하고 있다. 부서별 9월 사용 현황 보고서(15개), 요금 견적서, 부서별 플랜 현황표, 인사 변동 내역이 주어진다. 모든 비용은 월 기준, VAT 별도로 계산한다.',
        files: [
          { name: '00_부서별_플랜_현황.csv', kind: 'csv', content: summary },
          { name: 'Nimbus_AI_요금_견적서.md', kind: 'text', content: pricing },
          ...deptFiles,
          { name: '인사_변동_내역.csv', kind: 'csv', content: hrFile },
        ],
        questions: [
          {
            text: '9월 사용량 기준으로, 기본 제공 크레딧을 넘겨 발생한 초과 요금이 가장 큰 부서는 어디인가?',
            type: 'short', answer: ovTop, accept: [ovTop, ovTop.replace(/팀$/, '')],
            explain: `초과 요금 = max(0, 9월 사용량 − 좌석 수 × 인당 기본 크레딧) × 플랜 초과 단가. ${ovTop}: (${won(top.used)} − ${top.seats}×${won(PLANS[top.p].credit)}) × ${PLANS[top.p].rate}원. 상위 3개: ${ovDesc}. 사용량 자체가 가장 많은 부서(${usedTop})를 고르거나 8월 수치를 쓰면 틀린다.`,
          },
          {
            text: '업무상 필수 기능을 모두 유지하면서 바로 한 단계 아래 플랜의 인원 조건을 충족하는 부서만 다운그레이드할 수 있다. 9월 사용량 기준으로 월 총비용(기본요금 + 초과 요금)이 가장 많이 줄어드는 부서는 어디인가?',
            type: 'short', answer: saveTop, accept: [saveTop, saveTop.replace(/팀$/, '')],
            explain: `다운그레이드 가능 부서별 절감액(초과 요금 변화 포함): ${saveDesc}. ${saveTop}: ${PLANS[sv.p].key} → ${PLANS[sv.p - 1].key}. 기능·인원 조건 때문에 불가능한 부서: ${infeasible.join(', ') || '없음'}. 기본요금 차이만 보면 1등은 「${naiveBest}」로 보인다. 참고 항목의 '시범 사용' 기능은 필수 기능이 아니다.`,
          },
          {
            text: '회사는 10월 1일자로 유휴 계정(9월 30일까지 발효된 휴직·퇴직자, 단 9월 30일까지 복직한 사람은 제외)의 좌석을 회수하려 한다. 이로써 줄어드는 월 기본요금 합계는 몇 원인가?',
            type: 'short', numeric: true, answer: idleSave, tolerance: 0, unit: '원',
            explain: `회수 대상 ${idle.length}명: ${idle.map((x) => `${x.name}(${x.d.name}, ${PLANS[x.d.p].key} ${won(PLANS[x.d.p].price)}원)`).join(', ')}. 합계 ${won(idleSave)}원. 10월 이후 발효 건, 9월 중 복직한 사람, 입사·부서 이동은 제외하고, 복직 '예정'일이 11월인 휴직자는 포함한다.`,
          },
          {
            text: `${q4.name}의 10월 사용량이 9월보다 30% 늘어난다면, 현재 플랜과 좌석 수를 유지할 때 10월 초과 요금은 몇 원인가?`,
            type: 'short', numeric: true, answer: q4ans, tolerance: 0, unit: '원',
            explain: `${q4.name}: ${PLANS[q4.p].key}, ${q4.seats}석, 기본 크레딧 ${won(q4.seats * PLANS[q4.p].credit)}. 10월 사용량 ${won(q4.used)} × 1.3 = ${won(Math.round(q4.used * 1.3))}. 초과 ${won(Math.round(q4.used * 1.3) - q4.seats * PLANS[q4.p].credit)} × ${PLANS[q4.p].rate}원 = ${won(q4ans)}원.`,
          },
        ],
      };
    }
    throw new Error('subscription 생성 실패');
  }

  /* ───────────── 세트 C: 웨이퍼 검사 로그 ───────────── */
  function genWafer(R) {
    const EQ = ['ET-01', 'ET-02', 'ET-03', 'ET-04', 'ET-05'];
    const STEPS = ['STI', 'Gate', 'M1', 'CMP'];
    const WORKERS = ['A조', 'B조', 'C조'];
    const NOTES = ['', '', '', '', '', '재측정 완료', '샘플링 검사', '', '야간 투입', ''];
    const WEEKS = [['2026-09-01', '2026-09-04'], ['2026-09-07', '2026-09-11'], ['2026-09-14', '2026-09-18']];
    for (let attempt = 0; attempt < 5000; attempt++) {
      const base = {};
      EQ.forEach((e) => { base[e] = 0.03 + R.f() * 0.05; });
      const pmEq = R.pick(EQ);
      const pmDate = `2026-09-${pad2(R.pick([8, 9, 10, 14, 15]))}`;
      const badEq = R.pick(EQ.filter((e) => e !== pmEq));
      const badStart = R.pick(['2026-09-08', '2026-09-09']);
      const badEnd = ymd(addDays(D(badStart), 2));
      const lots = [];
      WEEKS.forEach(([s, e], wi) => {
        const days = [];
        for (let d = D(s); d <= D(e); d = addDays(d, 1)) days.push(ymd(d));
        const n = R.int(19, 23);
        for (let i = 0; i < n; i++) {
          const date = R.pick(days);
          const eq = R.pick(EQ);
          const wafers = R.f() < 0.3 ? R.int(4, 8) : R.int(18, 25);
          let rate = base[eq];
          if (eq === pmEq) rate *= date >= pmDate ? 0.55 : 1.5;
          const invalid = eq === badEq && date >= badStart && date <= badEnd;
          if (invalid) rate = 0.25 + R.f() * 0.2;
          // 작은 로트는 변동이 크다
          const noise = wafers < 10 ? R.f() * 0.25 : R.f() * 0.04 - 0.02;
          const defects = Math.max(0, Math.min(wafers, Math.round(wafers * Math.max(0, rate + noise))));
          lots.push({ week: wi, date, eq, step: R.pick(STEPS), wafers, defects, worker: R.pick(WORKERS), note: R.pick(NOTES), invalid });
        }
      });
      lots.sort((a, b) => a.date.localeCompare(b.date) || a.eq.localeCompare(b.eq));
      const seq = {};
      lots.forEach((l) => { const k = l.date.slice(5).replace('-', ''); seq[k] = (seq[k] || 0) + 1; l.id = `L${k}-${pad2(seq[k])}`; });

      const valid = lots.filter((l) => !l.invalid);
      const agg = (arr) => { const o = {}; EQ.forEach((e) => { const xs = arr.filter((l) => l.eq === e); const w = xs.reduce((s, l) => s + l.wafers, 0); const d = xs.reduce((s, l) => s + l.defects, 0); o[e] = w ? d / w : 0; }); return o; };
      const rate = agg(valid);
      const top = argmaxUnique(rate);
      if (!top || topMargin(rate) < 0.06) continue;
      const lotAvg = {};
      EQ.forEach((e) => { const xs = valid.filter((l) => l.eq === e); lotAvg[e] = xs.reduce((s, l) => s + l.defects / l.wafers, 0) / Math.max(1, xs.length); });
      const withBad = agg(lots);
      if (argmaxUnique(lotAvg) === top && argmaxUnique(withBad) === top) continue;
      if (argmaxUnique(lotAvg) === top && R.f() < 0.8) continue;
      const nInvalid = lots.filter((l) => l.invalid).length;
      if (nInvalid < 2) continue;

      const pmLots = valid.filter((l) => l.eq === pmEq);
      const before = pmLots.filter((l) => l.date < pmDate), after = pmLots.filter((l) => l.date >= pmDate);
      if (before.length < 3 || after.length < 3) continue;
      const r = (xs) => xs.reduce((s, l) => s + l.defects, 0) / xs.reduce((s, l) => s + l.wafers, 0);
      const delta = Math.round((r(after) - r(before)) * 1000) / 10;
      const deltaRaw = (r(after) - r(before)) * 100;
      if (Math.abs(deltaRaw * 10 - Math.round(deltaRaw * 10)) > 0.4) continue; // 반올림 경계 회피
      if (delta >= 0) continue;

      const stepDef = {};
      STEPS.forEach((s) => { stepDef[s] = valid.filter((l) => l.step === s).reduce((a, l) => a + l.defects, 0); });
      const stepTop = argmaxUnique(stepDef);
      const stepAll = {};
      STEPS.forEach((s) => { stepAll[s] = lots.filter((l) => l.step === s).reduce((a, l) => a + l.defects, 0); });
      if (!stepTop || topMargin(stepDef) < 0.03) continue;

      const files = WEEKS.map(([s, e], wi) => ({
        name: `검사로그_${wi + 1}주차_${md(s).replace('/', '')}-${md(e).replace('/', '')}.csv`, kind: 'csv',
        content: csv(['Lot ID', '검사일', '장비', '공정', '투입 웨이퍼', '불량 웨이퍼', '작업조', '비고'],
          lots.filter((l) => l.week === wi).map((l) => [l.id, l.date, l.eq, l.step, l.wafers, l.defects, l.worker, l.note])),
      }));
      const notice = [
        '# [공지] 검사 장비 센서 교정 오류 안내',
        `발신: 계측기술팀 / 일시: ${badEnd} 17:40`,
        '',
        `${badEq} 장비에서 센서 교정값 오류가 확인되었습니다. ${badStart}부터 ${badEnd}까지(양 끝 날짜 포함) ${badEq}에서 검사한 로트의 불량 판정 결과는 신뢰할 수 없으므로 모든 불량률 집계에서 제외해 주시기 바랍니다.`,
        '',
        `- 해당 기간 다른 장비의 데이터는 정상입니다.`,
        `- ${badEq}는 ${ymd(addDays(D(badEnd), 1))}부터 재교정을 마치고 정상 가동 중입니다.`,
        '- 해당 로트는 재검사 대상이 아니며, 웨이퍼는 정상 공정으로 진행되었습니다.',
      ].join('\n');
      const pmRows = [
        [pmEq, pmDate, '예방정비(PM): 척 교체, 광학계 정렬', '완료'],
        [R.pick(EQ.filter((e) => e !== pmEq)), '2026-08-27', '예방정비(PM): 정기 점검', '완료'],
        [R.pick(EQ.filter((e) => e !== pmEq)), '2026-09-25', '예방정비(PM): 정기 점검', '예정'],
      ];
      const pmFile = csv(['장비', 'PM 일자', '내용', '상태'], pmRows);

      const rateDesc = EQ.map((e) => `${e} ${(rate[e] * 100).toFixed(2)}%`).join(', ');
      const avgDesc = EQ.map((e) => `${e} ${(lotAvg[e] * 100).toFixed(2)}%`).join(', ');

      return {
        id: 'wafer',
        title: '웨이퍼 검사 로그 분석',
        intro: 'C2 라인의 3주간(9/1~9/18) 웨이퍼 검사 로그가 주차별로 나뉘어 있다. 장비 센서 오류 공지와 장비 PM(예방정비) 이력도 함께 주어진다. 별도 언급이 없으면 불량률은 「불량 웨이퍼 합 ÷ 투입 웨이퍼 합」으로 계산한다.',
        files: [...files, { name: '공지_센서_교정_오류.md', kind: 'text', content: notice }, { name: '장비_PM_이력.csv', kind: 'csv', content: pmFile }],
        questions: [
          {
            text: '센서 오류로 무효 처리할 데이터를 제외하고, 3주간 불량률이 가장 높은 장비는 무엇인가?',
            type: 'choice', options: EQ.slice(), answer: top,
            explain: `무효 데이터 제외 후 장비별 불량률(합계 기준): ${rateDesc}. 로트별 불량률을 단순 평균하면 ${avgDesc}로 순위가 달라질 수 있다(비율의 평균 함정). 무효 데이터를 포함하면 1위는 「${argmaxUnique(withBad) || '동점'}」로 보인다.`,
          },
          {
            text: '공지에 따라 집계에서 제외해야 하는 로트는 모두 몇 개인가?',
            type: 'short', numeric: true, answer: nInvalid, tolerance: 0, unit: '개',
            explain: `${badEq}, ${badStart} ~ ${badEnd}(양 끝 포함) 검사 로트: ${lots.filter((l) => l.invalid).map((l) => l.id).join(', ')} → ${nInvalid}개.`,
          },
          {
            text: `${pmEq} 장비의 PM 이후 불량률에서 PM 이전 불량률을 뺀 값은 몇 %p인가? (PM 당일 검사분은 PM 이후로 보고, 소수점 둘째 자리에서 반올림해 첫째 자리까지)`,
            type: 'short', numeric: true, answer: delta, tolerance: 0.05, unit: '%p',
            explain: `${pmEq} PM 일자 ${pmDate}. 이전 ${before.length}개 로트: 불량 ${before.reduce((s, l) => s + l.defects, 0)} / 투입 ${before.reduce((s, l) => s + l.wafers, 0)} = ${(r(before) * 100).toFixed(2)}%. 이후 ${after.length}개 로트: 불량 ${after.reduce((s, l) => s + l.defects, 0)} / 투입 ${after.reduce((s, l) => s + l.wafers, 0)} = ${(r(after) * 100).toFixed(2)}%. 차이 ${delta}%p. ${pmEq}가 무효 기간과 겹치지 않는지도 확인한다.`,
          },
          {
            text: '무효 데이터를 제외하고, 3주간 불량 웨이퍼 수 합계가 가장 많은 공정은 무엇인가?',
            type: 'choice', options: STEPS.slice(), answer: stepTop,
            explain: `공정별 불량 웨이퍼 합계(무효 제외): ${STEPS.map((s) => `${s} ${stepDef[s]}`).join(', ')}. 무효 포함 시: ${STEPS.map((s) => `${s} ${stepAll[s]}`).join(', ')}.`,
          },
        ],
      };
    }
    throw new Error('wafer 생성 실패');
  }

  /* ───────────── 세트 D: 해외 출장비 정산 ───────────── */
  function genTravel(R) {
    const CITIES = [
      { city: '도쿄', country: '일본', cur: 'JPY', hotel: [15000, 26000] },
      { city: '후쿠오카', country: '일본', cur: 'JPY', hotel: [12000, 24000] },
      { city: '산호세', country: '미국', cur: 'USD', hotel: [170, 290] },
      { city: '오스틴', country: '미국', cur: 'USD', hotel: [150, 260] },
      { city: '보스턴', country: '미국', cur: 'USD', hotel: [180, 300] },
    ];
    const LIMIT = { JPY: { hotel: 20000, per: 7000 }, USD: { hotel: 220, per: 60 } };
    for (let attempt = 0; attempt < 5000; attempt++) {
      // 환율표 (영업일만, 추석 9/24~25 고시 없음)
      const rates = [];
      let usd = 1380 + R.f() * 20, jpy = 930 + R.f() * 20;
      for (let d = D('2026-08-24'); d <= D('2026-09-30'); d = addDays(d, 1)) {
        const s = ymd(d);
        usd += R.f() * 12 - 6; jpy += R.f() * 8 - 4;
        if (d.getDay() === 0 || d.getDay() === 6 || s === '2026-09-24' || s === '2026-09-25') continue;
        rates.push({ date: s, USD: Math.round(usd * 10) / 10, JPY: Math.round(jpy * 100) / 100 });
      }
      const rateOn = (dep) => { let best = null; for (const r of rates) if (r.date < dep) best = r; return best; };

      const names = uniqueNames(R, 5);
      const cities = R.shuffle(CITIES);
      const trips = names.map((name, i) => {
        const c = cities[i];
        let dep;
        do { dep = ymd(addDays(D('2026-09-01'), R.int(0, 24))); } while (D(dep).getDay() === 0 || D(dep).getDay() === 6);
        const nights = R.int(3, 5);
        const ret = ymd(addDays(D(dep), nights));
        const nightly = [];
        for (let k = 0; k < nights; k++) {
          const nd = addDays(D(dep), k);
          const weekend = nd.getDay() === 5 || nd.getDay() === 6;
          let p = R.int(c.hotel[0], c.hotel[1]);
          if (weekend) p = Math.round(p * 1.15);
          if (c.cur === 'JPY') p = Math.round(p / 100) * 100;
          nightly.push({ date: ymd(nd), price: p });
        }
        return { name, ...c, dep, ret, nights, nightly, team: R.pick(['반도체설계팀', '해외영업팀', '공정기술팀', '구매팀', '품질보증팀']) };
      });
      // 월요일 출발자 1명 이상 (환율 기준일 함정)
      const monday = trips.filter((t) => D(t.dep).getDay() === 1);
      if (!monday.length) continue;
      const q3 = R.pick(monday);

      trips.forEach((t) => {
        const L = LIMIT[t.cur];
        t.days = t.nights + 1;
        t.perdiem = L.per * t.days;
        t.hotelOk = t.nightly.reduce((s, n) => s + Math.min(n.price, L.hotel), 0);
        t.hotelOver = t.nightly.reduce((s, n) => s + Math.max(0, n.price - L.hotel), 0);
        t.rate = rateOn(t.dep);
        const mult = t.cur === 'JPY' ? t.rate.JPY / 100 : t.rate.USD;
        t.mult = mult;
        t.total = Math.floor((t.perdiem + t.hotelOk) * mult);
        t.overKrw = Math.floor(t.hotelOver * mult);
        t.avgOver = Math.max(0, t.nightly.reduce((s, n) => s + n.price, 0) - L.hotel * t.nights);
      });
      if (trips.some((t) => !t.rate)) continue;
      const over = Object.fromEntries(trips.map((t) => [t.name, t.overKrw]));
      const overTop = argmaxUnique(over);
      if (!overTop || topMargin(over) < 0.08 || over[overTop] === 0) continue;
      const rawOver = Object.fromEntries(trips.map((t) => [t.name, t.hotelOver]));
      if (argmaxUnique(rawOver) === overTop) continue; // 통화 환산을 안 하면 틀리게
      // 1박 한도를 평균으로 적용하면 금액이 달라지는 사람을 Q1 대상으로
      const q1c = trips.filter((t) => t.name !== q3.name && t.hotelOver > 0 && t.avgOver !== t.hotelOver);
      if (!q1c.length) continue;
      const q1 = R.pick(q1c);
      const jp = trips.filter((t) => t.cur === 'JPY');
      if (jp.length < 1) continue;
      const jpOver = jp.reduce((s, t) => s + t.hotelOver, 0);
      if (jpOver === 0) continue;

      const rules = [
        '# 해외 출장 여비 규정 (발췌)',
        '시행일: 2026-01-01 / 관리부서: 재무팀',
        '',
        '## 제5조 (일비)',
        '- 일본: 1일 7,000엔 / 미국: 1일 60달러',
        '- 일수는 출발일과 귀국일을 모두 포함해 센다.',
        '',
        '## 제6조 (숙박비)',
        '- 1박당 한도: 일본 20,000엔 / 미국 220달러',
        '- 한도는 1박 단위로 적용한다. 한도를 넘은 금액은 본인 부담이며, 다른 날의 남은 한도와 합산하지 않는다.',
        '- 숙박비는 영수증에 적힌 현지 통화 금액을 기준으로 한다.',
        '',
        '## 제7조 (환율)',
        '- 원화 환산에는 출발일 「직전 고시일」의 매매기준율을 적용한다. 출발일 당일 환율은 쓰지 않는다.',
        '- 환율표에 없는 날(주말·공휴일)은 고시가 없는 날이다.',
        '- JPY는 100엔당 원화로 고시된다.',
        '',
        '## 제8조 (정산액)',
        '- 정산액(원) = (일비 + 인정 숙박비) × 적용 환율. 원 단위 미만은 버린다.',
        '- 교통비·식비는 법인카드로 별도 처리하므로 이 정산에 포함하지 않는다.',
      ].join('\n');
      const rateFile = csv(['고시일', 'USD (1달러)', 'JPY (100엔)'], rates.map((r) => [r.date, r.USD.toFixed(1), r.JPY.toFixed(2)]));
      const tripFiles = trips.map((t, i) => ({
        name: `출장보고_${pad2(i + 1)}_${t.name}.md`, kind: 'text',
        content: [
          `# 출장 결과 보고 — ${t.name} (${t.team})`,
          `- 출장지: ${t.country} ${t.city}`,
          `- 일정: ${t.dep}(${DOW[D(t.dep).getDay()]}) 출발 ~ ${t.ret}(${DOW[D(t.ret).getDay()]}) 귀국, ${t.nights}박 ${t.days}일`,
          `- 목적: ${R.pick(['고객사 기술 미팅', '협력사 공정 감사', '학회 참석 및 발표', '장비 입고 검수', '신규 공급사 실사'])}`,
          '',
          '## 숙박 영수증',
          `| 숙박일 | 금액(${t.cur}) |`,
          '|---|---|',
          ...t.nightly.map((n) => `| ${n.date}(${DOW[D(n.date).getDay()]}) | ${n.price.toLocaleString('en-US')} |`),
          '',
          '## 기타 지출 (법인카드 사용)',
          `- 현지 교통: ${t.cur === 'JPY' ? (R.int(8, 30) * 1000).toLocaleString('en-US') + ' JPY' : R.int(60, 240) + ' USD'}`,
          `- 식비: ${t.cur === 'JPY' ? (R.int(10, 40) * 1000).toLocaleString('en-US') + ' JPY' : R.int(80, 300) + ' USD'}`,
          '',
          '## 메모',
          `- ${R.pick(['현지 미팅 일정이 하루 연장될 뻔했으나 예정대로 귀국함.', '호텔은 회사 지정 예약 사이트를 이용함.', '주말 숙박 요금이 평일보다 높았음.', '출발 전 환전은 개인적으로 진행함.'])}`,
        ].join('\n'),
      }));

      const q1Desc = `${q1.name}: ${q1.city}, ${q1.days}일 → 일비 ${q1.perdiem.toLocaleString('en-US')} ${q1.cur}. 1박 한도 ${LIMIT[q1.cur].hotel.toLocaleString('en-US')} 적용 인정 숙박비 ${q1.hotelOk.toLocaleString('en-US')} ${q1.cur}. 출발 ${q1.dep} → 직전 고시일 ${q1.rate.date} 환율 ${q1.cur === 'JPY' ? q1.rate.JPY.toFixed(2) + '원/100엔' : q1.rate.USD.toFixed(1) + '원/달러'}. (${q1.perdiem} + ${q1.hotelOk}) × ${q1.cur === 'JPY' ? (q1.rate.JPY / 100).toFixed(4) : q1.rate.USD.toFixed(1)} = ${won(q1.total)}원(원 미만 버림).`;

      return {
        id: 'travel',
        title: '해외 출장비 정산',
        intro: '재무팀은 9월 해외 출장자 5명의 여비를 정산하려 한다. 출장 여비 규정, 환율표(매매기준율), 출장자별 결과 보고서가 주어진다.',
        files: [
          { name: '해외출장_여비규정.md', kind: 'text', content: rules },
          { name: '환율표_2026-08-09.csv', kind: 'csv', content: rateFile },
          ...tripFiles,
        ],
        questions: [
          {
            text: `${q1.name}의 출장 여비 정산액은 몇 원인가?`,
            type: 'short', numeric: true, answer: q1.total, tolerance: 1, unit: '원',
            explain: q1Desc + ` 숙박 한도를 평균으로 적용하거나 출발일 당일 환율을 쓰면 틀린다.`,
          },
          {
            text: '숙박비 한도 초과로 본인이 부담하게 되는 금액을 원화로 환산했을 때, 가장 많이 부담하는 출장자는 누구인가?',
            type: 'short', answer: overTop, accept: [overTop],
            explain: `초과분(원화 환산): ${trips.map((t) => `${t.name} ${t.hotelOver.toLocaleString('en-US')} ${t.cur} → ${won(t.overKrw)}원`).join(', ')}. 통화를 환산하지 않고 숫자만 비교하면 엔화 금액이 커 보여 틀린다.`,
          },
          {
            text: `${q3.name}의 정산에 적용해야 하는 환율의 고시일은 언제인가? (예: 9/12)`,
            type: 'short', date: true, answer: md(q3.rate.date), accept: [md(q3.rate.date)],
            explain: `${q3.name}은 ${q3.dep}(${DOW[D(q3.dep).getDay()]}) 출발. 출발일 당일이 아닌 직전 고시일을 쓰고, 주말에는 고시가 없으므로 ${q3.rate.date}(${DOW[D(q3.rate.date).getDay()]})의 환율을 적용한다.`,
          },
          {
            text: '일본 출장자들의 숙박비 중 1박 한도를 넘어 인정되지 않는 금액은 모두 몇 엔인가?',
            type: 'short', numeric: true, answer: jpOver, tolerance: 0, unit: '엔',
            explain: `일본 출장자: ${jp.map((t) => `${t.name}(${t.nightly.map((n) => n.price.toLocaleString('en-US')).join(', ')}) → 초과 ${t.hotelOver.toLocaleString('en-US')}엔`).join(' / ')}. 1박 한도 20,000엔을 밤마다 따로 적용한다.`,
          },
        ],
      };
    }
    throw new Error('travel 생성 실패');
  }

  const GENERATORS = { snack: genSnack, subscription: genSubscription, wafer: genWafer, travel: genTravel };
  const SET_ORDER = ['snack', 'subscription', 'wafer', 'travel'];

  function generateSet(id, seed) {
    // 세트마다 다른 시드 스트림
    const salt = { snack: 11, subscription: 23, wafer: 37, travel: 53 }[id];
    return GENERATORS[id](makeRng((seed * 2654435761 + salt * 97) >>> 0));
  }

  G.ExamGen = { generateSet, SET_ORDER, makeRng };
})(typeof window !== 'undefined' ? window : globalThis);
