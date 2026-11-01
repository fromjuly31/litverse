import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  hashPassword,
  verifyPassword,
  issueAccess,
  verifyAccess,
} from "../netlify/lib/lesson-access.js";
import { generateSynopsis } from "../netlify/lib/synopsis.js";
import { runDeletion } from "../netlify/lib/server.js";
import { finalResult, publicLesson } from "../src/utils/archive.js";
import { seedData } from "../src/services/seed.js";

test("password hashes are salted and grants are scoped, expiring and versioned", async () => {
  process.env.TOKEN_SECRET = "test-only-token-secret-of-at-least-32-characters";
  const first = await hashPassword("class-password"),
    second = await hashPassword("class-password");
  assert.notEqual(first, second);
  assert.ok(!first.includes("class-password"));
  assert.ok(await verifyPassword("class-password", first));
  assert.equal(await verifyPassword("wrong-password", first), false);
  await assert.rejects(hashPassword("short"));
  const { token } = issueAccess("lesson-one", 1);
  assert.ok(verifyAccess(token, "lesson-one", 1));
  assert.equal(verifyAccess(token, "lesson-two", 1), false);
  assert.equal(verifyAccess(token, "lesson-one", 2), false);
  assert.equal(verifyAccess(`${token}x`, "lesson-one", 1), false);
  const now = Date.now;
  Date.now = () => now() + 3 * 60 * 60 * 1000;
  try {
    assert.equal(verifyAccess(token, "lesson-one", 1), false);
  } finally {
    Date.now = now;
  }
});

test("AI summary handles schema, unknown works, refusal and missing configuration", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    let sent;
    const fetcher = async (url, options) => {
      sent = JSON.parse(options.body);
      assert.equal(url, "https://api.openai.com/v1/responses");
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  identified: true,
                  synopsis: "테스트 작품 줄거리입니다.",
                  note: "원문과 대조해 주세요.",
                }),
              },
            ],
          },
        ],
      });
    };
    const result = await generateSynopsis(
      { title: "동백꽃", author: "김유정" },
      fetcher,
    );
    assert.equal(result.source, "ai");
    assert.equal(sent.store, false);
    assert.equal(sent.text.format.type, "json_schema");
    await assert.rejects(
      generateSynopsis({ title: "없는 작품", author: "미상" }, async () =>
        Response.json({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    identified: false,
                    synopsis: "",
                    note: "",
                  }),
                },
              ],
            },
          ],
        }),
      ),
      (e) => e.status === 422,
    );
    await assert.rejects(
      generateSynopsis({ title: "작품", author: "작가" }, async () =>
        Response.json({
          status: "completed",
          output: [{ content: [{ type: "refusal", refusal: "no" }] }],
        }),
      ),
      (e) => e.status === 502,
    );
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(
      generateSynopsis({ title: "작품", author: "작가" }, fetcher),
      (e) => e.status === 503,
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("poster snapshot excludes credentials, requires two different image types and keeps escaped text as data", () => {
  const s = seedData(),
    a = s.activities[0],
    imgs = s.images.filter((i) => i.activity_id === a.id);
  const input = {
    character_image_id: imgs.find((i) => i.image_type === "character").id,
    scene_image_id: imgs.find((i) => i.image_type === "scene").id,
    synopsis: "줄거리",
    temporal_background: "봄",
    spatial_background: "농촌",
    character_summary: "성격",
    scene_summary: "사건",
    signature: "<script>name</script>",
  };
  const result = finalResult(a, s.worksheets, imgs, input);
  assert.equal(result.signature, input.signature);
  assert.ok(!JSON.stringify(result).includes("submission_code"));
  assert.ok(!("worksheet_token" in publicLesson(a)));
  assert.ok(!("introduction" in publicLesson(a)));
  assert.throws(() =>
    finalResult(a, s.worksheets, imgs, {
      ...input,
      scene_image_id: input.character_image_id,
    }),
  );
  assert.throws(() =>
    finalResult(a, s.worksheets, imgs, { ...input, signature: "" }),
  );
  assert.throws(() =>
    finalResult(
      a,
      s.worksheets,
      imgs.map((i) => ({ ...i, submission_status: "deleting" })),
      input,
    ),
  );
});

test("archive migration atomically preserves the pair, locks finalized classes and retries physical cleanup", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of [
    "001_litverse",
    "002_background_discussion",
    "003_exhibition_archive",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );
  const teacher = randomUUID(),
    other = randomUUID(),
    id = randomUUID();
  await db.query("insert into auth.users values($1),($2)", [teacher, other]);
  await db.query(
    "insert into teacher_profiles(id,email,is_admin) values($1,'admin@test',true),($2,'other@test',false)",
    [teacher, other],
  );
  const call = async (name, args) =>
    (
      await db.query(
        `select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})) as result`,
        args,
      )
    ).rows[0].result;
  const a = seedData().activities[0];
  await call("create_lesson", [
    teacher,
    id,
    JSON.stringify(a),
    "qr-worksheet",
    "qr-submit",
    await hashPassword("class-password"),
  ]);
  assert.equal(
    (await db.query("select version from lesson_access")).rows[0].version,
    1,
  );
  await call("reset_lesson_password", [id, await hashPassword("new-password")]);
  assert.equal(
    (await db.query("select version from lesson_access")).rows[0].version,
    2,
  );
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select * from lesson_access"),
    /permission denied/,
  );
  await assert.rejects(
    call("finalize_lesson", [teacher, id, "{}"]),
    /permission denied/,
  );
  await db.exec("reset role");
  const w1 = randomUUID(),
    w2 = randomUUID();
  for (const w of [w1, w2])
    await db.query(
      `insert into worksheets(id,activity_id,student_label,character_name,character_selection_reason,personality_description,personality_tags,textual_evidence,evidence_explanation,imagined_appearance,generated_prompt,submission_code_hash) values($1,$2,'01','인물','이유','성격','{}','근거','설명','모습','프롬프트',$3)`,
      [w, id, w],
    );
  const portrait = randomUUID(),
    scene = randomUUID(),
    loser = randomUUID();
  for (const [i, w, type] of [
    [portrait, w1, "character"],
    [scene, w1, "scene"],
    [loser, w2, "character"],
  ])
    await db.query(
      `insert into image_submissions(id,activity_id,worksheet_id,image_type,image_path,hashtags,one_line_description) values($1,$2,$3,$4,$5,'{}','사진')`,
      [i, id, w, type, `${id}/${i}.webp`],
    );
  await db.query(
    "insert into upload_jobs(id,activity_id,worksheet_id,image_type,slot,image_path,mime,size,hashtags,one_line_description) values($1,$2,$3,'scene',0,$4,'image/webp',100,'{}','대기 사진')",
    [randomUUID(), id, w2, `${id}/pending.webp`],
  );
  const result = {
    title: a.title,
    author: a.author,
    synopsis: "줄거리",
    temporal_background: "봄",
    spatial_background: "농촌",
    signature: "제작자",
    character: { image_id: portrait, description: "성격" },
    scene: { image_id: scene, description: "사건" },
  };
  await assert.rejects(
    call("finalize_lesson", [other, id, JSON.stringify(result)]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call("finalize_lesson", [
      teacher,
      id,
      JSON.stringify({ ...result, scene: { image_id: portrait } }),
    ]),
    /FORBIDDEN/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from image_submissions where submission_status='complete'",
      )
    ).rows[0].n,
    3,
  );
  await call("select_final_image", [teacher, id, portrait, "character"]);
  const saved = await call("finalize_lesson", [
    teacher,
    id,
    JSON.stringify(result),
  ]);
  assert.equal(saved.removed, 1);
  assert.equal(saved.jobs.length, 2);
  const activity = (
    await db.query("select stage,finalized_at from activities where id=$1", [
      id,
    ])
  ).rows[0];
  assert.equal(activity.stage, "CLOSED");
  assert.ok(activity.finalized_at);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from image_submissions where submission_status='complete'",
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select status from upload_jobs")).rows[0].status,
    "expired",
  );
  await assert.rejects(
    call("select_final_image", [teacher, id, loser, "character"]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call("save_lesson", [
      teacher,
      id,
      JSON.stringify(a),
      "qr-worksheet",
      "qr-submit",
    ]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call("queue_deletion", [teacher, id, "images", [portrait], null]),
    /STAGE_CLOSED/,
  );
  assert.equal(
    (await call("finalize_lesson", [teacher, id, JSON.stringify(result)]))
      .removed,
    0,
  );
  const removedPaths = [];
  let failOnce = true;
  const adapter = {
    rpc: async (name, p) => {
      try {
        return { data: await call(name, Object.values(p)) };
      } catch (error) {
        return { error };
      }
    },
    storage: {
      from: () => ({
        remove: async (paths) => {
          if (failOnce) {
            failOnce = false;
            return { error: new Error("storage offline") };
          }
          removedPaths.push(...paths);
          return { data: [] };
        },
      }),
    },
    from: () => ({
      update: (values) => ({
        eq: async (_key, jobId) => {
          await db.query(
            "update deletion_jobs set status=$1,error_message=$2,lease_until=null where id=$3",
            [values.status, values.error_message, jobId],
          );
          return { data: null };
        },
      }),
    }),
  };
  await assert.rejects(
    runDeletion(adapter, saved.jobs[0]),
    (e) => e.status === 503,
  );
  assert.equal(
    (
      await db.query("select status from deletion_jobs where id=$1", [
        saved.jobs[0],
      ])
    ).rows[0].status,
    "failed",
  );
  assert.equal(
    (await db.query("select count(*)::int n from image_submissions")).rows[0].n,
    3,
  );
  await runDeletion(adapter, saved.jobs[0]);
  assert.deepEqual(removedPaths, [`${id}/${loser}.webp`]);
  assert.deepEqual(
    (await db.query("select id from image_submissions order by id")).rows.map(
      (r) => r.id,
    ),
    [portrait, scene].sort(),
  );
  assert.equal(
    (await db.query("select count(*)::int n from worksheets")).rows[0].n,
    2,
  );
  await call("queue_deletion", [teacher, id, "activity", [], id]);
});
