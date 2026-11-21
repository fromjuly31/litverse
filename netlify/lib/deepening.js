import { z } from "zod";
import {
  check,
  fail,
  limit,
  ownedActivity,
  tokenActivity,
  hmac,
} from "./server.js";
import { lessonOwner } from "./lesson-access.js";
import { uuid, token, code } from "./validation.js";
import {
  analysisInputSchema,
  reviewedSchema,
  analysisSchema,
  studentChange,
  publicRecord,
} from "../../src/utils/deepening.js";
import {
  classQuestionAnalysis,
  classResponseSchema,
  isClassQuestions,
} from "../../src/utils/class-questions.js";
import {
  analysisCacheKey,
  analyzeWork,
  studentQuestions,
} from "./deepening-ai.js";

const safeRecord = ({ participant_hash, ...record }) => record;
async function cached(db, key, generate, recordId = null) {
  const existing = check(
    await db
      .from("deepening_ai_jobs")
      .select("state,result,expires_at")
      .eq("key", key)
      .maybeSingle(),
  );
  if (
    existing?.state === "complete" &&
    (!existing.expires_at || new Date(existing.expires_at) > new Date())
  )
    return existing.result;
  if (!check(await db.rpc("claim_deepening_ai", { p_key: key })))
    fail(409, "생성 중인 요청이 있습니다. 잠시 후 다시 확인해 주세요.");
  if (recordId)
    check(
      await db
        .from("deepening_ai_jobs")
        .update({ record_id: recordId })
        .eq("key", key),
    );
  const result = await generate();
  check(
    await db
      .from("deepening_ai_jobs")
      .update({
        state: "complete",
        result,
        lease_until: null,
        expires_at:
          key.startsWith("work:") && result.source !== "ai"
            ? new Date(Date.now() + 300000).toISOString()
            : null,
      })
      .eq("key", key),
  );
  return result;
}
async function sessionData(db, id, activityId) {
  const session = check(
    await db
      .from("deepening_sessions")
      .select("*")
      .eq("id", id)
      .eq("activity_id", activityId)
      .maybeSingle(),
  );
  if (!session) fail(404, "심화 수업을 찾을 수 없습니다.");
  const work = check(
    await db
      .from("literary_work_versions")
      .select("*")
      .eq("id", session.work_version_id)
      .single(),
  );
  return { session, work };
}
export async function publicDeepeningExhibit(db, session, summary = false) {
  const work = check(
    await db
      .from("literary_work_versions")
      .select("title,author,reviewed_analysis,version")
      .eq("id", session.work_version_id)
      .single(),
  );
  const response = await db
    .from("deepening_records")
    .select("id,initial,questions,answers,reflection,completed_at", {
      count: "exact",
    })
    .eq("session_id", session.id)
    .not("completed_at", "is", null)
    .order("created_at")
    .limit(summary ? 1 : 1000);
  const records = check(response);
  return {
    id: session.id,
    activity_id: session.activity_id,
    title: work.title,
    author: work.author,
    round: session.round,
    analysis: work.reviewed_analysis,
    records: records.map(publicRecord),
    record_count: response.count,
    published_at: session.published_at,
    type: "deepening",
  };
}
export async function deepeningAction(db, req, context, action, p) {
  if (!action.startsWith("deepening/")) return { handled: false };
  const done = (value) => ({ handled: true, value });
  await limit(db, `deepening:${context.ip || "local"}`, 6000, 600);
  if (action === "deepening/analyze") {
    const input = analysisInputSchema.parse(p);
    const scope = p.id
      ? await lessonOwner(db, req, uuid.parse(p.id))
      : "public";
    await limit(db, `deepening-ai:${context.ip || "local"}`, 15, 3600);
    const result = await cached(
      db,
      `work:${analysisCacheKey(input, scope)}`,
      () => analyzeWork(input),
    );
    return done(result);
  }
  if (
    [
      "deepening/public-list",
      "deepening/public-exhibit",
      "deepening/public-count",
    ].includes(action)
  ) {
    const search = z
      .string()
      .max(120)
      .default("")
      .parse(p.query)
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
    let query = db
      .from("deepening_exhibit_index")
      .select("*", {
        count: "exact",
        head: action === "deepening/public-count",
      })
      .order("published_at", { ascending: false })
      .order("id");
    if (search)
      query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`);
    if (action === "deepening/public-exhibit")
      query = query.eq("id", uuid.parse(p.session_id));
    const offset = z
      .number()
      .int()
      .min(0)
      .max(1000000)
      .default(0)
      .parse(p.offset);
    const response = await query.range(offset, offset + 23);
    const sessions = check(response);
    if (action === "deepening/public-count")
      return done({ total: response.count });
    const items = await Promise.all(
      sessions.map((s) =>
        publicDeepeningExhibit(db, s, action === "deepening/public-list"),
      ),
    );
    if (action === "deepening/public-exhibit") {
      if (!items.length) fail(404, "공개되지 않은 심화 전시입니다.");
      return done(items[0]);
    }
    return done({ items, total: response.count });
  }
  if (action === "deepening/save" || action === "deepening/questions-start") {
    if (!p.id) fail(400, "작품 수업을 열고 이해 심화하기에서 시작해 주세요.");
    const startsQuestions = action === "deepening/questions-start";
    const id = uuid.parse(p.id);
    const requestId = uuid.parse(p.request_id);
    const teacher = await lessonOwner(db, req, id);
    const { title, author } = await ownedActivity(db, id, teacher);
    const input = startsQuestions
      ? { title, author }
      : { ...analysisInputSchema.parse(p.input), title, author };
    const session = check(
      await db.rpc(
        startsQuestions
          ? "start_deepening_class_questions"
          : "configure_deepening",
        {
          p_teacher: teacher,
          p_activity: id,
          p_session: requestId,
          p_input: input,
          p_analysis: startsQuestions
            ? classQuestionAnalysis(p.questions)
            : reviewedSchema.parse(p.analysis),
          ...(!startsQuestions && {
            p_draft: analysisSchema.parse(p.draft || p.analysis),
            p_source: z.enum(["ai", "example", "manual"]).parse(p.source),
            p_new_round: !!p.new_round,
          }),
          p_password: null,
          p_tokens: {},
        },
      ),
    );
    return done({ id, session });
  }
  if (action === "deepening/get" || action === "deepening/control") {
    const id = uuid.parse(p.id),
      teacher = await lessonOwner(db, req, id),
      activity = await ownedActivity(db, id, teacher);
    if (action === "deepening/control") {
      const sessionId = uuid.parse(p.session_id);
      const { work } = await sessionData(db, sessionId, id);
      if (
        isClassQuestions(work.reviewed_analysis) &&
        p.visibility !== "private"
      )
        fail(403, "학생 답변은 교사 화면에서만 볼 수 있습니다.");
      const session = check(
        await db.rpc("control_deepening", {
          p_teacher: teacher,
          p_activity: id,
          p_session: sessionId,
          p_status: z.enum(["DRAFT", "OPEN", "CLOSED"]).parse(p.status),
          p_visibility: z
            .enum(["private", "class", "public"])
            .parse(p.visibility),
          p_phase: z.enum(["understanding", "deepening"]).parse(p.phase),
        }),
      );
      return done(session);
    }
    const sessions = check(
      await db
        .from("deepening_sessions")
        .select("*")
        .eq("activity_id", id)
        .order("round", { ascending: false }),
    );
    const selected = p.session_id
      ? uuid.parse(p.session_id)
      : activity.deepening_session_id;
    if (!selected) return done({ sessions, session: null, records: [] });
    const data = await sessionData(db, selected, id);
    const records = check(
      await db
        .from("deepening_records")
        .select("*")
        .eq("session_id", selected)
        .order("created_at")
        .limit(1000),
    );
    return done({ ...data, sessions, records: records.map(safeRecord) });
  }
  if (action.startsWith("deepening/student-")) {
    const activity = await tokenActivity(db, token.parse(p.token), null, {
      deepening: true,
    });
    const sessionId = p.session_id
      ? uuid.parse(p.session_id)
      : activity.deepening_session_id;
    if (!sessionId) fail(404, "아직 심화 수업이 준비되지 않았습니다.");
    const { session, work } = await sessionData(db, sessionId, activity.id);
    if (session.status === "DRAFT")
      fail(409, "선생님이 심화 수업을 시작하면 참여할 수 있습니다.");
    const hash = hmac(`student:${code.parse(p.code)}`);
    await limit(db, `deepening-participant:${hash}`, 240, 600);
    if (
      check(
        await db
          .from("revoked_student_codes")
          .select("code_hash")
          .eq("code_hash", hash)
          .maybeSingle(),
      )
    )
      fail(403, "재발급된 개인 제출 코드를 사용해 주세요.");
    const find = async () =>
      check(
        await db
          .from("deepening_records")
          .select("*")
          .eq("session_id", session.id)
          .eq("participant_hash", hash)
          .maybeSingle(),
      );
    let record = await find();
    if (isClassQuestions(work.reviewed_analysis)) {
      if (action === "deepening/student-get")
        return done({
          session,
          analysis: work.reviewed_analysis,
          record: record ? safeRecord(record) : null,
          title: work.title,
          author: work.author,
        });
      if (action !== "deepening/student-submit")
        fail(404, "이 수업에서는 질문에 대한 답변을 제출해 주세요.");
      const { student_label, answers } = classResponseSchema.parse(p);
      if (answers.length !== work.reviewed_analysis.questions.length)
        fail(400, "모든 질문에 답변해 주세요.");
      const submitted = check(
        await db.rpc("submit_deepening_class_response", {
          p_activity: activity.id,
          p_session: session.id,
          p_hash: hash,
          p_label: student_label,
          p_answers: answers,
        }),
      );
      return done(safeRecord(submitted));
    }
    const write = async (
      operation,
      data = {},
      label = record?.student_label || "",
    ) => {
      record = check(
        await db.rpc("write_deepening_record", {
          p_session: session.id,
          p_hash: hash,
          p_label: label,
          p_operation: operation,
          p_data: data,
          p_revision: record?.revision || 0,
        }),
      );
      return record;
    };
    if (action === "deepening/student-join") {
      const label = z.string().trim().min(1).max(40).parse(p.student_label);
      if (!record) await write("join", {}, label);
    }
    if (
      action === "deepening/student-get" ||
      action === "deepening/student-join"
    )
      return done({
        session,
        analysis: work.reviewed_analysis,
        record: record ? safeRecord(record) : null,
        title: work.title,
        author: work.author,
      });
    if (!record) fail(403, "학생 번호 또는 별칭으로 먼저 참여해 주세요.");
    if (action === "deepening/student-write") {
      if (p.revision !== record.revision)
        fail(
          409,
          "다른 창에서 기록이 변경되었습니다. 임시저장 내용을 유지한 채 최신 기록을 다시 불러와 주세요.",
        );
      let patch;
      try {
        patch = studentChange(record, p.operation, p.data, session);
      } catch (error) {
        if (error.name === "ZodError") throw error;
        fail(409, error.message);
      }
      await write(p.operation, patch);
      return done(safeRecord(record));
    }
    if (action === "deepening/student-questions") {
      if (record.questions) return done(safeRecord(record));
      if (!record.initial || session.status !== "OPEN")
        fail(409, "최초 판단을 제출하고 수업 시작 상태를 확인해 주세요.");
      const result = await cached(
        db,
        `questions:${record.id}`,
        () => studentQuestions(work.reviewed_analysis, record.initial),
        record.id,
      );
      record = await find();
      if (!record.questions)
        await write("questions", {
          questions: result.questions,
          question_source: result.source,
        });
      return done(safeRecord(record));
    }
    if (action === "deepening/student-peers") {
      if (!record.answers_submitted_at || session.visibility === "private")
        fail(403, "세 답변을 제출하고 선생님이 감상을 열면 볼 수 있습니다.");
      const peers = check(
        await db
          .from("deepening_records")
          .select("id,initial,questions,answers,reflection,completed_at")
          .eq("session_id", session.id)
          .not("answers_submitted_at", "is", null)
          .order("created_at")
          .limit(1000),
      );
      return done(peers.map(publicRecord).filter((r) => r.id !== record.id));
    }
  }
  fail(404, "지원하지 않는 심화 활동 요청입니다.");
}
