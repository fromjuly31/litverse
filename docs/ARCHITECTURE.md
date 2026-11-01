# LITVERSE 구조와 심화 기능 확장

## 기존 구조와 재사용

실제 저장소는 Vanilla JavaScript ES Modules + Vite + Supabase + Netlify Functions로 구성되어 있습니다. Firebase/Firestore를 사용하지 않아 Firestore 보안 규칙을 추가하지 않았습니다. SQL 마이그레이션 004로 기존 스키마를 확장하며 001~003이나 기존 수업 데이터를 교체하지 않습니다. 신규 라이브러리 없이 기존 Zod, QRCode, GSAP, Lucide를 재사용합니다.

메인 / 수업하기 / 관람하기의 공통 헤더, 밝은 종이색·명조 제목·청록색 강조를 유지합니다. 수업하기 안에 작품 파악하기 / 이해 심화하기, 관람하기 안에 작품 파악 전시 / 이해 심화 전시를 둡니다. 모바일도 동일한 상단 탐색을 사용합니다.

- `components/ui.js`: 입력, 커스텀 선택 메뉴, 모달, 확인창, 토스트, 키보드 초점 관리.
- `pages/teacher.js`: 교사 공통 화면, 수업 암호 확인, 기존 QR 모달. 심화 QR은 같은 활동 토큰에 명시적 심화 경로만 붙입니다.
- `services/api.js`: demo/live 선택, 수업 접근 토큰, 관리자 세션, 실시간 구독.
- `services/demo.js`: 기존 IndexedDB와 쓰기 잠금·BroadcastChannel. 새 배열은 필요할 때 추가하며 기존 저장소를 초기화하지 않습니다.
- `pages/museum.js`: 기존 액자 그리드·검색·추가 조회·공통 헤더에 심화 전시 유형을 결합합니다.

기존 코드에는 댓글 기능이 없으므로 댓글이나 비속어 감지가 이미 있는 것으로 가정하지 않았습니다. 기존 사진 업로드·승인·삭제·분석·포스터 기능은 유지합니다.

## 데이터 관계

기존 관계는 그대로 유지됩니다.

- activities → background_questions → background_responses: 배경 질문·개인 응답. 최종 정리는 activities의 temporal_background / spatial_background.
- activities → worksheets → image_submissions: 학생별 인물·사건 분석과 각 한 장의 사진.
- lesson_access: 수업 비밀번호 해시·접근 토큰 버전.
- upload_jobs / deletion_jobs: 이미지 업로드의 중복 방지와 파일 삭제 재시도.
- revoked_student_codes: 재발급 이전 코드의 재사용 차단.

새로운 논리적 작품 ID는 literary_work_versions.id입니다. 같은 활동 안에서 분석을 수정할 때 버전이 증가하고, 심화 회차는 사용할 버전을 고정 참조합니다. 학급 간 작품 분석 캐시는 재사용할 수 있지만 학생 기록은 합치지 않습니다.

| 테이블·필드                     | 저장 내용·역할                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| activities.lesson_kind          | 기존 수업 understanding 또는 독립 심화 수업 deepening. 기존 행 기본값은 understanding                                                                        |
| activities.active_phase         | 학생에게 안내할 understanding / deepening. 기존 stage와 독립                                                                                                 |
| activities.deepening_session_id | 현재 안내하는 심화 회차 ID                                                                                                                                   |
| literary_work_versions          | activity_id, teacher_id, version, title, author, edition, source_text, ai_draft, reviewed_analysis, analysis_source, created_at                              |
| deepening_sessions              | activity_id, work_version_id, round, status(DRAFT/OPEN/CLOSED), visibility(private/class/public), 공개·생성·수정 시각                                        |
| deepening_records               | session_id, activity_id, participant_hash, student_label, worksheet_id, initial, questions, question_source, answers, reflection, 단계별 완료 시각, revision |
| deepening_ai_jobs               | 요청 key, pending/complete, result, lease_until, expires_at, 선택적 record_id. 학생 질문 캐시는 기록 삭제 시 함께 삭제                                       |
| deepening_exhibit_index         | 공개되었고 완료 성찰이 존재하며 삭제 중이 아닌 수업만 조회하는 서비스 전용 뷰                                                                                |

연결 수업은 기존 activity_id·teacher_id·참여 토큰을 그대로 사용합니다. 독립 심화 수업은 새 activity를 만들어 기존 비밀번호·QR 체계에 참여합니다. deepening_records의 (session_id, activity_id) 복합 외래 키는 다른 수업과의 잘못된 연결을 차단하고 (session_id, participant_hash) 유일성은 중복 참여 기록을 막습니다.

개인 코드로 기존 worksheet가 있으면 worksheet_id를 연결합니다. 기존 활동지를 나중에 제출하거나 코드를 재발급해도 DB 트리거가 연결을 갱신합니다. 이미지 한 장 삭제는 분석·심화 기록을 보존합니다. 명시적인 학생 전체 삭제는 해당 worksheet에 연결된 심화 기록을, 수업 전체 삭제는 모든 버전·회차·기록을 삭제합니다.

## 인증과 Supabase 보안

교사는 기존 수업 암호 접근 세션 또는 사전 등록 관리자 로그인을 사용합니다. 암호는 서버 scrypt 해시, 수업 접근 토큰은 수업·버전·만료에 제한된 서명 토큰입니다. 관리 API는 기존 lessonOwner 확인을 사용합니다. DB 직접 쓰기는 서비스 역할에만 허용됩니다.

학생은 기존 QR 토큰과 무작위 개인 코드로 자신을 식별합니다. 서버에는 HMAC 검증값만 저장합니다. 요청마다 토큰 수업과 회차의 수업을 대조하고, 재발급으로 폐기된 코드를 거절합니다. 클라이언트가 전달한 학생 ID를 신뢰하지 않습니다.

마이그레이션 004가 필요한 보안을 함께 적용합니다.

1. 새 네 테이블에 RLS를 활성화합니다. authenticated는 소유 교사의 작품 버전·회차·기록만 읽을 수 있고, anon에는 읽기·쓰기 권한이 없습니다.
2. configure_deepening / control_deepening / write_deepening_record / claim_deepening_ai RPC는 service_role 전용입니다. 각 데이터 변경에서 수업 소유권·단계·버전·중복 조건을 추가 확인합니다.
3. 익명 학생의 읽기·쓰기는 Netlify API에서 개인 코드와 공개 범위를 확인한 뒤 실행합니다. DB에 학생용 공개 읽기 정책을 추가하지 않습니다.
4. 수업 내 관점은 자신의 세 답변 제출 후 교사가 class/public으로 설정했을 때만 읽습니다. 공개 전시는 completed_at이 있는 기록만 제공합니다. 공용 응답에는 학생 표시명·코드·검증값·worksheet ID를 제거하고 ‘관점 01’ 등의 익명 이름을 사용합니다.
5. public view도 anon/authenticated에 직접 열지 않습니다. 서버가 공개용 필드만 골라 응답합니다. 교사 화면은 번호·별칭과 상세 진행을 확인할 수 있습니다.
6. 작품 분석/수업 생성/개인 기록 API에 PostgreSQL 기반 요청 제한을 적용합니다. 비밀 키는 서버 환경변수에만 둡니다.

RLS·RPC는 SQL 테스트로 검사했지만 실제 Supabase 프로젝트의 Auth·Realtime 설정은 운영 연결 후 별도로 확인해야 합니다. 비로그인 수업 암호 사용자에게 Realtime 데이터를 공개하지 않으며, 이 경우 교사 화면의 15초 재조회가 현황을 보완합니다.

## 단계와 저장 안정성

작품 파악의 기존 stage는 DRAFT → BACKGROUND → ANALYSIS → SUBMISSION → CLOSED입니다. 심화는 별도 DRAFT → OPEN → CLOSED를 사용합니다. 연결 심화 수업의 시작·종료는 기존 stage를 바꾸지 않습니다. 독립 심화 수업만 첫 시작 시 기존 참여 토큰 체계가 허용하는 ANALYSIS로 전환합니다.

- 교사 분석 확정은 새 버전과 회차 연결을 트랜잭션으로 저장합니다. 시작 전 회차만 분석 교체가 가능하며 시작 후 수정은 새 회차를 만듭니다. 생성 요청 UUID를 재사용해 재시도로 회차가 늘어나지 않게 합니다.
- 학생 최초 판단은 수정 불가능한 별도 값으로 남깁니다. 질문은 한 번 저장하면 재사용합니다. 세 질문의 답변을 모두 제출해야 다른 관점을 감상할 수 있습니다.
- final reflection의 same / changed / expanded는 모두 정상 완료입니다. 완료 기록은 읽기 전용이며 새 회차에서도 이전 기록은 보존됩니다.
- 답변별 저장은 직렬화하고 revision을 비교합니다. 다른 기기·창의 변경과 충돌하면 덮어쓰지 않고 로컬 초안을 유지합니다. 브라우저 저장소에도 입력마다 초안을 보관하고, 새로고침 시 복원합니다. 네트워크 저장 실패를 완료로 표시하지 않습니다.
- 학생에게 새 단계가 열려도 입력 화면을 강제 교체하지 않습니다. 안내 배너와 명시적 이동 링크를 표시합니다. 교사 화면은 실시간 구독과 15초 재조회, 학생은 단계·공개 상태만 재조회합니다.
- AI 생성은 DB의 60초 임대 잠금으로 중복을 막습니다. 실패한 작품 분석은 5분 후 다시 생성할 수 있으며 학생의 확정 질문은 계속 재사용합니다. 외부 API와 DB 사이에 원자적 트랜잭션이 없으므로 서버가 결과 저장 전에 강제 종료되는 예외 상황까지 외부 과금을 정확히 1회 보장하지는 않습니다.

## AI 어댑터

`netlify/lib/deepening-ai.js`가 제공자별 전송을 담당하고 `src/utils/deepening.js`가 검증 스키마·갈래별 기본 질문·학생 상태 변경을 공유합니다. AI 키와 네트워크 호출은 HTML 번들에 포함되지 않습니다.

OpenAI는 Responses 구조화 출력을 요청하고 서버에서 다시 Zod 검증합니다. custom은 동일 JSON Schema를 전달하는 HTTPS 어댑터입니다. 학생 AI는 운영자의 정책 검토·활성화 전까지 호출하지 않으며 교사가 확인한 질문에 학생의 선택·이유·근거를 연결합니다. 환경변수·custom 요청 계약·미성년자 운영 조건은 [README](../README.md#심화-ai-연결대체-동작)에 있습니다.

## 경로

| 경로                                                        | 역할                                |
| ----------------------------------------------------------- | ----------------------------------- |
| /                                                           | 문학 전시관 입구·공개 작품 수       |
| /teacher?tab=understanding                                  | 작품 파악 목록                      |
| /teacher?tab=deepening                                      | 심화 목록, 마지막 탭 복원           |
| /teacher/activities/new                                     | 기존 작품 파악 수업 생성            |
| /teacher/deepening/new                                      | 독립 심화 수업 생성                 |
| /teacher/activity/:id/background, gallery, scenes, settings | 기존 프로젝트·분석·설정             |
| /teacher/activity/:id/deepening                             | 연결/독립 심화 생성·진행·회차 관리  |
| /activity/:token                                            | 현재 안내 단계로 학생 진입          |
| /activity/:token/understanding                              | 기존 작품 파악 화면으로 명시적 이동 |
| /activity/:token/deepening                                  | 심화 학생 활동                      |
| /submit/:token                                              | 기존 두 사진 제출                   |
| /exhibition                                                 | 기존 포스터 전시                    |
| /exhibition?type=deepening                                  | 심화 전시 목록                      |
| /exhibition/deep-:sessionId                                 | 익명 관점과 BEFORE/AFTER 상세       |
| /admin                                                      | 기존 관리자 인증·관리               |

GitHub Pages와 단일 HTML은 기존 hash 라우터를 재사용합니다. 실제 여러 기기의 수업과 서버 AI는 Supabase/Netlify live 모드가 필요합니다.

## 이번 확장의 추가 파일

| 파일                                  | 역할                                             |
| ------------------------------------- | ------------------------------------------------ |
| src/utils/deepening.js                | 갈래·분석·질문·성찰 스키마, 상태 검증, 익명 투영 |
| src/components/deepening.js           | 수업 탭, 교사 분석 편집, 관점 카드·상세          |
| src/pages/deepening-teacher.js        | 분석 검토·회차·QR·진행·공개 관리                 |
| src/pages/deepening-student.js        | 학생 4단계·자동 저장·복구                        |
| src/pages/deepening-exhibit.js        | 기존 전시에 결합하는 심화 액자·상세              |
| src/services/demo-deepening.js        | 기존 IndexedDB를 확장하는 데모 API               |
| src/services/student-phase.js         | 입력을 보존하는 학생 단계 안내                   |
| src/styles/deepening.css              | 기존 디자인과 연결한 반응형 심화 UI              |
| netlify/lib/deepening.js              | 서버 API·권한·캐시·공개 응답                     |
| netlify/lib/deepening-ai.js           | 교체 가능한 AI 어댑터                            |
| supabase/migrations/004_deepening.sql | 추가 테이블·RLS·RPC·트리거·Realtime              |
| tests/deepening.test.js               | 스키마·AI 실패·SQL·권한·동시성                   |
| tests/e2e/deepening.spec.js           | 독립/연결 수업·보존·성찰·전시                    |
| tests/pages/deepening.spec.js         | 루트·하위 경로·단일 HTML 동작                    |

## 이번 확장의 수정 파일

| 파일                                             | 변경                                           |
| ------------------------------------------------ | ---------------------------------------------- |
| src/main.js                                      | 심화 CSS 연결                                  |
| src/pages/teacher.js                             | 하위 탭·심화 라우팅·기존 QR 재사용             |
| src/pages/dashboard.js                           | 두 수업 분야의 목록·작은 카드                  |
| src/pages/student.js                             | 기존/심화 학생 진입·단계 안내                  |
| src/pages/museum.js                              | 전시 유형·심화 검색·작품 수·상세 연결          |
| src/components/student-ui.js                     | 학생 활동 이름 구분                            |
| src/services/api.js                              | 심화 테이블 구독                               |
| src/services/demo.js                             | 데모 연동·기존 필드 보존·코드 재발급·연관 삭제 |
| src/utils/archive.js                             | 공개 수업 메타데이터의 추가 필드               |
| netlify/functions/api.js                         | 심화 API 디스패치                              |
| netlify/lib/server.js                            | 참여 단계·새 오류 메시지 처리                  |
| netlify/lib/archive.js                           | 기존 수업 목록에 심화 연결 메타데이터          |
| .env.example                                     | 서버 AI 제공자·학생 AI 정책 설정               |
| package.json                                     | 심화 서버 검사를 기존 test 명령에 추가         |
| vite.config.js                                   | 생성된 배포 파일·테스트 파일 감시 제외         |
| README.md, docs/ARCHITECTURE.md, docs/TESTING.md | 사용·설정·데이터·파일·검증 기록                |

## 이미지와 접근성

기존 업로드는 브라우저 압축 → 서버 제출 단계/코드 검사 → Private Storage signed upload → MIME/시그니처 검증 → 원자적 등록을 유지합니다. 삭제는 작업 기록으로 실패 재시도를 보장하며 사진만 삭제하면 분석은 보존합니다.

키보드 탐색·모달 포커스·Escape 닫기·reduced-motion·기존 아이콘을 재사용하고 입력 글꼴과 모바일 여백을 유지합니다. 메인과 수업 목록은 작은 화면에 맞춰 표시 개수를 조정합니다. 긴 질문·분석 편집·학생 글쓰기 화면과 작품이 있는 전시관은 자연스럽게 스크롤됩니다.
