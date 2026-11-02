"""정답 모델: 노선 개편 반영, 신청서 정리, 우선순위, 배정 라운드.
grade.py가 이 모듈로 기준값을 계산한다. 연습을 마친 뒤에 읽으세요."""
import csv, math, os
from collections import defaultdict

SHIFT_ORDER = ['주간', 'A조', 'B조', 'C조']
ALT_RADIUS_KM = 2.0
FAIL_REASONS = {'FULL', 'NO_SHIFT_BUS', 'STOP_NOT_ON_ROUTE', 'INVALID'}
OK_REASONS = {'OK', 'ALT'}

ALT_TEXT = {
    'FULL': '대기자로 등록됨(취소석 발생 시 우선 배정). 자차 통근 지원금 신청 가능',
    'NO_SHIFT_BUS': '해당 근무조 버스 없음. 2km 이내 다른 노선도 없음. 자차 통근 지원금 신청 가능',
    'STOP_NOT_ON_ROUTE': '신청 노선이 탑승 정류장을 지나지 않음. 정류장을 지나는 노선으로 재신청 필요',
    'INVALID': '신청서 오류(사번 또는 노선 확인 불가). 총무팀에 재신청',
}


def read(data_dir, name):
    with open(os.path.join(data_dir, name), encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def hm(s):
    h, m = s.split(':'); return int(h) * 60 + int(m)


def fmt(mins):
    return f'{mins // 60:02d}:{mins % 60:02d}'


class Network:
    """개편(route_update.md) 반영 후 노선망."""

    def __init__(self, data_dir, capacity_override=None):
        self.stops = {r['stop_id']: r for r in read(data_dir, 'stops.csv')}
        routes = {}
        for r in read(data_dir, 'routes.csv'):
            routes[r['route_id']] = {'name': r['route_name'], 'stops': r['stop_order'].split('|'),
                                     'mins': [int(x) for x in r['minutes_to_next'].split('|')]}
        # 개편: R4 폐지, R2·R5 기점 연장
        routes.pop('R4', None)
        routes['R2']['stops'] = ['S06', 'S15'] + routes['R2']['stops']
        routes['R2']['mins'] = [6, 7] + routes['R2']['mins']
        routes['R5']['stops'] = ['S07'] + routes['R5']['stops']
        routes['R5']['mins'] = [22] + routes['R5']['mins']
        self.routes = routes
        self.buses = {}
        for b in read(data_dir, 'buses.csv'):
            if b['route_id'] not in routes:
                continue
            cap = int(b['capacity'])
            if b['bus_id'] == 'B-R3-A':
                cap = 28
            if capacity_override and b['bus_id'] in capacity_override:
                cap = capacity_override[b['bus_id']]
            self.buses[b['bus_id']] = {'route': b['route_id'], 'shift': b['shift'], 'cap': cap, 'arrive': hm(b['campus_arrival'])}

    def bus_for(self, route, shift):
        for bid, b in self.buses.items():
            if b['route'] == route and b['shift'] == shift:
                return bid
        return None

    def on_route(self, route, stop):
        return route in self.routes and stop in self.routes[route]['stops']

    def board_time(self, bus_id, stop):
        b = self.buses[bus_id]; r = self.routes[b['route']]
        i = r['stops'].index(stop)
        return fmt(b['arrive'] - sum(r['mins'][i:]))

    def dist(self, a, b):
        sa, sb = self.stops[a], self.stops[b]
        return math.hypot(float(sa['x_km']) - float(sb['x_km']), float(sa['y_km']) - float(sb['y_km']))


R4_TRANSFER = {'S06': 'R2', 'S15': 'R2', 'S07': 'R5'}


def load_applicants(data_dir, net):
    emps = {e['emp_id']: e for e in read(data_dir, 'employees.csv')}
    full = {c['emp_id'] for c in read(data_dir, 'complaints.csv') if c['type'] == '만석 미탑승'}
    latest = {}
    for a in read(data_dir, 'applications.csv'):
        cur = latest.get(a['emp_id'])
        if cur is None or (a['applied_at'], int(a['app_no'])) > (cur['applied_at'], int(cur['app_no'])):
            latest[a['emp_id']] = a
    out = []
    for eid, a in latest.items():
        e = emps.get(eid)
        r1 = a['route_1st'].strip(); r2 = a['route_2nd'].strip()
        if r1 == 'R4':
            r1 = R4_TRANSFER.get(a['board_stop'], r1)
        if r2 == 'R4':
            r2 = R4_TRANSFER.get(a['board_stop'], '')
        invalid = e is None or r1 not in net.routes
        out.append({
            'emp_id': eid, 'emp': e, 'app': a, 'r1': r1, 'r2': r2 if r2 in net.routes else '',
            'stop': a['board_stop'], 'home': e['home_stop'] if e else a['board_stop'],
            'shift': e['shift'] if e else '', 'mobility': bool(e and e['mobility'] == 'Y'),
            'complaint': eid in full, 'invalid': invalid,
            'key': (0 if e and e['mobility'] == 'Y' else 1, 0 if eid in full else 1, a['applied_at'], eid),
        })
    out.sort(key=lambda p: p['key'])
    return out


def solve(data_dir, mode='v2', capacity_override=None):
    """mode: v0(정원 무시) / v1(1지망 + 정원·우선순위) / v2(+2지망, 2km 대체)"""
    net = Network(data_dir, capacity_override)
    people = load_applicants(data_dir, net)
    load = defaultdict(int)
    res = {}
    pending = []
    for p in people:
        if p['invalid']:
            res[p['emp_id']] = {'status': '미배정', 'reason': 'INVALID'}; continue
        bus = net.bus_for(p['r1'], p['shift'])
        if bus is None:
            reason = 'NO_SHIFT_BUS'
        elif not net.on_route(p['r1'], p['stop']):
            reason = 'STOP_NOT_ON_ROUTE'
        elif mode == 'v0' or load[bus] < net.buses[bus]['cap']:
            load[bus] += 1
            res[p['emp_id']] = {'status': '배정', 'reason': 'OK', 'bus': bus, 'stop': p['stop']}; continue
        else:
            reason = 'FULL'
        res[p['emp_id']] = {'status': '미배정', 'reason': reason}
        pending.append(p)
    if mode == 'v2':
        still = []
        for p in pending:  # 2지망 라운드
            ok = False
            bus = net.bus_for(p['r2'], p['shift']) if p['r2'] else None
            if bus and load[bus] < net.buses[bus]['cap']:
                stops = net.routes[p['r2']]['stops']
                if p['stop'] in stops:
                    stop = p['stop']
                else:
                    near = sorted((net.dist(p['home'], s), i, s) for i, s in enumerate(stops) if net.dist(p['home'], s) <= ALT_RADIUS_KM)
                    stop = near[0][2] if near else None
                if stop:
                    load[bus] += 1; ok = True
                    res[p['emp_id']] = {'status': '배정', 'reason': 'ALT', 'bus': bus, 'stop': stop}
            if not ok:
                still.append(p)
        for p in still:  # 2km 대체 라운드
            cands = []
            for bid, b in net.buses.items():
                if b['shift'] != p['shift'] or load[bid] >= b['cap']:
                    continue
                for s in net.routes[b['route']]['stops']:
                    d = net.dist(p['home'], s)
                    if d <= ALT_RADIUS_KM:
                        cands.append((d, b['route'], bid, s))
            if cands:
                d, _, bid, s = min(cands)
                load[bid] += 1
                res[p['emp_id']] = {'status': '배정', 'reason': 'ALT', 'bus': bid, 'stop': s}
    # 좌석: 교통약자 1~4번 우선, 일반은 5번부터, 남으면 1~4번
    riders = defaultdict(list)
    for p in people:
        r = res[p['emp_id']]
        if r['status'] == '배정':
            riders[r['bus']].append(p)
    for bid, ps in riders.items():
        cap = net.buses[bid]['cap']
        mob = [p for p in ps if p['mobility']]; gen = [p for p in ps if not p['mobility']]
        free_front = list(range(1, 5)); free_back = list(range(5, max(cap, len(ps)) + 1))  # v0는 정원 초과 가능
        for p in mob:
            res[p['emp_id']]['seat'] = (free_front or free_back).pop(0)
        for p in gen:
            res[p['emp_id']]['seat'] = (free_back or free_front).pop(0)
    rows = []
    for p in people:
        r = res[p['emp_id']]
        if r['status'] == '배정':
            b = net.buses[r['bus']]
            rows.append({'emp_id': p['emp_id'], 'status': '배정', 'route_id': b['route'], 'bus_id': r['bus'],
                         'board_stop': r['stop'], 'board_time': net.board_time(r['bus'], r['stop']), 'seat_no': r['seat'],
                         'reason_code': r['reason'], 'alternative': '' if r['reason'] == 'OK' else '1지망 만석 또는 불가로 대체 배정'})
        else:
            rows.append({'emp_id': p['emp_id'], 'status': '미배정', 'route_id': '', 'bus_id': '', 'board_stop': '',
                         'board_time': '', 'seat_no': '', 'reason_code': r['reason'], 'alternative': ALT_TEXT[r['reason']]})
    return net, people, rows
