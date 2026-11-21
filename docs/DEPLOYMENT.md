# 운영 배포 기록

- 배포일: 2026-11-04 (한국 시간)
- 운영 주소: https://litverse-fromjuly31.netlify.app
- 관리자 로그인: https://litverse-fromjuly31.netlify.app/admin
- Netlify 프로젝트: [litverse-fromjuly31](https://app.netlify.com/projects/litverse-fromjuly31)
- 프로젝트 ID: `afdad674-ad5b-46be-bd9c-ba00de06afbf`
- 최초 운영 배포 ID: `6aea89a4c7449e79ae2f9f38`
- Supabase 프로젝트: `undfovtwlmlzbmjyjqfa` / 서울

Vite 운영 빌드와 Netlify Functions `api`, `cleanup`을 배포했습니다. API는 `/api/*`에 연결되며 정리 함수는 매시간 15분에 실행됩니다. SPA 경로는 `netlify.toml`의 fallback을 사용합니다. GitHub 저장소 자동 배포는 연결하지 않았습니다.

## 환경변수

Netlify production 환경에서 `VITE_APP_MODE=live`, `VITE_ROUTER_MODE=history`를 사용합니다. 공개 사이트 주소와 API의 `SITE_URL`은 운영 HTTPS 주소로 설정했습니다. 공개 Supabase 키는 브라우저용이며, 서버 Supabase 키와 `TOKEN_SECRET`은 Netlify secret으로 등록했습니다. 관리자 비밀번호 파일은 업로드하지 않았습니다.

현재 Free 요금제는 환경변수의 세부 scope 제한을 제공하지 않습니다. 비밀값은 builds/functions/runtime에 전달되지만 브라우저가 읽는 `VITE_` 변수에 포함하지 않습니다. 정적 빌드에서 서버 키, QR 서명 비밀값, 관리자 비밀번호가 검출되지 않음을 확인했습니다.

로컬 `.env.production`에는 운영 빌드용 공개 주소 설정만 저장합니다. `.env`, `.env.production`, `.env.admin`, `.netlify/`는 Git에서 제외됩니다. `TOKEN_SECRET`은 기존 QR과 제출 코드 검증에 필요하므로 교체하지 않습니다.

OpenAI API 키는 설정하지 않았습니다. AI 자동 생성은 서버 키를 별도로 설정한 후 사용할 수 있으며 학생 AI 호출은 비활성화 상태입니다.

## 확인한 동작

- HTTPS `/`, `/teacher`, `/admin`, `/exhibition`: HTTP 200 및 HTML 응답.
- `/api/public/list`, `/api/public/exhibits`, `/api/admin/session`: HTTP 200 및 JSON 응답.
- 로그인하지 않은 `/api/teacher/list`: HTTP 401.
- 실제 Edge 브라우저에서 관리자 비밀번호 로그인과 로그아웃 성공.
- 390×844 모바일 화면의 가로 넘침 없음, 브라우저 JavaScript 오류 없음.
- Supabase 테이블 17개·전시 뷰 조회와 비공개 이미지 버킷 설정 확인.
- `api`, `cleanup` 서버 함수와 `15 * * * *` 정리 스케줄 등록 확인.

테스트 화면은 로컬 `test-results/live-home.png`, `live-admin.png`, `live-mobile.png`에 저장합니다. 실제 학생 파일 업로드, 다중 기기 동시 참여, AI 유료 호출은 이 배포 확인에 포함하지 않았습니다.

## 재배포

이 PC는 Netlify 계정에 로그인하고 위 프로젝트에 연결한 상태입니다.

```sh
npm run check:supabase
npx --yes netlify-cli@27.16.2 deploy --prod --context production
```

PowerShell에서 실행 정책 오류가 나면 `npm.cmd`, `npx.cmd`를 사용합니다. 배포 명령이 Vite 빌드와 함수 패키징을 수행합니다. 새 PC에서는 `netlify login`과 `netlify link`로 위 프로젝트에 연결하고 production 환경변수를 확인합니다. 단일 `release/index.html` 또는 `github-pages/`를 운영 사이트에 올리면 데모가 되므로 사용하지 않습니다.
