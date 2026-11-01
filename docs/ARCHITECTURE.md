# LITVERSE 구조

Vite + HTML + CSS + 기능별 ES Modules로 화면을 구성한다. 학생 화면은 읽기와 글쓰기에 집중하는 단일 컬럼, 교사 화면은 전시관의 상단 메뉴와 넓은 작품 영역을 사용한다. 화면 너비에 따라 교사 탐색은 모바일 하단 탐색으로 전환한다. 밝은 종이색 배경, 명조 제목과 산세리프 본문, 원본 비율을 유지하는 작품 여백을 공통 디자인으로 사용한다. 모든 선택 메뉴는 공통 커스텀 listbox, 확인·상세·QR 창은 포커스를 관리하는 공통 모달을 사용한다.

## 데이터와 인증

실서비스는 Supabase Auth의 사전 등록 교사만 로그인한다. Netlify Functions가 액세스 토큰과 활동 소유권을 확인한다. 교사 읽기 및 Realtime은 소유권 RLS로 제한한다. 학생은 활동 QR 토큰으로 접근하고, 개인 제출 코드를 통해 자신의 분석만 조회·수정한다. 학생·QR 토큰은 서버의 HMAC 검증값으로 저장한다. QR은 서버 비밀과 활동 ID로 결정적으로 생성해 다시 표시할 수 있다. 학생 코드 재발급 시 이전 코드는 무효화된다. 학생 API는 PostgreSQL 기반 요청 제한을 사용한다.

activities → background_questions → background_responses로 배경 질문과 학생 응답을 보관한다. 배경은 temporal(시간적)과 spatial(공간적)으로 구분한다. 학생은 자기 응답만 보내고, 교사가 응답을 모아 최종 정리를 공개한다. 최종 정리는 활동의 temporal_background, spatial_background에 원자적으로 반영되어 두 프롬프트에 들어간다.

activities → worksheets → image_submissions 관계로 인물·사건 분석과 두 사진을 연결한다. 학생별 character 한 장과 scene 한 장을 각각 slot=0에 저장한다. 두 사진이 모두 존재해야 완료로 계산한다. tag_catalog와 tag_aliases는 원래 입력과 교사의 정규화를 분리한다. upload_jobs는 업로드 경로와 멱등성을, deletion_jobs는 Storage/DB 삭제 재시도를 관리한다. revoked_student_codes는 재발급 이전 코드의 재사용을 차단한다. 브라우저에는 서비스 역할 키를 전달하지 않는다.

## 이미지 흐름

입력 파일 형식/용량 검증 → 브라우저 이미지 디코딩·비율 유지 압축 → 서버 제출 단계·개인 코드 검사 → 경로가 고정된 signed upload token → Private Storage 직접 업로드 → 서버 파일 존재·메타데이터·시그니처 검증 → DB 원자적 등록. 중복 업로드 예약은 DB의 학생/분류/슬롯 제약으로 차단한다. 완료된 작업 재호출은 같은 결과를 반환한다. 미완료 파일은 정리 API와 스케줄 함수로 삭제한다. 교사 열람은 짧은 signed URL을 쓴다.

삭제는 작업 기록 생성 → 해당 대상 잠금 → Storage 제거 → DB 제거 순서다. 중간 실패는 작업에 남기고 교사 설정에서 재시도한다. 이미지 삭제는 원래 분석을 보존한다.

## 페이지와 컴포넌트

- `/`: 소개, 교사 로그인, 데모 진입
- `/login`: 교사 인증
- `/teacher`: 수업 만들기·진행 중인 수업 목록. `/teacher/activities`는 이 화면으로 이동합니다.
- `/teacher/activities/new`, `/teacher/activity/:id`: 생성·편집·단계·QR
- `/teacher/activity/:id/background`: 시간적·공간적 배경 질문, 실시간 응답, 교사 최종 정리
- `/teacher/activity/:id/live`: 실시간 제출 및 미제출 현황
- `/teacher/activity/:id/gallery`: 검색·필터·비교·승인·삭제
- `/teacher/activity/:id/analytics`: 실제 학생 단위 빈도·공동 등장·태그 매핑
- `/teacher/activity/:id/showcase`: 승인 작품 전시
- `/activity/:token`: BACKGROUND 단계에는 배경 질문 응답, ANALYSIS 이후에는 인물·사건 두 탭의 분석과 두 프롬프트·제출 코드
- `/submit/:token`: 코드 확인·인물 사진 한 장·사건 장면 사진 한 장 제출

진행 단계: DRAFT → BACKGROUND → ANALYSIS → SUBMISSION → CLOSED. 배경의 학생 화면은 15초 간격으로 공개 질문·정리·단계를 갱신한다. 교사는 소유권 RLS가 적용된 Realtime으로 학생 응답과 사진을 수신하고, 연결 회복 및 주기적 재조회로 누락을 보완한다.

`src/components/ui.js`는 드롭다운, 모달, 토스트, 입력 도우미를 제공한다. `src/services/api.js`는 명시적인 demo/live 어댑터를 선택한다. 데모는 브라우저 IndexedDB에 이미지와 데이터를 보관하고 BroadcastChannel로 같은 브라우저의 탭을 갱신한다. 실제 학급처럼 다른 기기를 연결하지 않으며 화면에 이 차이를 표시한다. live 설정 오류 시 데모로 조용히 대체하지 않는다.

## 접근성과 성능

최소 44px 터치 영역, 16px 입력 글꼴, safe-area, dynamic viewport, 320px부터 가로 넘침 방지, Escape/방향키/Home/End/문자 탐색, 모달 Tab 순환·원래 초점 복귀를 지원한다. 모달 배경은 inert 처리한다. 교사 첫 화면은 회전하는 WebGL 장식 대신 승인 작품을 크게 보여 준다. 전시는 밝은 전시 벽 위에서 원본 비율을 유지하는 CSS와 GSAP 전환을 사용하고 reduced-motion을 지원한다. 예시 그림은 `artworkSource`가 번들 데모 파일에 한해 매핑하며 실제 업로드 주소는 변경하지 않는다. 새 삽화의 출처와 생성 프롬프트는 `docs/ART-PROMPTS.md`에 기록한다.
