import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { seedData } from "../src/services/seed.js";
import {
  demoAnalysis,
  personalizedFallback,
  studentChange,
  publicRecord,
  reviewedSchema,
  questionSchema,
} from "../src/utils/deepening.js";
import {
  analyzeWork,
  studentQuestions,
  analysisCacheKey,
} from "../netlify/lib/deepening-ai.js";

const input = { title: "운수 좋은 날", author: "현진건" };
const analysis = demoAnalysis(input).analysis;
const initial = {
  choice: "아내 곁에 머물며 돌본다",
  reason: "돌봄과 가족의 건강을 먼저 고려했기 때문입니다.",
  evidence: "아내가 병들어 있으며 함께 있어 달라고 하는 상황을 고려했습니다.",
};
test("genre-aware drafts, uncertain works and edition separation", () => {
  assert.equal(demoAnalysis(input).source, "example");
  const poem = demoAnalysis({ title: "서시", author: "윤동주" }).analysis;
  assert.equal(poem.genre, "poetry");
  assert.match(poem.opening_question, /화자/);
  assert.notEqual(poem.opening_question, analysis.opening_question);
  const unknown = demoAnalysis({ title: "확인되지 않은 책", author: "이름" });
  assert.equal(unknown.analysis.identified, false);
  assert.equal(unknown.analysis.characters, "");
  assert.throws(() => reviewedSchema.parse(unknown.analysis));
  assert.notEqual(
    analysisCacheKey(input),
    analysisCacheKey({ ...input, edition: "교과서 발췌본" }),
  );
  assert.equal(
    demoAnalysis({ ...input, source_text: "교사가 입력한 일부 지문" }).analysis
      .identified,
    false,
  );
});
test("fallback questions preserve three purposes and personalize both reasons and evidence", () => {
  const first = personalizedFallback(analysis, initial);
  const second = personalizedFallback(analysis, {
    ...initial,
    choice: "생계를 위해 일을 나간다",
    reason: "생활비와 치료비를 마련해야 하기 때문입니다.",
  });
  questionSchema.parse(first);
  questionSchema.parse(second);
  assert.deepEqual(Object.keys(first), ["context", "values", "life"]);
  assert.match(first.context, /아내/);
  assert.match(first.values, /돌봄/);
  assert.notDeepEqual(first, second);
  assert.throws(() =>
    questionSchema.parse({
      context: "같은 질문입니다?",
      values: "같은 질문입니다?",
      life: "같은 질문입니다?",
    }),
  );
});
test("AI structured output, malformed responses, quota failure and student policy gate", async () => {
  const names = [
    "OPENAI_API_KEY",
    "DEEPENING_STUDENT_AI_ENABLED",
    "DEEPENING_AI_POLICY_REVIEWED_AT",
    "DEEPENING_AI_PROVIDER",
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  let sent,
    calls = 0;
  const response = (value) => async (url, options) => {
    calls++;
    sent = JSON.parse(options.body);
    return Response.json({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(value) }] },
      ],
    });
  };
  try {
    process.env.OPENAI_API_KEY = "test-only";
    process.env.DEEPENING_AI_PROVIDER = "openai";
    const work = await analyzeWork(input, response(analysis));
    assert.equal(work.source, "ai");
    assert.equal(calls, 1);
    assert.equal(sent.store, false);
    assert.equal(sent.text.format.strict, true);
    const fallback = await analyzeWork(
      input,
      async () => new Response("quota", { status: 429 }),
    );
    assert.equal(fallback.source, "manual");
    assert.equal(fallback.analysis.identified, false);
    const malformed = await analyzeWork(input, response({ invented: true }));
    assert.equal(malformed.source, "manual");
    delete process.env.DEEPENING_STUDENT_AI_ENABLED;
    let called = false;
    const safe = await studentQuestions(analysis, initial, async () => {
      called = true;
      throw Error();
    });
    assert.equal(called, false);
    assert.equal(safe.source, "teacher");
    process.env.DEEPENING_STUDENT_AI_ENABLED = "true";
    process.env.DEEPENING_AI_POLICY_REVIEWED_AT = "2026-11-01";
    const qs = personalizedFallback(analysis, initial);
    assert.equal(
      (await studentQuestions(analysis, initial, response(qs))).source,
      "ai",
    );
    assert.deepEqual(Object.keys(JSON.parse(sent.input)), [
      "analysis",
      "initial",
    ]);
    assert.equal(
      (
        await studentQuestions(
          analysis,
          initial,
          response({ context: "only one" }),
        )
      ).source,
      "teacher",
    );
    assert.equal(
      (
        await studentQuestions(analysis, initial, async () => {
          throw new Error("offline");
        })
      ).source,
      "teacher",
    );
  } finally {
    for (const k of names)
      old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]);
  }
});
test("initial judgment is immutable, all reflection stances are equal and public records omit identity", () => {
  const record = {
    initial,
    questions: personalizedFallback(analysis, initial),
    answers: {
      context: "상황을 검토했습니다.",
      values: "다른 가치를 검토했습니다.",
      life: "삶과 연결했습니다.",
    },
    answers_submitted_at: "now",
    peer_viewed_at: "now",
  };
  assert.throws(() =>
    studentChange(
      record,
      "initial",
      { ...initial, choice: "다른 선택" },
      { status: "OPEN" },
    ),
  );
  assert.throws(() =>
    studentChange(
      record,
      "answer",
      { purpose: "context", answer: "새 답" },
      { status: "CLOSED" },
    ),
  );
  for (const stance of ["same", "changed", "expanded"])
    assert.ok(
      studentChange(
        record,
        "reflection",
        {
          stance,
          answer:
            "다른 관점을 검토하고 본문과 현실의 근거를 종합해서 내 생각을 정교하게 다듬었습니다.",
        },
        { status: "OPEN" },
      ).completed_at,
    );
  const safe = publicRecord({
    ...record,
    id: "r",
    student_label: "실명",
    participant_hash: "secret",
    worksheet_id: "private",
    activity_id: "private",
  });
  assert.equal(safe.display_name, "관점 01");
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(JSON.stringify(safe).includes("실명"), false);
});

test("deepening SQL migration preserves lessons, separates rounds and enforces privacy and concurrency", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const file of [
    "001_litverse.sql",
    "002_background_discussion.sql",
    "003_exhibition_archive.sql",
    "004_deepening.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  const teacher = randomUUID(),
    otherTeacher = randomUUID(),
    activity = randomUUID(),
    otherActivity = randomUUID(),
    session = randomUUID(),
    secondSession = randomUUID();
  await db.query("insert into auth.users values($1),($2)", [
    teacher,
    otherTeacher,
  ]);
  await db.query(
    "insert into teacher_profiles(id,email)values($1,'one@test'),($2,'two@test')",
    [teacher, otherTeacher],
  );
  const fixture = seedData();
  const rpc = async (name, args) =>
    (
      await db.query(
        `select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})) as result`,
        args,
      )
    ).rows[0].result;
  for (const [id, owner] of [
    [activity, teacher],
    [otherActivity, otherTeacher],
  ])
    await rpc("create_lesson", [
      owner,
      id,
      fixture.activities[0],
      `qr-${id}`,
      `upload-${id}`,
      "x".repeat(100),
    ]);
  await db.query("update activities set stage='SUBMISSION' where id=$1", [
    activity,
  ]);
  const worksheet = await rpc("save_worksheet", [
    activity,
    "original-student",
    fixture.worksheets[0],
  ]);
  const original = (
    await db.query(
      "select to_jsonb(w) as value from worksheets w where id=$1",
      [worksheet.id],
    )
  ).rows[0].value;
  const configure = (id = session, newRound = false) =>
    rpc("configure_deepening", [
      teacher,
      activity,
      id,
      input,
      analysis,
      analysis,
      "example",
      newRound,
      null,
      {},
    ]);
  const s = await configure();
  assert.equal(s.round, 1);
  const retry = await configure();
  assert.equal(retry.id, s.id);
  const control = (
    status = "OPEN",
    visibility = "private",
    phase = "deepening",
  ) =>
    rpc("control_deepening", [
      teacher,
      activity,
      session,
      status,
      visibility,
      phase,
    ]);
  await control();
  assert.equal(
    (await db.query("select stage from activities where id=$1", [activity]))
      .rows[0].stage,
    "SUBMISSION",
  );
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(w) as value from worksheets w where id=$1",
        [worksheet.id],
      )
    ).rows[0].value,
    original,
  );
  await assert.rejects(
    rpc("configure_deepening", [
      otherTeacher,
      activity,
      randomUUID(),
      input,
      analysis,
      analysis,
      "example",
      false,
      null,
      {},
    ]),
    /FORBIDDEN/,
  );
  let record = await rpc("write_deepening_record", [
    session,
    "original-student",
    "07번",
    "join",
    {},
    0,
  ]);
  assert.equal(record.worksheet_id, worksheet.id);
  const write = async (operation, data, revision = record.revision) => {
    record = await rpc("write_deepening_record", [
      session,
      "original-student",
      "07번",
      operation,
      data,
      revision,
    ]);
    return record;
  };
  await write("initial", { initial });
  await assert.rejects(
    write("initial", { initial: { ...initial, choice: "덮어쓰기" } }),
    /INITIAL_IMMUTABLE/,
  );
  const questions = personalizedFallback(analysis, initial);
  await write("questions", { questions, question_source: "teacher" });
  const beforeRevision = record.revision;
  await write("answer", {
    answers: { context: "현실의 조건을 살펴보았습니다." },
  });
  await assert.rejects(
    write(
      "answer",
      { answers: { life: "오래된 창의 덮어쓰기" } },
      beforeRevision,
    ),
    /REVISION_CONFLICT/,
  );
  await assert.rejects(write("submit-answers", {}), /THREE_ANSWERS_REQUIRED/);
  await write("answer", {
    answers: {
      context: "현실의 조건을 살펴보았습니다.",
      values: "상충하는 가치를 고려했습니다.",
      life: "현대 사회의 돌봄 문제와 연결합니다.",
    },
  });
  await write("submit-answers", {});
  await assert.rejects(write("viewed", {}), /PEERS_NOT_OPEN/);
  await control("OPEN", "class");
  await write("viewed", {});
  await write("reflection", {
    reflection: {
      stance: "same",
      answer:
        "다른 관점을 검토하고도 돌봄이 중요하다는 생각은 유지하지만 그 판단의 조건을 더 구체적으로 이해했습니다.",
    },
  });
  await assert.rejects(write("answer", { answers: {} }), /COMPLETED_READ_ONLY/);
  await control("CLOSED", "public");
  assert.equal(
    (await db.query("select count(*)::int n from deepening_exhibit_index"))
      .rows[0].n,
    1,
  );
  await configure(secondSession, true);
  assert.equal(
    (await db.query("select count(*)::int n from deepening_records")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from deepening_sessions")).rows[0]
      .n,
    2,
  );
  await db.exec(
    `set role authenticated;set request.jwt.claim.sub='${otherTeacher}'`,
  );
  assert.equal(
    (await db.query("select * from deepening_records")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select * from deepening_ai_jobs"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from deepening_exhibit_index"),
    /permission denied/,
  );
  await assert.rejects(
    rpc("write_deepening_record", [
      session,
      "original-student",
      "07번",
      "join",
      {},
      0,
    ]),
    /permission denied/,
  );
  await db.exec("reset role");
  const claims = await Promise.all([
    rpc("claim_deepening_ai", ["same-request"]),
    rpc("claim_deepening_ai", ["same-request"]),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  await db.query(
    "update worksheets set submission_code_hash='reissued-code' where id=$1",
    [worksheet.id],
  );
  assert.equal(
    (
      await db.query(
        "select participant_hash from deepening_records where id=$1",
        [record.id],
      )
    ).rows[0].participant_hash,
    "reissued-code",
  );
  await db.query(
    "insert into deepening_ai_jobs(key,state,record_id)values('student-cache','complete',$1)",
    [record.id],
  );
  await db.query("delete from worksheets where id=$1", [worksheet.id]);
  assert.equal(
    (await db.query("select * from deepening_records")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from deepening_ai_jobs where key='student-cache'",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from deepening_exhibit_index")).rows.length,
    0,
  );
  await db.query("update activities set deletion_pending=true where id=$1", [
    activity,
  ]);
  assert.equal(
    (await db.query("select * from deepening_exhibit_index")).rows.length,
    0,
  );
  await db.query("delete from activities where id=$1", [activity]);
  assert.equal(
    (await db.query("select * from deepening_records")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from literary_work_versions")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from activities")).rows[0].n,
    1,
  );
});
