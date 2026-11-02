"""모의 시험 데이터 생성기. 같은 시드면 같은 exam/data가 나온다.

    python tools/make_data.py            # 기본 데이터 (시드 20261102)
    python tools/make_data.py 7          # 다른 시드로 새 데이터 (두 번째 연습용)
"""
import csv, random, os, sys
from datetime import datetime, timedelta

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 20261102)
OUT = os.path.join(os.path.dirname(__file__), '..', 'exam', 'data')

STOPS = [
    ('S01', '시청', 10.0, 10.0), ('S02', '터미널', 5.8, 9.0), ('S03', '법원', 7.4, 8.9),
    ('S04', '용암동', 14.0, 6.0), ('S05', '금천동', 13.0, 7.5), ('S06', '율량동', 11.0, 13.0),
    ('S07', '오창', 8.0, 18.0), ('S08', '오송역', 2.0, 7.0), ('S09', '가경동', 5.0, 10.0),
    ('S10', '복대동', 6.0, 8.0), ('S11', '산남동', 9.2, 6.3), ('S12', '분평동', 12.5, 5.0),
    ('S13', '봉명동', 6.5, 6.5), ('S14', '사창사거리', 8.0, 7.5), ('S15', '내덕동', 10.5, 11.6),
    ('S16', '강서동', 4.0, 6.0),
]
# 개편 전 노선. 구간 소요(분)는 다음 정류장까지, 마지막 값은 캠퍼스까지
ROUTES = [
    ('R1', '동부선', ['S04', 'S05', 'S12', 'S11'], [7, 8, 6, 12]),
    ('R2', '중앙선', ['S01', 'S03', 'S14', 'S13'], [5, 6, 7, 14]),
    ('R3', '서부선', ['S09', 'S02', 'S10', 'S16'], [6, 7, 9, 13]),
    ('R4', '북부선', ['S06', 'S15', 'S07'], [6, 18, 20]),
    ('R5', '오송선', ['S08', 'S16'], [10, 13]),
]
BUSES = [
    ('B-R1-D', 'R1', '주간', 28, '08:10'), ('B-R2-D', 'R2', '주간', 45, '08:10'),
    ('B-R3-D', 'R3', '주간', 45, '08:10'), ('B-R4-D', 'R4', '주간', 28, '08:10'),
    ('B-R5-D', 'R5', '주간', 28, '08:10'),
    ('B-R1-A', 'R1', 'A조', 28, '05:40'), ('B-R2-A', 'R2', 'A조', 28, '05:40'),
    ('B-R3-A', 'R3', 'A조', 45, '05:40'), ('B-R4-A', 'R4', 'A조', 28, '05:40'),
    ('B-R2-B', 'R2', 'B조', 28, '13:40'), ('B-R3-B', 'R3', 'B조', 28, '13:40'),
    ('B-R2-C', 'R2', 'C조', 28, '21:40'), ('B-R3-C', 'R3', 'C조', 28, '21:40'),
]
SHIFTS = [('주간', '08:30'), ('A조', '06:00'), ('B조', '14:00'), ('C조', '22:00')]

SUR = list('김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노하곽성차주우구민유나진지엄채원천방공현함변염여추도소석선설마길연위표명')
GIV = ['민준','서연','도윤','지우','하준','서윤','시우','하은','주원','지민','예준','수아','지호','지유','준서','채원','건우','소율','현우','다은','우진','예린','선우','가은','연우','시은','유찬','민서','정우','윤서','승현','하린','지환','수빈','태윤','나연','은호','유나','재윤','서진','민재','예은','한결','다인','지훈','소희','성민','지안','동현','채은','상우','아린','준혁','수민','태민','혜원','진우','보람','경민','세아']
DEPTS = ['메모리설계', '공정기술', '품질보증', '설비기술', '제조1팀', '제조2팀', '구매', '인사', '재무', 'IT운영']

# 거주 정류장 분포: 개편 후 R2(율량·내덕·시청 등)로 수요가 몰리게
HOME_W = {'S01': 9, 'S02': 7, 'S03': 8, 'S04': 7, 'S05': 7, 'S06': 10, 'S07': 5, 'S08': 4,
          'S09': 7, 'S10': 6, 'S11': 6, 'S12': 6, 'S13': 7, 'S14': 8, 'S15': 10, 'S16': 5}
ROUTE_OF = {}
for rid, _, stops, _ in ROUTES:
    for s in stops:
        ROUTE_OF.setdefault(s, []).append(rid)

def wpick(d):
    keys = list(d); x = random.random() * sum(d.values())
    for k in keys:
        x -= d[k]
        if x < 0: return k
    return keys[-1]

names = set()
emps = []
for i in range(280):
    while True:
        n = random.choice(SUR) + random.choice(GIV)
        if n not in names: names.add(n); break
    shift = wpick({'주간': 60, 'A조': 22, 'B조': 9, 'C조': 9})
    emps.append({
        'emp_id': f'E{1001 + i}', 'name': n, 'dept': random.choice(DEPTS), 'shift': shift,
        'home_stop': wpick(HOME_W), 'mobility': 'Y' if random.random() < 0.05 else 'N',
        'join_date': (datetime(2015, 1, 1) + timedelta(days=random.randint(0, 4000))).strftime('%Y-%m-%d'),
    })

apps = []
t0 = datetime(2026, 10, 20, 9, 0)
applicants = random.sample(emps, 252)
for e in applicants:
    home = e['home_stop']
    first = random.choice(ROUTE_OF[home])
    board = home
    r = random.random()
    if r < 0.02:  # 신청서 실수: 정류장을 안 지나는 노선을 1지망으로
        first = random.choice([x for x in ['R1', 'R2', 'R3', 'R5'] if x not in ROUTE_OF[home]])
    second = ''
    if random.random() < 0.6:
        cands = [x for x in ['R1', 'R2', 'R3', 'R5'] if x != first]
        second = random.choice(cands)
    apps.append({'emp_id': e['emp_id'], 'applied_at': t0 + timedelta(minutes=random.randint(0, 7 * 24 * 60)),
                 'route_1st': first, 'route_2nd': second, 'board_stop': board, 'memo': ''})

MEMOS = ['', '', '', '', '', '', '앞자리 희망', '허리 수술 후 회복 중', '임신 20주', '창가 희망', '퇴근 버스도 필요해요']
for a in apps:
    a['memo'] = random.choice(MEMOS)
# 중복 신청 3건: 나중 신청이 유효
for a in random.sample(apps, 3):
    b = dict(a)
    b['applied_at'] = a['applied_at'] + timedelta(hours=random.randint(5, 40))
    opts = [x for x in ROUTE_OF[a['board_stop']] if x != a['route_1st']] or ROUTE_OF[a['board_stop']]
    b['route_1st'] = random.choice(opts); b['route_2nd'] = ''
    b['memo'] = '수정 신청'
    apps.append(b)
# 오류 신청: 없는 사번 2건, 없는 노선 1건
apps.append({'emp_id': 'E9012', 'applied_at': t0 + timedelta(hours=30), 'route_1st': 'R2', 'route_2nd': '', 'board_stop': 'S01', 'memo': ''})
apps.append({'emp_id': 'E9047', 'applied_at': t0 + timedelta(hours=51), 'route_1st': 'R3', 'route_2nd': 'R5', 'board_stop': 'S16', 'memo': '파견직'})
x = random.choice(apps[:200]); apps.append({'emp_id': x['emp_id'], 'applied_at': x['applied_at'] + timedelta(hours=3), 'route_1st': 'R7', 'route_2nd': '', 'board_stop': x['board_stop'], 'memo': '오기재'})
apps.sort(key=lambda a: a['applied_at'])

# 지난달 민원: '만석 미탑승'만 우선순위 대상, 나머지는 잡음
complaints = []
pool = [a['emp_id'] for a in apps if a['emp_id'].startswith('E1')]
for eid in random.sample(pool, 22):
    complaints.append((eid, '2026-10-' + f'{random.randint(1, 31):02d}', '만석 미탑승', random.choice(['버스가 만석이라 못 탔음', '정류장에서 탑승 거부', '두 번이나 못 탐'])))
for eid in random.sample(pool, 14):
    complaints.append((eid, '2026-10-' + f'{random.randint(1, 31):02d}', random.choice(['도착 시간 이름', '정류장 위치 불편', '냉방 불량', '기사 불친절']), '개선 요청'))
complaints.sort(key=lambda c: c[1])

os.makedirs(OUT, exist_ok=True)
def w(name, header, rows):
    with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8') as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(rows)
w('stops.csv', ['stop_id', 'stop_name', 'x_km', 'y_km'], STOPS)
w('routes.csv', ['route_id', 'route_name', 'stop_order', 'minutes_to_next'],
  [(r, n, '|'.join(s), '|'.join(map(str, m))) for r, n, s, m in ROUTES])
w('buses.csv', ['bus_id', 'route_id', 'shift', 'capacity', 'campus_arrival'], BUSES)
w('shifts.csv', ['shift', 'work_start'], SHIFTS)
w('employees.csv', ['emp_id', 'name', 'dept', 'shift', 'home_stop', 'mobility', 'join_date'],
  [[e[k] for k in ['emp_id', 'name', 'dept', 'shift', 'home_stop', 'mobility', 'join_date']] for e in emps])
w('applications.csv', ['app_no', 'emp_id', 'applied_at', 'route_1st', 'route_2nd', 'board_stop', 'memo'],
  [[i + 1, a['emp_id'], a['applied_at'].strftime('%Y-%m-%d %H:%M'), a['route_1st'], a['route_2nd'], a['board_stop'], a['memo']] for i, a in enumerate(apps)])
w('complaints.csv', ['emp_id', 'date', 'type', 'detail'], complaints)
print('apps', len(apps), 'emps', len(emps))
