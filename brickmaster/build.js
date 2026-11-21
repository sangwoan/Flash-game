// src/shell.html 에 src/js/*.js 를 파일명 순서대로 이어 붙여 index.html 한 파일로 만든다.
// index.html 은 아티팩트로 그대로 게시하는 결과물이라 직접 고치지 않는다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
const js = fs.readdirSync(path.join(src, 'js'))
  .filter(f => f.endsWith('.js'))
  .sort()
  .map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(src, 'js', f), 'utf8'))
  .join('\n');
const out = fs.readFileSync(path.join(src, 'shell.html'), 'utf8').replace('/*__JS__*/', () => js);
fs.writeFileSync(path.join(__dirname, 'index.html'), out);
console.log('brickmaster/index.html', (out.length / 1024).toFixed(1) + ' KB');
