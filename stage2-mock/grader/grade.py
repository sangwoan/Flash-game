"""2차 예선 모의 채점기.

사용법 (작업 폴더에서):
    python <키트경로>/grader/grade.py                      # output/assignments.csv 채점
    python <키트경로>/grader/grade.py --url http://localhost:8000   # 화면·API까지 확인
    python <키트경로>/grader/grade.py --stage2              # 담당자 추가 요청(inbox) 반영 후 채점

작업 폴더의 파일은 읽기만 한다.
"""
import argparse, csv, filecmp, json, os, sys, urllib.error, urllib.request
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '_reference'))
import model  # noqa: E402

KIT_DATA = os.path.join(HERE, '..', 'exam', 'data')
COLUMNS = ['emp_id', 'status', 'route_id', 'bus_id', 'board_stop', 'board_time', 'seat_no', 'reason_code', 'alternative']
BUNDLES = [
    ('①', '내 버스 조회', 'R1·R2·R5', 20),
    ('②', '기본 배정', 'R3·C1', 15),
    ('③', '정원 지키기', 'R4·C3·C4', 25),
    ('④', '민원 줄이기', 'R7·C2·C5', 20),
    ('⑤', '예외 처리', 'R9·C6·C7', 15),
    ('⑥', '기타', 'R6·R8·R10·C8', 5),
]
STAGE2_OVERRIDE = {'B-R2-D': 28}


class Report:
    def __init__(self):
        self.items = defaultdict(list)  # bundle -> [(score 0~1 or None, label, detail)]

    def add(self, bundle, ratio, label, detail=''):
        self.items[bundle].append((ratio, label, detail))

    def print(self, metrics):
        total = 0
        print()
        print('=' * 64)
        print(' 2차 예선 모의 채점 결과')
        print('=' * 64)
        for b, name, conds, pts in BUNDLES:
            its = self.items.get(b, [])
            scored = [r for r, _, _ in its if r is not None]
            got = pts * (sum(scored) / len(its)) if its else 0
            total += got
            print(f'\n{b} {name} ({conds})  {got:.1f} / {pts}')
            for r, label, detail in its:
                mark = '➖' if r is None else ('✅' if r >= 1 else ('🟡' if r > 0 else '❌'))
                print(f'   {mark} {label}' + (f'\n      └ {detail}' if detail else ''))
        print('\n' + '-' * 64)
        print(' 지표')
        for k, v in metrics:
            print(f'   {k:<28} {v}')
        print('-' * 64)
        print(f' 총점 {total:.1f} / 100')
        print('=' * 64)
        print(' ➖ = 확인하지 못함(점수 0). --url로 서버 주소를 주면 화면·API를 확인합니다.')


def load_output(path):
    with open(path, encoding='utf-8-sig') as f:
        rd = csv.DictReader(f)
        cols = [c.strip() for c in (rd.fieldnames or [])]
        rows = [{(k or '').strip(): (v or '').strip() for k, v in r.items()} for r in rd]
    return cols, rows


def fetch(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read().decode('utf-8', 'replace')
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:  # 서버 꺼짐 등
        return None, str(e)


def short(xs, n=5):
    xs = list(xs)
    return ', '.join(map(str, xs[:n])) + (f' 외 {len(xs) - n}건' if len(xs) > n else '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workspace', default='.', help='작업 폴더 (기본: 현재 폴더)')
    ap.add_argument('--url', help='실행 중인 서비스 주소. 예: http://localhost:8000')
    ap.add_argument('--stage2', action='store_true', help='inbox의 담당자 추가 요청 반영 기준으로 채점')
    a = ap.parse_args()

    ws = os.path.abspath(a.workspace)
    data_dir = os.path.join(ws, 'data') if os.path.isdir(os.path.join(ws, 'data')) else KIT_DATA
    out_path = os.path.join(ws, 'output', 'assignments.csv')
    override = STAGE2_OVERRIDE if a.stage2 else None
    rep = Report()

    net, people, ref = model.solve(KIT_DATA, 'v2', override)
    _, _, ref_v1 = model.solve(KIT_DATA, 'v1', override)
    P = {p['emp_id']: p for p in people}
    ref_by = {r['emp_id']: r for r in ref}
    unassigned = lambda rows: sum(1 for r in rows if r['status'] == '미배정' and r['reason_code'] != 'INVALID')
    base_v1, base_v2 = unassigned(ref_v1), unassigned(ref)

    if not os.path.exists(out_path):
        print(f'output/assignments.csv가 없습니다: {out_path}')
        print('README의 「제출물」 형식대로 결과 파일을 만든 뒤 다시 실행하세요.')
        sys.exit(1)
    cols, rows = load_output(out_path)
    missing_cols = [c for c in COLUMNS if c not in cols]
    if missing_cols:
        print('assignments.csv에 필요한 열이 없습니다: ' + ', '.join(missing_cols))
        print('필요한 열: ' + ','.join(COLUMNS))
        sys.exit(1)

    by = {}
    dup_rows = []
    for r in rows:
        if r['emp_id'] in by:
            dup_rows.append(r['emp_id'])
        by[r['emp_id']] = r
    assigned = [r for r in rows if r['status'] == '배정']

    def seat(r):
        try:
            return int(float(r['seat_no']))
        except ValueError:
            return None

    # ── ① 조회 ──
    bad_time = [r['emp_id'] for r in assigned if r['bus_id'] in net.buses and net.on_route(net.buses[r['bus_id']]['route'], r['board_stop'])
                and r['board_time'] != net.board_time(r['bus_id'], r['board_stop'])]
    checkable = [r for r in assigned if r['bus_id'] in net.buses and net.on_route(net.buses[r['bus_id']]['route'], r['board_stop'])]
    rep.add('①', 1 if checkable and not bad_time else 0, 'R2 탑승 시각이 정류장별로 맞다',
            f'틀린 시각 {len(bad_time)}건: {short(bad_time)} (예: 캠퍼스 도착 시각 − 해당 정류장부터 캠퍼스까지 소요 분)' if bad_time else '')
    seat_bad = []
    per_bus = defaultdict(list)
    for r in assigned:
        s = seat(r)
        cap = net.buses.get(r['bus_id'], {}).get('cap', 0)
        if s is None or s < 1 or s > cap:
            seat_bad.append(r['emp_id'])
        per_bus[r['bus_id']].append(s)
    dup_seat = [b for b, ss in per_bus.items() if len([s for s in ss if s is not None]) != len({s for s in ss if s is not None})]
    rep.add('①', 1 if assigned and not seat_bad and not dup_seat else 0, 'R5 좌석 번호가 1~정원 범위이고 버스 안에서 겹치지 않는다',
            (f'범위 밖/빈 좌석 {len(seat_bad)}건: {short(seat_bad)}. ' if seat_bad else '') + (f'좌석 중복 버스: {short(dup_seat)}' if dup_seat else ''))

    if a.url:
        base = a.url.rstrip('/')
        st, body = fetch(base + '/')
        rep.add('①', 1 if st == 200 and '<' in body else 0, 'R1 조회 화면이 열린다 (GET /)', '' if st == 200 else f'응답: {st} {body[:80]}')
        samples = []
        for cond in [lambda r: r['status'] == '배정' and r['reason_code'] == 'OK', lambda r: r['reason_code'] == 'ALT',
                     lambda r: r['status'] == '미배정' and r['reason_code'] != 'INVALID', lambda r: r['reason_code'] == 'INVALID']:
            hit = next((r for r in rows if cond(r)), None)
            if hit:
                samples.append(hit)
        bad = []
        for r in samples:
            st, body = fetch(f"{base}/api/assignment?emp_id={r['emp_id']}")
            try:
                j = json.loads(body)
            except ValueError:
                bad.append(f"{r['emp_id']}: JSON 아님 ({st})"); continue
            for k in ['status', 'bus_id', 'board_time', 'seat_no', 'reason_code', 'alternative']:
                if str(j.get(k, '') if j.get(k) is not None else '').strip() != r[k]:
                    bad.append(f"{r['emp_id']}.{k}: API={j.get(k)!r} CSV={r[k]!r}"); break
        rep.add('①', 1 if samples and not bad else 0, 'R1 사번 조회 API가 결과 파일과 같은 값을 준다 (GET /api/assignment?emp_id=)', short(bad, 3))
        st, _ = fetch(f'{base}/api/assignment?emp_id=E0000')
        rep.add('①', 1 if st == 404 else 0, 'R1 없는 사번은 404로 안내한다', '' if st == 404 else f'E0000 응답 코드: {st}')
    else:
        rep.add('①', None, 'R1 조회 화면·API (--url 필요)')

    # ── ② 기본 배정 ──
    app_ids = set(P)
    out_ids = set(by)
    miss, extra = app_ids - out_ids, out_ids - app_ids
    rep.add('②', 1 if not miss and not extra and not dup_rows else 0, 'R3 신청자 전원이 정확히 한 줄씩 결과를 가진다',
            ' / '.join(x for x in [f'누락 {len(miss)}명: {short(sorted(miss))}' if miss else '', f'신청 안 한 사번 {len(extra)}명: {short(sorted(extra))}' if extra else '',
                                   f'중복 줄: {short(dup_rows)}' if dup_rows else ''] if x))
    bad_status = [r['emp_id'] for r in rows if r['status'] not in ('배정', '미배정')]
    rep.add('②', 0 if bad_status else 1, 'status는 「배정」 또는 「미배정」', short(bad_status))
    c1 = []
    nobus = []
    for r in assigned:
        b = net.buses.get(r['bus_id'])
        if not b:
            nobus.append(f"{r['emp_id']}({r['bus_id']})"); continue
        p = P.get(r['emp_id'])
        if p and b['shift'] != p['shift']:
            c1.append(f"{r['emp_id']}: {p['shift']} 직원 → {b['shift']} 버스")
    rep.add('②', 1 if assigned and not c1 and not nobus else 0, 'C1 근무조에 맞는 버스에만 배정한다',
            ' / '.join(x for x in [short(c1, 3), f'없는(폐지된) 버스: {short(nobus)}' if nobus else ''] if x))

    # ── ③ 정원 ──
    load = Counter(r['bus_id'] for r in assigned)
    over = [f'{b} {n}/{net.buses[b]["cap"]}' for b, n in load.items() if b in net.buses and n > net.buses[b]['cap']]
    rep.add('③', 1 if assigned and not over else 0, 'R4 어떤 버스도 정원을 넘지 않는다', short(over) + (' (B-R3-A는 개편으로 28석)' if any('B-R3-A' in o for o in over) else ''))
    # C3: 1지망으로 B를 신청했는데 B에 못 탄 사람이 있으면, B 탑승자는 전원 1지망 B이면서 우선순위가 더 높아야 한다
    want = defaultdict(list)
    for p in people:
        if p['invalid']:
            continue
        bid = net.bus_for(p['r1'], p['shift'])
        if bid and net.on_route(p['r1'], p['stop']):
            want[bid].append(p)
    viol = []
    for bid, ps in want.items():
        riders = [P[r['emp_id']] for r in assigned if r['bus_id'] == bid and r['emp_id'] in P]
        rider_ids = {q['emp_id'] for q in riders}
        losers = [p for p in ps if p['emp_id'] not in rider_ids]
        if not losers:
            continue
        best_loser = min(losers, key=lambda p: p['key'])
        for q in riders:
            first_choice = net.bus_for(q['r1'], q['shift']) == bid and net.on_route(q['r1'], q['stop'])
            if not first_choice or q['key'] > best_loser['key']:
                viol.append(f"{bid}: {q['emp_id']} 탑승, {best_loser['emp_id']}(우선순위 더 높음) 탈락")
                break
    rep.add('③', 1 if assigned and not viol else 0, 'C3 만석이면 우선순위(교통약자 → 만석 민원 → 신청 시각 → 사번) 순으로 태운다',
            short(viol, 3) + (' (힌트: 같은 사람의 신청이 여러 건이면 마지막 신청 시각 기준, 민원은 「만석 미탑승」 유형만)' if viol else ''))
    c4 = []
    for bid in load:
        rs = [r for r in assigned if r['bus_id'] == bid and r['emp_id'] in P]
        mob_back = [r for r in rs if P[r['emp_id']]['mobility'] and (seat(r) or 0) > 4]
        gen_front = [r for r in rs if not P[r['emp_id']]['mobility'] and seat(r) is not None and seat(r) <= 4]
        if mob_back and gen_front:
            c4.append(f'{bid}: 교통약자 {mob_back[0]["emp_id"]}가 {seat(mob_back[0])}번, 일반 {gen_front[0]["emp_id"]}가 {seat(gen_front[0])}번')
        n_gen = len([r for r in rs if not P[r['emp_id']]['mobility']])
        if gen_front and n_gen <= net.buses.get(bid, {}).get('cap', 0) - 4 and not mob_back:
            c4.append(f'{bid}: 5번 이후 좌석이 남는데 일반 직원 {gen_front[0]["emp_id"]}가 우선석 {seat(gen_front[0])}번')
    rep.add('③', 1 if assigned and not c4 else 0, 'C4 1~4번은 교통약자 우선석 (일반 직원은 5번부터)', short(c4, 3))

    # ── ④ 민원 줄이기 ──
    c2 = [r['emp_id'] for r in assigned if r['bus_id'] in net.buses and not net.on_route(net.buses[r['bus_id']]['route'], r['board_stop'])]
    rep.add('④', 1 if assigned and not c2 else 0, 'C2 탑승 정류장이 배정 노선(개편 후)의 경유 정류장이다', short(c2))
    c5 = []
    for r in assigned:
        if r['reason_code'] != 'ALT' or r['emp_id'] not in P or r['board_stop'] not in net.stops:
            continue
        p = P[r['emp_id']]
        if r['board_stop'] != p['stop'] and net.dist(p['home'], r['board_stop']) > model.ALT_RADIUS_KM + 1e-9:
            c5.append(f"{r['emp_id']}: 집 {p['home']} → {r['board_stop']} {net.dist(p['home'], r['board_stop']):.2f}km")
    rep.add('④', 1 if assigned and not c5 else 0, 'C5 대체 배정은 집 정류장 2km 이내에서만', short(c5, 3))
    mine = unassigned(rows)
    ratio = 1 if mine <= base_v2 else (0.5 if mine <= base_v1 else 0)
    rep.add('④', ratio, f'R7 미탑승 인원 줄이기: {mine}명 (1지망만 배정 시 {base_v1}명, 기준 {base_v2}명 이하면 만점)',
            '' if ratio == 1 else '1지망 실패자를 2지망 → 2km 이내 다른 노선 순으로 다시 시도해 보세요.')

    # ── ⑤ 예외 처리 ──
    c6 = []
    for r in rows:
        rc = r['reason_code']
        if r['status'] == '배정' and rc not in model.OK_REASONS:
            c6.append(f"{r['emp_id']}: 배정인데 {rc or '빈 값'}")
        if r['status'] == '미배정':
            if rc not in model.FAIL_REASONS:
                c6.append(f"{r['emp_id']}: 미배정 사유 {rc or '빈 값'}")
            elif not r['alternative']:
                c6.append(f"{r['emp_id']}: 대안 안내 없음")
    rep.add('⑤', 0 if c6 else 1, 'R9·C6 미배정자는 정해진 사유 코드와 대안 안내를 가진다', short(c6, 3))
    ref_invalid = {e for e, r in ref_by.items() if r['reason_code'] == 'INVALID'}
    my_invalid = {e for e, r in by.items() if r['reason_code'] == 'INVALID'}
    rep.add('⑤', 1 if ref_invalid == my_invalid else 0, 'C7 신청서 오류(없는 사번·없는 노선)만 INVALID로 처리한다',
            ' / '.join(x for x in [f'INVALID여야 함: {short(sorted(ref_invalid - my_invalid))}' if ref_invalid - my_invalid else '',
                                   f'INVALID가 아님: {short(sorted(my_invalid - ref_invalid))}' if my_invalid - ref_invalid else ''] if x))
    r4 = [p['emp_id'] for p in people if p['app']['route_1st'] == 'R4']
    r4_bad = [e for e in r4 if e in by and (by[e]['reason_code'] == 'INVALID' or by[e]['route_id'] == 'R4' or by[e]['bus_id'].startswith('B-R4'))]
    rep.add('⑤', 1 if r4 and not r4_bad else 0, f'C7 폐지 노선(R4) 신청자 {len(r4)}명을 개편 안내대로 전환한다', short(r4_bad))
    dups = [e for e, n in Counter(x['emp_id'] for x in model.read(KIT_DATA, 'applications.csv')).items() if n > 1]
    dup_bad = [e for e in dups if e in by and e in P and by[e]['reason_code'] == 'OK' and by[e]['route_id'] != P[e]['r1']]
    dup_bad += [e for e in dups if e in by and e in ref_by and (by[e]['reason_code'] == 'INVALID') != (ref_by[e]['reason_code'] == 'INVALID')]
    rep.add('⑤', 0 if dup_bad else 1, f'C7 같은 사번의 중복 신청 {len(dups)}건은 마지막 신청만 쓴다', short(sorted(set(dup_bad))))

    # ── ⑥ 기타 ──
    if a.url:
        st, body = fetch(a.url.rstrip('/') + '/api/summary')
        try:
            j = json.loads(body); items = j if isinstance(j, list) else j.get('buses', [])
            got = {str(x.get('bus_id')): int(x.get('assigned', -1)) for x in items}
            ok = all(got.get(b) == n for b, n in load.items())
        except Exception:
            ok = False
        rep.add('⑥', 1 if ok else 0, 'R6 관리자 현황 API가 버스별 탑승 인원을 맞게 준다 (GET /api/summary)', '' if ok else f'응답: {st} {body[:80]}')
    else:
        rep.add('⑥', None, 'R6 관리자 현황 (--url 필요)')
    rep.add('⑥', 1, 'R8 결과 파일 output/assignments.csv 형식')
    r10 = [r['emp_id'] for r in assigned if r['bus_id'].startswith('B-R4')]
    rep.add('⑥', 0 if r10 else 1, 'R10 개편 반영: 폐지된 R4 버스에 배정하지 않는다', short(r10))
    ws_data = os.path.join(ws, 'data')
    if os.path.isdir(ws_data):
        changed = [f for f in sorted(os.listdir(KIT_DATA)) if not os.path.exists(os.path.join(ws_data, f)) or not filecmp.cmp(os.path.join(KIT_DATA, f), os.path.join(ws_data, f), shallow=False)]
        rep.add('⑥', 0 if changed else 1, 'C8 원본 data/ 폴더를 수정하지 않았다', f'바뀌었거나 없어진 파일: {", ".join(changed)}' if changed else '')
    else:
        rep.add('⑥', None, 'C8 원본 data/ 폴더 확인 (작업 폴더에 data/가 없음)')

    comp_left = [r['emp_id'] for r in rows if r['status'] == '미배정' and r['emp_id'] in P and P[r['emp_id']]['complaint']]
    first_ok = sum(1 for r in rows if r['reason_code'] == 'OK')
    valid_n = sum(1 for p in people if not p['invalid'])
    metrics = [
        ('유효 신청자', f'{valid_n}명'),
        ('배정 (1지망 / 대체)', f"{first_ok}명 / {sum(1 for r in rows if r['reason_code'] == 'ALT')}명"),
        ('미탑승 (INVALID 제외)', f'{mine}명  ← 1지망만: {base_v1}, 기준: {base_v2}'),
        ('지난달 만석 민원자 중 미탑승', f'{len(comp_left)}명'),
        ('버스별 탑승/정원', ', '.join(f'{b} {load.get(b, 0)}/{v["cap"]}' for b, v in net.buses.items())),
        ('채점 기준', '담당자 추가 요청 반영(--stage2)' if a.stage2 else '기본 (README + route_update.md)'),
    ]
    rep.print(metrics)


if __name__ == '__main__':
    main()
