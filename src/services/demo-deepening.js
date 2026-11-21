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
  classQuestionAnalysis,
  classResponseSchema,
  isClassQuestions,
} from "../utils/class-questions.js";
import { hasDemoAccess, accessError } from "./demo-access.js";

export function demoPublicDeepeningSessions(state) {
  const activities = new Set(state.activities.map(({ id }) => id));
  const completed = new Set(
    (state.deepening_records || [])
      .filter((record) => record.completed_at)
      .map((record) => record.session_id),
  );
  const works = new Map(
    (state.literary_work_versions || []).map((work) => [work.id, work]),
  );
  return (state.deepening_sessions || []).flatMap((session) => {
    const work = works.get(session.work_version_id);
    return session.visibility === "public" &&
      work &&
      activities.has(session.activity_id) &&
      completed.has(session.id)
      ? [{ ...session, title: work.title, author: work.author }]
      : [];
  });
}

export function demoPublicDeepeningExhibit(state, session) {
  const work = state.literary_work_versions.find(
    (entry) => entry.id === session.work_version_id,
  );
  return {
    id: session.id,
    activity_id: session.activity_id,
    title: work.title,
    author: work.author,
    round: session.round,
    analysis: work.reviewed_analysis,
    records: state.deepening_records
      .filter(
        (record) => record.session_id === session.id && record.completed_at,
      )
      .map(publicRecord),
    type: "deepening",
    published_at: session.published_at,
  };
}

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
    const all = demoPublicDeepeningSessions(state).sort(
      (a, b) => new Date(b.published_at) - new Date(a.published_at),
    );
    const query = String(p.query || "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .toLowerCase();
    const filtered = all.filter((s) =>
      `${s.title} ${s.author}`.toLowerCase().includes(query),
    );
    if (action === "deepening/public-count")
      return done({ total: filtered.length });
    const offset = Math.max(0, Number(p.offset) || 0);
    return done({
      items: filtered.slice(offset, offset + 24).map((s) => {
        const item = demoPublicDeepeningExhibit(state, s);
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
    const session = demoPublicDeepeningSessions(state).find(
      (s) => s.id === p.session_id,
    );
    if (!session) fail("공개되지 않은 심화 전시입니다.");
    activity(session.activity_id);
    return done(demoPublicDeepeningExhibit(state, session));
  }
  if (action === "deepening/save" || action === "deepening/questions-start") {
    if (!p.id) fail("작품 수업을 열고 이해 심화하기에서 시작해 주세요.");
    const startsQuestions = action === "deepening/questions-start";
    const a = await teacher(p.id);
    const { title, author } = a;
    const input = startsQuestions
      ? { title, author }
      : { ...analysisInputSchema.parse(p.input), title, author };
    const analysis = startsQuestions
      ? classQuestionAnalysis(p.questions)
      : reviewedSchema.parse(p.analysis);
    const draft = startsQuestions
      ? analysis
      : analysisSchema.parse(p.draft || p.analysis);
    const newRound = startsQuestions || p.new_round;
    const retried = state.deepening_sessions.find((s) => s.id === p.request_id);
    if (retried) {
      if (retried.activity_id !== a.id) accessError();
      if (
        startsQuestions &&
        !isClassQuestions(bundle(retried).work.reviewed_analysis)
      )
        accessError();
      return done({ id: a.id, session: retried });
    }
    let session = state.deepening_sessions.find(
      (s) => s.id === a.deepening_session_id,
    );
    if (
      session &&
      !newRound &&
      (session.status !== "DRAFT" ||
        state.deepening_records.some((r) => r.session_id === session.id))
    )
      fail("진행한 회차는 보존됩니다. 새 회차를 만들어 주세요.");
    if (session?.status === "OPEN" && newRound)
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
      analysis_source: startsQuestions ? "manual" : p.source,
      created_at: new Date().toISOString(),
    };
    state.literary_work_versions.push(work);
    if (session && !newRound) session.work_version_id = work.id;
    else {
      session = {
        id: p.request_id,
        activity_id: a.id,
        work_version_id: work.id,
        round:
          state.deepening_sessions.filter((s) => s.activity_id === a.id)
            .length + 1,
        status: startsQuestions ? "OPEN" : "DRAFT",
        visibility: "private",
        created_at: new Date().toISOString(),
      };
      state.deepening_sessions.push(session);
    }
    a.deepening_session_id = session.id;
    if (startsQuestions) a.active_phase = "deepening";
    return done({ id: a.id, session }, true);
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
      isClassQuestions(bundle(session).work.reviewed_analysis) &&
      p.visibility !== "private"
    )
      accessError("학생 답변은 교사 화면에서만 볼 수 있습니다.");
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
    const studentBundle = () => ({
      session,
      analysis: work.reviewed_analysis,
      record: record ? safeRecord(record) : null,
      title: work.title,
      author: work.author,
    });
    if (isClassQuestions(work.reviewed_analysis)) {
      if (action === "deepening/student-get") return done(studentBundle());
      if (action !== "deepening/student-submit")
        fail("이 수업에서는 질문에 대한 답변을 제출해 주세요.");
      const { student_label, answers } = classResponseSchema.parse(p);
      if (answers.length !== work.reviewed_analysis.questions.length)
        fail("모든 질문에 답변해 주세요.");
      if (record) {
        if (answers.every((answer, index) => answer === record.answers[index]))
          return done(safeRecord(record));
        fail(
          "이미 이 회차에 답변을 제출했어요. 화면을 다시 열어 확인해 주세요.",
        );
      }
      if (session.status !== "OPEN") fail("선생님이 답변 제출을 마감했어요.");
      const worksheet = state.worksheets.find(
        (w) => w.activity_id === a.id && w.submission_code === p.code,
      );
      const now = new Date().toISOString();
      record = {
        id: crypto.randomUUID(),
        session_id: session.id,
        activity_id: a.id,
        participant_hash: p.code,
        student_label: worksheet?.student_label || student_label,
        worksheet_id: worksheet?.id || null,
        answers,
        answers_submitted_at: now,
        completed_at: now,
        revision: 1,
        created_at: now,
        updated_at: now,
      };
      state.deepening_records.push(record);
      return done(safeRecord(record), true);
    }
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
      return done(studentBundle(), changed);
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
