# Brickmaster 앱 (Expo)

`brickmaster/`의 웹 게임을 그대로 WebView에 띄우는 Expo 앱. Expo SDK 58.

- 게임 코드: `game-html.js` (자동 생성. `node brickmaster/build.js`가 만든다. 직접 고치지 않는다)
- 앱 코드: `App.js`
  - 저장 데이터를 기기 저장소(AsyncStorage)에도 보관해서, 앱을 지웠다 깔지 않는 한 기록이 유지된다
  - 게임의 진동을 기기 햅틱(expo-haptics)으로 바꿔 iPhone에서도 손맛이 난다
- 글꼴은 Google Fonts에서 받으므로 처음 실행할 때 인터넷이 필요하다
- 무한 모드 주간 랭킹은 claude.ai 아티팩트의 공유 저장소를 쓰므로 앱에서는 동작하지 않는다(내 최고 점수만 저장). 앱 출시 전에 랭킹 서버(예: Firebase, Supabase)와 점수 검증이 필요하다

## Expo Go에서 실행하기

Expo Go는 GitHub에서 코드를 직접 가져오지 못한다. 코드를 내보내 주는 쪽이 필요하고, 방법은 둘이다.

### A. 컴퓨터에서 개발 서버 띄우기 (가장 확실함)

준비물: 컴퓨터에 [Node.js](https://nodejs.org) LTS와 Git, 휴대폰에 Expo Go(SDK 58 지원 최신 버전).

```bash
git clone https://github.com/sangwoan/flash-game.git
cd flash-game
git checkout ccr-7eb1737f-i1lcyc        # main에 합치기 전까지는 이 브랜치
cd brickmaster-app
npm install
npm run phone                           # 터널 모드: 휴대폰과 컴퓨터가 다른 네트워크여도 됨
```

터미널에 QR 코드가 뜨면 휴대폰으로 찍는다.
- Android: Expo Go 앱 안의 "Scan QR code"
- iPhone: 기본 카메라 앱으로 찍으면 Expo Go가 열린다

같은 와이파이라면 `npx expo start`(터널 없이)가 더 빠르다. 컴퓨터의 터미널을 닫으면 앱 연결도 끊긴다.

이 QR은 개발 서버가 돌고 있는 컴퓨터의 주소라서, 컴퓨터마다·실행할 때마다 새로 생긴다. 클라우드 세션에서는 외부 접속을 받을 수 없어 대신 만들어 줄 수 없다.

### B. 컴퓨터 없이 휴대폰만으로 열기 (EAS Update, 처음 한 번 설정)

처음 한 번은 컴퓨터에서 Expo 계정으로 로그인해 프로젝트를 연결해야 한다.

```bash
cd brickmaster-app
npx eas-cli login
npx eas-cli init                 # expo.dev에 프로젝트 생성, app.json에 projectId 기록
npx eas-cli update:configure     # 업데이트 설정 추가
npx eas-cli update --branch preview --message "Brickmaster"
```

끝나면 expo.dev의 해당 업데이트 페이지에 QR 코드가 생기고, 이 QR을 Expo Go로 열 수 있다. 이 방식은 Expo 계정이 필요해서 여기서는 직접 확인하지 못했다.

## 게임을 고친 뒤

```bash
node brickmaster/build.js     # brickmaster/index.html 과 brickmaster-app/game-html.js 를 함께 갱신
```

개발 서버가 켜져 있으면 앱이 자동으로 새로고침된다.
