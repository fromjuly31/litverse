import {
  analysisInputSchema,
  analysisSchema,
  reviewedSchema,
  demoAnalysis,
  personalizedFallback,
  studentChange,
  publicRecord,
} from "../utils/deepening.js";
import {
  hasDemoAccess,
  accessError,
  passwordHash,
  checkPassword,
  issueDemoAccess,
} from "./demo-access.js";
import { randomCode } from "../utils/helpers.js";
import { DEFAULT_TASKS, DEFAULT_TAGS } from "../utils/domain.js";

export async function demoDeepening(state, action, p) {
  if (!action.startsWith("deepening/")) return { handled: false };
  state.deepening_sessions ||= [];
  state.deepening_records ||= [];
  state.literary_work_versions ||= [];
  state.deepening_analysis_cache ||= {};
  state.lesson_passwords ||= {};
  const done = (result, changed = false) => ({
    handled: true,
    result,
    changed,
  });
  const fail = (message) => {
    throw new Error(message);
  };
  const activity = (id) =>
    state.activities.find((a) => a.id === id) ||
    fail("수업을 찾을 수 없습니다.");
  const teacher = async (id) => {
    if (
      !(await hasDemoAccess(state, "admin", p.__admin)) &&
      !(await hasDemoAccess(state, id, p.__access))
    )
      accessError();
    return activity(id);
  };
  const safeRecord = ({ participant_hash, ...r }) => r;
  const bundle = (session) => ({
    session,
    work: state.literary_work_versions.find(
      (w) => w.id === session.work_version_id,
    ),
  });
  const isExhibited = (s) =>
    s.visibility === "public" &&
    state.activities.some((a) => a.id === s.activity_id) &&
    state.deepening_records.some(
      (r) => r.session_id === s.id && r.completed_at,
    );
  const exhibit = (s) => {
    const { work } = bundle(s);
    return {
      id: s.id,
      activity_id: s.activity_id,
      title: work.title,
      author: work.author,
      round: s.round,
      analysis: work.reviewed_analysis,
      records: state.deepening_records
        .filter((r) => r.session_id === s.id && r.completed_at)
        .map(publicRecord),
      type: "deepening",
      published_at: s.published_at,
    };
  };
  if (action === "deepening/analyze") {
    if (p.id) await teacher(p.id);
    const input = analysisInputSchema.parse(p),
      key = JSON.stringify(input);
    if (state.deepening_analysis_cache[key])
      return done(state.deepening_analysis_cache[key]);
    state.deepening_analysis_cache[key] = demoAnalysis(input);
    return done(state.deepening_analysis_cache[key], true);
  }
  if (["deepening/public-list", "deepening/public-count"].includes(action)) {
    const all = state.deepening_sessions
      .filter((s) => isExhibited(s))
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    const query = String(p.query || "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .toLowerCase();
    const filtered = all.filter((s) => {
      const { work } = bundle(s);
      return `${work.title} ${work.author}`.toLowerCase().includes(query);
    });
    if (action === "deepening/public-count")
      return done({ total: filtered.length });
    const offset = Math.max(0, Number(p.offset) || 0);
    return done({
      items: filtered.slice(offset, offset + 24).map((s) => {
        const item = exhibit(s);
        return {
          ...item,
          record_count: item.records.length,
          records: item.records.slice(0, 1),
        };
      }),
      total: filtered.length,
    });
  }
  if (action === "deepening/public-exhibit") {
    const session = state.deepening_sessions.find(
      (s) => s.id === p.session_id && isExhibited(s),
    );
    if (!session) fail("공개되지 않은 심화 전시입니다.");
    activity(session.activity_id);
    return done(exhibit(session));
  }
  if (action === "deepening/save") {
    const input = analysisInputSchema.parse(p.input),
      analysis = reviewedSchema.parse(p.analysis),
      draft = analysisSchema.parse(p.draft || p.analysis);
    const standalone = !p.id;
    let a;
    if (standalone) {
      a = state.activities.find((a) => a.id === p.activity_id);
      if (a && !(await checkPassword(p.password, state.lesson_passwords[a.id])))
        accessError();
      if (!a) {
        state.lesson_passwords[p.activity_id] = await passwordHash(p.password);
        a = {
          id: p.activity_id,
          title: input.title,
          author: input.author,
          course_name: "이해 심화하기",
          class_name: "",
          introduction: "문학을 통해 삶과 사회를 성찰합니다.",
          objectives: "다른 관점과 판단 근거를 살펴봅니다.",
          tasks: DEFAULT_TASKS,
          tags: DEFAULT_TAGS,
          settings: {
            allow_resubmit: true,
            require_approval: true,
            enable_scene: true,
            max_images: 1,
          },
          default_image_style: "문학 일러스트레이션",
          expected_student_count: 30,
          stage: "DRAFT",
          lesson_kind: "deepening",
          active_phase: "understanding",
          worksheet_token: randomCode(),
          submission_token: randomCode(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        state.activities.push(a);
      }
    } else a = await teacher(p.id);
    const retried = state.deepening_sessions.find((s) => s.id === p.request_id);
    if (retried) {
      if (retried.activity_id !== a.id) accessError();
      return done(
        {
          id: a.id,
          session: retried,
          ...(standalone ? { access: await issueDemoAccess(state, a.id) } : {}),
        },
        standalone,
      );
    }
    let session = state.deepening_sessions.find(
      (s) => s.id === a.deepening_session_id,
    );
    if (
      session &&
      !p.new_round &&
      (session.status !== "DRAFT" ||
        state.deepening_records.some((r) => r.session_id === session.id))
    )
      fail("진행한 회차는 보존됩니다. 새 회차를 만들어 주세요.");
    if (session?.status === "OPEN" && p.new_round)
      fail("현재 회차를 먼저 종료해 주세요.");
    const work = {
      id: crypto.randomUUID(),
      activity_id: a.id,
      version:
        state.literary_work_versions.filter((w) => w.activity_id === a.id)
          .length + 1,
      ...input,
      ai_draft: draft,
      reviewed_analysis: analysis,
      analysis_source: p.source,
      created_at: new Date().toISOString(),
    };
    state.literary_work_versions.push(work);
    if (session && !p.new_round) session.work_version_id = work.id;
    else {
      session = {
        id: p.request_id,
        activity_id: a.id,
        work_version_id: work.id,
        round:
          state.deepening_sessions.filter((s) => s.activity_id === a.id)
            .length + 1,
        status: "DRAFT",
        visibility: "private",
        created_at: new Date().toISOString(),
      };
      state.deepening_sessions.push(session);
    }
    a.deepening_session_id = session.id;
    return done(
      {
        id: a.id,
        session,
        ...(standalone ? { access: await issueDemoAccess(state, a.id) } : {}),
      },
      true,
    );
  }
  if (action === "deepening/get" || action === "deepening/control") {
    const a = await teacher(p.id),
      sessions = state.deepening_sessions
        .filter((s) => s.activity_id === a.id)
        .sort((a, b) => b.round - a.round);
    const session = sessions.find(
      (s) => s.id === (p.session_id || a.deepening_session_id),
    );
    if (action === "deepening/get")
      return done({
        ...(session ? bundle(session) : { session: null }),
        sessions,
        records: state.deepening_records
          .filter((r) => r.session_id === session?.id)
          .map(safeRecord),
      });
    if (!session) fail("심화 수업을 찾을 수 없습니다.");
    if (
      !["DRAFT", "OPEN", "CLOSED"].includes(p.status) ||
      !["private", "class", "public"].includes(p.visibility) ||
      !["understanding", "deepening"].includes(p.phase)
    )
      fail("잘못된 진행 설정입니다.");
    if (p.status === "DRAFT" && session.status !== "DRAFT")
      fail("진행한 회차를 초기화할 수 없습니다.");
    if (
      p.status === "OPEN" &&
      sessions.some((s) => s.id !== session.id && s.status === "OPEN")
    )
      fail("진행 중인 회차를 먼저 종료해 주세요.");
    if (
      p.visibility === "public" &&
      !state.deepening_records.some(
        (r) => r.session_id === session.id && r.completed_at,
      )
    )
      fail("완료된 성찰이 있어야 공개할 수 있습니다.");
    Object.assign(session, {
      status: p.status,
      visibility: p.visibility,
      published_at:
        p.visibility === "public"
          ? session.published_at || new Date().toISOString()
          : null,
    });
    a.active_phase = p.phase;
    a.deepening_session_id = session.id;
    if (
      a.lesson_kind === "deepening" &&
      a.stage === "DRAFT" &&
      p.status === "OPEN"
    )
      a.stage = "ANALYSIS";
    return done(session, true);
  }
  if (action.startsWith("deepening/student-")) {
    const a =
      state.activities.find((a) =>
        [a.worksheet_token, a.submission_token].includes(p.token),
      ) || fail("유효하지 않은 참여 링크입니다.");
    const session = state.deepening_sessions.find(
      (s) =>
        s.activity_id === a.id &&
        s.id === (p.session_id || a.deepening_session_id),
    );
    if (!session || session.status === "DRAFT")
      fail("선생님이 심화 수업을 시작하면 참여할 수 있습니다.");
    if (!p.code || state.revoked_codes?.includes(p.code))
      fail("개인 제출 코드를 확인해 주세요.");
    const { work } = bundle(session);
    let record = state.deepening_records.find(
        (r) => r.session_id === session.id && r.participant_hash === p.code,
      ),
      changed = false;
    if (action === "deepening/student-join" && !record) {
      if (
        session.status !== "OPEN" ||
        !p.student_label?.trim() ||
        p.student_label.length > 40
      )
        fail("진행 중인 수업에서 학생 번호나 별칭을 입력해 주세요.");
      const worksheet = state.worksheets.find(
        (w) => w.activity_id === a.id && w.submission_code === p.code,
      );
      record = {
        id: crypto.randomUUID(),
        session_id: session.id,
        activity_id: a.id,
        participant_hash: p.code,
        student_label: worksheet?.student_label || p.student_label.trim(),
        worksheet_id: worksheet?.id || null,
        initial: null,
        questions: null,
        answers: {},
        reflection: null,
        revision: 0,
        created_at: new Date().toISOString(),
      };
      state.deepening_records.push(record);
      changed = true;
    }
    if (["deepening/student-get", "deepening/student-join"].includes(action))
      return done(
        {
          session,
          analysis: work.reviewed_analysis,
          record: record ? safeRecord(record) : null,
          title: work.title,
          author: work.author,
        },
        changed,
      );
    if (!record) fail("학생 번호나 별칭으로 먼저 참여해 주세요.");
    if (action === "deepening/student-write") {
      if (record.revision !== p.revision)
        fail(
          "다른 창에서 기록이 변경되었습니다. 최신 기록을 불러와 주세요. 임시저장 내용은 유지됩니다.",
        );
      Object.assign(
        record,
        studentChange(record, p.operation, p.data, session),
        { revision: record.revision + 1, updated_at: new Date().toISOString() },
      );
      return done(safeRecord(record), true);
    }
    if (action === "deepening/student-questions") {
      if (record.questions) return done(safeRecord(record));
      if (!record.initial || session.status !== "OPEN")
        fail("진행 중인 수업에서 최초 판단을 먼저 제출해 주세요.");
      Object.assign(record, {
        questions: personalizedFallback(work.reviewed_analysis, record.initial),
        question_source: "teacher",
        revision: record.revision + 1,
      });
      return done(safeRecord(record), true);
    }
    if (action === "deepening/student-peers") {
      if (!record.answers_submitted_at || session.visibility === "private")
        accessError("세 답변을 제출하고 선생님이 감상을 열면 볼 수 있습니다.");
      return done(
        state.deepening_records
          .filter((r) => r.session_id === session.id && r.answers_submitted_at)
          .map(publicRecord)
          .filter((r) => r.id !== record.id),
      );
    }
  }
  fail("지원하지 않는 심화 활동입니다.");
}
