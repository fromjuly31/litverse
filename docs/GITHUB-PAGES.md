# HTML 파일과 GitHub Pages 배포

문학 전시관 구조를 담은 정적 HTML 버전입니다. 수업하기 → 비밀번호를 정해 수업 만들기 → 줄거리·배경·인물·사건 분석 → 최종 사진 두 장 선택 → 제작자 서명 → 완성 포스터 전시가 동작합니다. 관람하기에서는 액자 형태로 완성작을 감상합니다.

## 바로 열어볼 파일

- `release/index.html`: CSS, JavaScript, 예시 그림을 포함한 단일 HTML 파일입니다. 크롬이나 엣지에서 직접 열 수 있습니다. 외부 웹폰트가 차단되면 시스템 글꼴로 표시합니다.
- `github-pages/`: GitHub Pages에 배포할 완성본입니다. `index.html`, `assets/`, `art/`, `favicon.svg`, `.nojekyll`을 함께 올립니다.
- 프로젝트 루트의 `index.html`: 개발용 원본입니다. 직접 확인할 때는 `release/index.html`을 여세요.

배포판을 다시 만들려면 Node.js 24에서 실행합니다.

```sh
npm ci
npm run build:pages
```

HTTP로 배포판을 미리 보려면 `npm run preview:pages`를 실행하고 `http://127.0.0.1:4174/`을 엽니다.

## GitHub에서 수동 배포

현재는 GitHub에 코드만 보관합니다. 아래 배포 절차는 필요할 때 별도로 실행하며, 코드 푸시만으로는 배포되지 않습니다.

1. 이 프로젝트 소스를 GitHub 저장소의 `main` 브랜치에 올립니다. `.github/workflows/deploy-pages.yml`, `src`, `public`, `scripts`, `tests`, `package.json`, `package-lock.json`, `vite.config.js`, `playwright.pages.config.js`, 개발용 `index.html`을 포함합니다. `.env`, `node_modules`, 로컬 테스트 산출물은 올리지 않습니다.
2. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. **Actions → Deploy LITVERSE to GitHub Pages → Run workflow**를 실행합니다. 검사·빌드·배포는 이 수동 실행으로만 시작됩니다.
4. 성공한 배포 작업의 `github-pages` 환경 링크에서 사이트를 엽니다.

워크플로는 도메인·DB 검사와 정적 HTML 브라우저 검사를 통과한 뒤 배포합니다. GitHub에서 제공하는 작업 토큰을 사용하므로 별도 개인 토큰을 소스에 넣지 않습니다.

저장소 이름이나 사용자 이름을 코드에 넣지 않아도 됩니다. 상대 자산 경로와 `#/teacher/...` 형태의 화면 주소를 사용하므로 사용자 사이트와 `/저장소이름/` 아래의 프로젝트 사이트에서 모두 동작합니다. 수업별 화면에서 새로고침하거나 링크를 새 탭에서 열 수 있습니다.

설정 근거: [GitHub Pages 공식 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite 정적 배포 안내](https://vite.dev/guide/static-deploy).

## HTML 한 파일만 올리는 경우

완성된 화면만 배포하려면 `release/index.html`을 별도 저장소의 최상위 `index.html`로 올려도 됩니다. **Settings → Pages → Source → Deploy from a branch**에서 업로드한 브랜치와 **/(root)**를 선택합니다. 이 방식에는 소스 빌드 워크플로를 복사하지 않습니다.

이후 화면을 수정하면 원본 프로젝트에서 `npm run build:pages`를 다시 실행하고 새 `release/index.html`로 교체합니다.

## 저장 방식과 실제 수업 운영

HTML 배포판은 브라우저 저장소를 사용하는 데모 모드입니다. 수업과 입력 자료는 그 브라우저에서 유지되며 같은 브라우저의 탭끼리 동기화됩니다. 다른 컴퓨터나 학생 휴대폰과 공유되는 서버 데이터는 아닙니다. 파일 직접 열기, localhost, GitHub 주소의 저장소도 서로 다릅니다.

데모 비밀번호와 관리자 기능은 브라우저 안에서 동작 확인용으로 제공됩니다. 다른 사용자의 로컬 저장소를 보호하는 서버 보안이 아니며, 공유 전시관 DB도 아닙니다. 관리자 첫 방문에서 본인 비밀번호를 정하고, 기존 예시 수업은 처음 열 때 암호를 설정합니다.

줄거리 자동 입력은 데모에서 내장 예시임을 표시합니다. 실제 AI 호출은 서버 전용 API 키가 있어야 동작합니다. 최종 완료 시 이 브라우저에 저장된 다른 사진만 정리하며, 소스에 포함된 공용 예시 삽화 파일은 그대로 둡니다.

GitHub Pages는 정적 파일 호스팅이므로 이 프로젝트의 Netlify Functions를 실행하지 않습니다. 실제 비밀번호 접근 통제·관리자 인증·AI 줄거리 생성·여러 기기 공동 참여·공유 이미지 저장을 사용하려면 [README의 Supabase·Netlify 설정](../README.md#supabase-설정)을 완료하고 일반 `npm run build`로 배포합니다. 정적 HTML 빌드 명령은 의도적으로 데모 모드를 고정하며, 운영용 비밀 키는 포함하지 않습니다.

실제 GitHub 업로드와 배포에는 대상 저장소 및 해당 계정의 인증이 필요합니다. 배포 파일 생성만으로 GitHub에 게시되지는 않습니다.
