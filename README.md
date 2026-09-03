# FE Support Archive

파이어 엠블렘 각성과 if의 한국어 지원회화를 캐릭터 조합별로 감상하는 정적 웹 아카이브입니다.

## 구조

- 이 저장소는 웹 UI, 안전한 스크립트 파서, 정적 데이터 생성기만 관리합니다.
- 원본 대사와 각성 초상화는 [`poketony/FE-Awakening`](https://github.com/poketony/FE-Awakening)에서 읽습니다.
- if 초상화는 [`SciresM/FEITS`](https://github.com/SciresM/FEITS)의 리소스를 빌드 시 읽습니다.
- 생성 결과는 게임/종류/캐릭터 조합별 JSON으로 나뉘므로 GitHub Pages에서 필요한 회화만 불러옵니다.

현재 분류:

- 각성 본편 지원회화
- 각성 DLC: 인연의 여름, 인연의 비밀 온천, 인연의 수확제
- if 본편 지원회화
- if DLC: 인연의 백야제, 인연의 암야제

## 로컬 실행

Node.js 20 이상이 필요합니다. 이 저장소와 `FE-Awakening`을 같은 상위 폴더에 둔 경우:

```powershell
npm run build:data
npm test
npm run verify
npm run serve
```

if 초상화까지 생성하려면 FEITS 체크아웃 경로를 지정합니다.

```powershell
node scripts/build-data.mjs --source ../FE-Awakening --feits ../FEITS --output .
```

로컬 주소는 `http://127.0.0.1:4173/`입니다.

## GitHub Pages

`main` 브랜치에 푸시하면 `.github/workflows/pages.yml`이 두 원본 저장소를 함께 체크아웃하고 `dist`를 생성·검증한 뒤 GitHub Pages에 배포합니다. 저장소의 Pages 설정에서 Source를 **GitHub Actions**로 선택해야 합니다.

프로젝트 사이트 주소는 보통 다음과 같습니다.

```text
https://poketony.github.io/FE-Support-Archive/
```

## 파서 호환성

- `$KrP1|`~`$KrP6|`는 한국판 고정 조사 fallback으로 처리합니다.
- `$Ws`, `$E`, `$Nu`, `$G`, `$k`, `$p`, `\\n`을 감상 화면 상태에 반영합니다.
- 출력되지 않는 연출 명령은 제거합니다.
- 알 수 없는 `$` 명령도 최소 한 글자 이상 소비하여 파서가 멈추지 않습니다.

## 주의

비공식 팬 프로젝트입니다. 게임명, 로고, 대사와 초상화의 권리는 각 권리자에게 있습니다. 공개 배포 전 원본 번역과 게임 리소스의 재배포 범위를 다시 확인하세요.
