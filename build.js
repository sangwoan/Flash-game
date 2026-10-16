// src/ 의 shell.html에 생성기와 앱 스크립트를 넣어 index.html 한 파일로 만든다.
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const out = src('shell.html')
  .replace('/*__GEN__*/', () => src('generators.js'))
  .replace('/*__APP__*/', () => src('app.js'));
fs.writeFileSync(path.join(__dirname, 'index.html'), out);
console.log('index.html', (out.length / 1024).toFixed(1) + ' KB');
