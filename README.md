# FE Support Archive

파이어 엠블렘 각성과 if의 한국어 지원회화를 캐릭터 조합별로 감상하는 정적 웹 아카이브입니다.

## 구조

- 이 저장소는 웹 UI, Canvas 렌더러, 안전한 스크립트 파서, 정적 데이터 생성기를 관리합니다.
- 원본 대사와 각성 초상화는 [`poketony/FE-Awakening`](https://github.com/poketony/FE-Awakening)에서 읽습니다.
- if 초상화는 [`SciresM/FEITS`](https://github.com/SciresM/FEITS)의 리소스를 빌드 시 읽습니다.
- 생성 결과는 게임/종류/캐릭터 조합별 JSON으로 나뉘므로 GitHub Pages에서 필요한 회화만 불러옵니다.

현재 분류:

- 각성 본편 지원회화
- 각성 DLC: 인연의 여름, 인연의 비밀 온천, 인연의 수확제
- if 본편 지원회화
- if DLC: 인연의 백야제, 인연의 암야제

## 로컬 실행

Node.js 20 이상이 필요합니다. 원본 저장소를 `../FE13-Messages`, FEITS를 `../FEITS`에 체크아웃한 경우:

```powershell
npm run build:data
npm test
npm run verify
npm run serve
```

실제 게임 렌더링에 필요한 FEITS 체크아웃 경로를 지정합니다. 이제 두 원본 저장소가 모두 필요합니다.

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

- 기본 감상 화면은 400×240 Canvas입니다. 배경, 좌우 입상, 표정, 별도 머리카락 레이어, 이름창, 대화창과 한국판 비트맵 글리프를 합성합니다.
- 화면 클릭 또는 좌우 방향키로 프레임을 넘깁니다. 전체 텍스트는 접힌 보조 보기로 유지합니다.
- 각성은 라이브 렌더러의 배치와 0x28 얼굴 레코드, if는 FEITS의 배치와 0x48 얼굴 레코드를 사용합니다.
- 주인공 외형은 성별별 기본 얼굴·머리 모양을 사용합니다. 외형 세부 편집, 음성 및 시간 기반 애니메이션은 지원하지 않습니다.
- 없는 표정은 같은 인물의 기본 표정으로 대체합니다. 원본에 인물 이미지 자체가 없는 일부 대사는 텍스트 보기로 확인할 수 있습니다.

- `$KrP1|`~`$KrP6|`는 한국판 고정 조사 fallback으로 처리합니다.
- `$Ws`, `$E`, `$Nu`, `$G`, `$k`, `$p`, `\\n`을 감상 화면 상태에 반영합니다.
- 출력되지 않는 연출 명령은 제거합니다.
- 알 수 없는 `$` 명령도 최소 한 글자 이상 소비하여 파서가 멈추지 않습니다.

## 주의

렌더러는 Awakening Live Renderer와 SciresM/FEITS에서 파생되었으며 GPL-3.0으로 배포합니다. 소스는 이 저장소에서 제공하며 [라이선스 전문](LICENSE.txt)을 포함합니다. 이 프로그램은 무보증입니다. 이 라이선스는 게임 리소스의 권리를 이전하지 않습니다.

비공식 팬 프로젝트입니다. 게임명, 로고, 대사와 초상화의 권리는 각 권리자에게 있습니다. 공개 배포 전 원본 번역과 게임 리소스의 재배포 범위를 다시 확인하세요.
