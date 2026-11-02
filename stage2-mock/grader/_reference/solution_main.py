"""모범 답안 서버 (연습을 마친 뒤 비교용).

작업 폴더에서:  python <키트>/grader/_reference/solution_main.py [--mode v0|v1|v2] [--no-serve]
→ output/assignments.csv 생성 후 http://localhost:8000 에서 조회 화면·API 제공
"""
import argparse, csv, html, json, os, sys
from collections import Counter
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model  # noqa: E402

COLUMNS = ['emp_id', 'status', 'route_id', 'bus_id', 'board_stop', 'board_time', 'seat_no', 'reason_code', 'alternative']

PAGE = """<!doctype html><meta charset="utf-8"><title>내 통근버스</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px}input,button{font-size:16px;padding:8px}
dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px}dt{color:#666}.no{color:#b23a2c}</style>
<h1>내 통근버스 조회</h1><form onsubmit="go(event)"><input id="e" placeholder="사번 (예: E1001)"> <button>조회</button></form><div id="r"></div>
<script>
async function go(ev){ev.preventDefault();const id=document.getElementById('e').value.trim();
const r=await fetch('/api/assignment?emp_id='+encodeURIComponent(id));const box=document.getElementById('r');
if(r.status===404){box.innerHTML='<p class="no">신청 내역이 없는 사번입니다.</p>';return}
const j=await r.json();const t=(k,v)=>`<dt>${k}</dt><dd>${v||'-'}</dd>`;
box.innerHTML=j.status==='배정'?`<dl>${t('노선',j.route_name)}${t('버스',j.bus_id)}${t('탑승 정류장',j.board_stop_name)}${t('탑승 시각',j.board_time)}${t('좌석',j.seat_no+'번')}${j.reason_code==='ALT'?t('안내',j.alternative):''}</dl>`
:`<p class="no">배정되지 않았습니다 (${j.reason_code}).</p><p>${j.alternative}</p>`}
</script>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', default='v2')
    ap.add_argument('--no-serve', action='store_true')
    ap.add_argument('--port', type=int, default=8000)
    a = ap.parse_args()
    data = os.path.join(os.getcwd(), 'data')
    net, _, rows = model.solve(data, a.mode)
    os.makedirs('output', exist_ok=True)
    with open('output/assignments.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS); w.writeheader(); w.writerows(rows)
    print(f'output/assignments.csv {len(rows)}줄 ({a.mode})')
    if a.no_serve:
        return
    by = {r['emp_id']: r for r in rows}
    load = Counter(r['bus_id'] for r in rows if r['bus_id'])

    class H(BaseHTTPRequestHandler):
        def send(self, code, body, ctype='application/json; charset=utf-8'):
            b = body.encode('utf-8'); self.send_response(code)
            self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == '/':
                return self.send(200, PAGE, 'text/html; charset=utf-8')
            if u.path == '/api/assignment':
                eid = parse_qs(u.query).get('emp_id', [''])[0].strip()
                r = by.get(eid)
                if not r:
                    return self.send(404, json.dumps({'error': '신청 내역이 없는 사번'}, ensure_ascii=False))
                j = dict(r)
                j['route_name'] = net.routes[r['route_id']]['name'] if r['route_id'] else ''
                j['board_stop_name'] = net.stops[r['board_stop']]['stop_name'] if r['board_stop'] else ''
                return self.send(200, json.dumps(j, ensure_ascii=False))
            if u.path == '/api/summary':
                return self.send(200, json.dumps([{'bus_id': b, 'route_id': v['route'], 'shift': v['shift'], 'assigned': load.get(b, 0), 'capacity': v['cap']}
                                                  for b, v in net.buses.items()], ensure_ascii=False))
            self.send(404, '{}')

        def log_message(self, *args):
            pass

    print(f'http://localhost:{a.port}')
    HTTPServer(('127.0.0.1', a.port), H).serve_forever()


if __name__ == '__main__':
    main()
