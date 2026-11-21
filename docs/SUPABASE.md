# Supabase 연결

- 프로젝트: [litverse](https://supabase.com/dashboard/project/undfovtwlmlzbmjyjqfa)
- 프로젝트 ID: `undfovtwlmlzbmjyjqfa`
- 리전: 서울 (`ap-northeast-2`)
- API URL: `https://undfovtwlmlzbmjyjqfa.supabase.co`
- 생성 시 확인한 기본 비용: 월 $0. 생성 후 사용량·요금제 변경에 따른 비용은 별도입니다.

## 로컬 실행

루트 `.env`에 프로젝트 URL, 공개 publishable 키, 서버 secret 키와 `TOKEN_SECRET`을 설정합니다. `.env.example`에 필요한 변수 목록이 있습니다. `.env`와 `.env.*`는 Git에서 제외됩니다.

```sh
npm run check:supabase
npm run dev:netlify
```

검증 명령은 공개 키 인증, 익명 테이블 접근 차단, 서버 키의 테이블 17개·전시 뷰 조회, 이미지 버킷의 비공개·5MB·파일 형식 제한, 첫 관리자 프로필 및 공개 회원가입 설정을 확인합니다. 실제 키와 수업 데이터는 출력하지 않습니다. 네트워크 또는 필수 설정에 문제가 있으면 종료 코드 1을 반환합니다.

서버 키 없이 공개 연결만 확인하려면 `npm run check:supabase -- --public-only`를 실행합니다. 이 옵션은 서버·저장소·관리자 설정 완료를 의미하지 않습니다.

`npm run dev`는 Vite 프론트엔드만 실행합니다. 실제 `/api/*`는 Netlify Dev가 실행해야 합니다. 콘솔에 표시되는 Netlify 주소로 접속합니다. PowerShell에서 npm 실행 정책 오류가 나면 `npm.cmd`를 사용합니다.

`release/index.html`과 `github-pages/`는 오프라인 데모입니다. `npm run build:pages`는 실제 연결 환경에서도 데모로 빌드합니다. 실서비스는 `npm run build`로 생성한 `dist/`와 `netlify/functions/`를 함께 배포해야 합니다.

## 관리자 및 Auth

1. [Authentication 설정](https://supabase.com/dashboard/project/undfovtwlmlzbmjyjqfa/auth/providers)의 **Allow new users to sign up**을 끄고 저장합니다. 학생은 계정 없이 수업 QR과 제출 코드를 사용합니다.
2. 첫 관리자 등록 시 [Authentication > Users](https://supabase.com/dashboard/project/undfovtwlmlzbmjyjqfa/auth/users)에서 이메일·비밀번호 계정을 생성하고 이메일 확인을 완료합니다. 앱에는 공개 회원가입 화면이 없습니다.
3. 생성된 사용자 UUID를 사용해 SQL Editor에서 프로필을 등록합니다.

```sql
insert into public.teacher_profiles (id, email, is_admin)
values ('AUTH-사용자-UUID', '관리자-이메일', true);
```

서버는 `teacher_profiles.is_admin=true`인 계정만 관리자로 인정합니다. 첫 관리자가 있어야 공개 수업 생성 시 수업 소유자를 지정할 수 있습니다. 실제 앱의 `/admin`에서 로그인합니다. 비밀번호와 서버 키는 채팅·커밋·정적 HTML에 포함하지 않습니다.

현재 프로젝트에는 관리자 계정이 등록되어 있습니다. 로컬 검증용 로그인 정보는 Git에서 제외되는 루트 `.env.admin`에서 관리합니다. 공개 신규 가입은 비활성화되어 있습니다.

## 데이터베이스

새 데이터베이스에는 `supabase/migrations/`의 파일을 이름 순서대로 적용합니다. 기존 데이터베이스에는 아직 적용하지 않은 파일만 실행합니다. 사진 제출 질문, PDF 저장, 질문형 심화 수업에는 각각 `005_submission_questions.sql`, `006_text_study.sql`, `20261121015654_deepening_class_questions.sql`이 필요합니다.

테이블 17개 모두 RLS를 사용하며, 학생 자료 쓰기와 관리용 RPC는 서버 역할에만 허용됩니다. 서버 전용 5개 테이블의 정책 없음 알림은 클라이언트 접근을 전부 막기 위한 설정입니다. 이에 공개 접근 정책을 추가하지 않습니다. [Supabase RLS 정책 없음 알림 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

`literature-images` 버킷은 비공개이며 JPEG·PNG·WebP만 최대 5MB까지 저장합니다. 학생에게는 서버가 서명한 업로드 URL을 발급합니다. Realtime에는 수업, 활동지, 이미지, 배경 질문·응답, 심화 회차·응답 총 7개 테이블을 등록합니다.

연결 시 발견한 RLS 조회 성능 경고 3건과 외래 키 인덱스 알림 10건은 마지막 마이그레이션으로 해소했습니다. 새 프로젝트에서 아직 사용하지 않은 인덱스는 유지합니다. 실제 사용량이 쌓인 뒤 판단합니다. [미사용 인덱스 알림 설명](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## 웹 배포 시 설정

현재 운영 주소는 `https://litverse-fromjuly31.netlify.app`입니다. Netlify의 production 환경에 공개 연결 설정과 서버 비밀값을 등록했고 `VITE_APP_MODE=live`, `VITE_PUBLIC_SITE_URL`, `SITE_URL`을 설정했습니다. 서버 키와 `TOKEN_SECRET`은 secret으로 등록했으며 `VITE_` 변수에 포함하지 않습니다. 현재 무료 요금제는 세부 scope 제한을 지원하지 않아 비밀값은 builds/functions/runtime 범위에 적용됩니다. 실제 브라우저 번들에 비밀값이 포함되지 않음을 검사했습니다.

비밀번호 로그인에는 외부 리다이렉트가 필요하지 않습니다. 추후 이메일 인증·비밀번호 복구·OAuth를 추가할 때는 Supabase Auth의 Site URL과 Redirect URLs도 운영 주소로 설정합니다. [배포 기록](DEPLOYMENT.md)을 참고합니다.

`TOKEN_SECRET`을 바꾸면 기존 QR·학생 제출 코드가 무효화되므로 로컬과 운영 설정을 관리할 때 값을 보존합니다. 새 키 이름을 우선 사용하며 기존 `VITE_SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`도 호환됩니다. [Supabase API 키 문서](https://supabase.com/docs/guides/getting-started/api-keys)
