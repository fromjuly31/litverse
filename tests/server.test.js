import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { seedData } from "../src/services/seed.js";
test("PostgreSQL migration, access policies, atomic uploads and cleanup", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `create schema auth; create schema storage; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_litverse.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/002_background_discussion.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const teacher = randomUUID(),
    otherTeacher = randomUUID(),
    activityId = randomUUID();
  await db.query("insert into auth.users values ($1),($2)", [
    teacher,
    otherTeacher,
  ]);
  await db.query(
    "insert into teacher_profiles(id,email) values ($1,$2),($3,$4)",
    [teacher, "teacher@example.test", otherTeacher, "other@example.test"],
  );
  const fixture = seedData();
  const activity = {
    ...fixture.activities[0],
    settings: {
      allow_resubmit: true,
      require_approval: true,
      enable_scene: true,
      max_images: 1,
    },
  };
  const call = async (name, args) => {
    const params = Object.values(args);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
    const result = await db.query(
      `select to_jsonb(public.${name}(${placeholders})) as result`,
      params,
    );
    return result.rows[0].result;
  };
  await call("save_activity", {
    teacher,
    id: activityId,
    data: JSON.stringify(activity),
    worksheetHash: "analysis-test",
    submissionHash: "submission-test",
  });
  await db.query("update activities set stage='SUBMISSION' where id=$1", [
    activityId,
  ]);
  let worksheet, image, job;
  await t.test(
    "background questions accept one response per student, protect privacy and publish teacher summaries",
    async () => {
      const questionId = randomUUID();
      await db.query("update activities set stage='BACKGROUND' where id=$1", [
        activityId,
      ]);
      await db.query(
        "insert into background_questions(id,activity_id,kind,prompt) values($1,$2,'temporal','시간적 배경을 보여주는 본문 속 단서는 무엇인가요?')",
        [questionId, activityId],
      );
      await call("save_background_response", {
        a: activityId,
        q: questionId,
        hash: "respondent-hash",
        label: "07번",
        answer: "노란 동백꽃과 농사일을 보고 봄이라고 생각했습니다.",
      });
      await call("save_background_response", {
        a: activityId,
        q: questionId,
        hash: "respondent-hash",
        label: "07번",
        answer: "봄꽃이 피는 모습과 농사일을 바탕으로 봄이라고 해석했습니다.",
      });
      assert.equal(
        (await db.query("select count(*)::int as n from background_responses"))
          .rows[0].n,
        1,
      );
      await db.exec(
        `set role authenticated;set request.jwt.claim.sub='${otherTeacher}';`,
      );
      assert.equal(
        (await db.query("select * from background_responses")).rows.length,
        0,
      );
      await db.exec("reset role");
      await db.exec("set role anon");
      await assert.rejects(
        db.query("select * from background_responses"),
        /permission denied/,
      );
      await db.exec("reset role");
      await assert.rejects(
        call("publish_background_summary", {
          teacher: otherTeacher,
          a: activityId,
          q: questionId,
          summary: "다른 교사 정리",
          status: "CLOSED",
        }),
        /FORBIDDEN/,
      );
      await call("publish_background_summary", {
        teacher,
        a: activityId,
        q: questionId,
        summary: "봄꽃과 농사일을 근거로 봄철의 농촌을 생각할 수 있습니다.",
        status: "CLOSED",
      });
      assert.match(
        (
          await db.query(
            "select temporal_background from activities where id=$1",
            [activityId],
          )
        ).rows[0].temporal_background,
        /봄꽃/,
      );
      await assert.rejects(
        call("save_background_response", {
          a: activityId,
          q: questionId,
          hash: "late",
          label: "08번",
          answer: "마감 후 제출을 시도하는 응답입니다.",
        }),
        /BACKGROUND_CLOSED/,
      );
      await db.query("update activities set stage='SUBMISSION' where id=$1", [
        activityId,
      ]);
    },
  );
  await t.test(
    "activity ownership and service-only RPC permissions",
    async () => {
      await assert.rejects(
        call("save_activity", {
          teacher: otherTeacher,
          id: activityId,
          data: JSON.stringify(activity),
          worksheetHash: "x",
          submissionHash: "y",
        }),
        /FORBIDDEN/,
      );
      await db.exec(
        `set role authenticated; set request.jwt.claim.sub='${otherTeacher}';`,
      );
      assert.equal((await db.query("select * from activities")).rows.length, 0);
      await assert.rejects(
        db.query("select consume_rate_limit('x',1,60)"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("insert into activities(id) values(gen_random_uuid())"),
        /permission denied/,
      );
      await db.exec(`set request.jwt.claim.sub='${teacher}';`);
      assert.equal((await db.query("select * from activities")).rows.length, 1);
      await db.exec("reset role");
    },
  );
  await t.test(
    "worksheet retries are idempotent and closed stages reject changes",
    async () => {
      worksheet = await call("save_worksheet", {
        a: activityId,
        hash: "student-hash",
        data: JSON.stringify(fixture.worksheets[0]),
      });
      const repeated = await call("save_worksheet", {
        a: activityId,
        hash: "student-hash",
        data: JSON.stringify(fixture.worksheets[0]),
      });
      assert.equal(worksheet.id, repeated.id);
      assert.equal(
        (await db.query("select count(*)::int as n from worksheets")).rows[0].n,
        1,
      );
      await db.query("update activities set stage='CLOSED' where id=$1", [
        activityId,
      ]);
      await assert.rejects(
        call("save_worksheet", {
          a: activityId,
          hash: "student-hash",
          data: JSON.stringify(fixture.worksheets[0]),
        }),
        /STAGE_CLOSED/,
      );
      await db.query("update activities set stage='SUBMISSION' where id=$1", [
        activityId,
      ]);
    },
  );
  const upload = (overrides = {}) => ({
    image_type: "character",
    slot: 0,
    size: 128,
    mime: "image/webp",
    hashtags: ["소심함", "책임감"],
    one_line_description: "작품 속 근거에 바탕을 둔 인물의 모습",
    ...overrides,
  });
  await t.test(
    "code reissue revokes the old code, including attempts to create a new worksheet",
    async () => {
      await call("rotate_student_code", {
        teacher,
        a: activityId,
        w: worksheet.id,
        hash: "new-student-hash",
      });
      await assert.rejects(
        call("save_worksheet", {
          a: activityId,
          hash: "student-hash",
          data: JSON.stringify(fixture.worksheets[0]),
        }),
        /FORBIDDEN/,
      );
      const same = await call("save_worksheet", {
        a: activityId,
        hash: "new-student-hash",
        data: JSON.stringify(fixture.worksheets[0]),
      });
      assert.equal(same.id, worksheet.id);
      await assert.rejects(
        call("save_worksheet", {
          a: activityId,
          hash: "incomplete",
          data: JSON.stringify({ ...fixture.worksheets[0], scene: {} }),
        }),
        /SCENE_REQUIRED/,
      );
    },
  );
  const reserve = (w, data = upload()) =>
    call("reserve_upload", {
      a: activityId,
      w: w.id,
      id: randomUUID(),
      data: JSON.stringify(data),
    });
  await t.test(
    "simultaneous reservations never create duplicate slots and finalization is idempotent",
    async () => {
      const [first, second] = await Promise.all([
        reserve(worksheet),
        reserve(worksheet),
      ]);
      job = first;
      image = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: first.id,
      });
      const again = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: first.id,
      });
      assert.equal(image.id, again.id);
      await assert.rejects(
        call("finalize_upload", {
          a: activityId,
          w: worksheet.id,
          j: second.id,
        }),
        /UPLOAD_CONFLICT/,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from image_submissions"))
          .rows[0].n,
        1,
      );
      assert.equal(image.approval_status, "pending");
    },
  );
  await t.test(
    "closed stage is rechecked at finalization and replacement queues old files",
    async () => {
      const replacement = await reserve(worksheet);
      await db.query("update activities set stage='CLOSED' where id=$1", [
        activityId,
      ]);
      await assert.rejects(
        call("finalize_upload", {
          a: activityId,
          w: worksheet.id,
          j: replacement.id,
        }),
        /STAGE_CLOSED/,
      );
      await db.query("update activities set stage='SUBMISSION' where id=$1", [
        activityId,
      ]);
      const newer = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: replacement.id,
      });
      assert.equal(newer.id, image.id);
      assert.notEqual(newer.image_path, image.image_path);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from deletion_jobs where target_type='orphan'",
          )
        ).rows[0].n,
        2,
      );
      await assert.rejects(
        call("finalize_upload", { a: activityId, w: worksheet.id, j: job.id }),
        /UPLOAD_SUPERSEDED/,
      );
      image = newer;
    },
  );
  await t.test(
    "image deletion leaves analysis intact and makes its slot available again",
    async () => {
      await assert.rejects(
        call("queue_deletion", {
          teacher: otherTeacher,
          a: activityId,
          type: "images",
          ids: [image.id],
          target: null,
        }),
        /FORBIDDEN/,
      );
      const deletion = await call("queue_deletion", {
        teacher,
        a: activityId,
        type: "images",
        ids: [image.id],
        target: null,
      });
      const claimed = await call("claim_deletion", { id: deletion.id });
      assert.equal(claimed.status, "running");
      await call("finish_deletion", { id: deletion.id });
      assert.equal(
        (await db.query("select count(*)::int as n from worksheets")).rows[0].n,
        1,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from image_submissions"))
          .rows[0].n,
        0,
      );
      const fresh = await reserve(worksheet);
      assert.equal(fresh.expected_revision, null);
    },
  );
  await t.test("persistent request limits survive separate calls", async () => {
    assert.equal(
      await call("consume_rate_limit", { key: "limited", max: 2, window: 60 }),
      true,
    );
    assert.equal(
      await call("consume_rate_limit", { key: "limited", max: 2, window: 60 }),
      true,
    );
    assert.equal(
      await call("consume_rate_limit", { key: "limited", max: 2, window: 60 }),
      false,
    );
  });
  await t.test(
    "30 concurrent worksheet requests and 60 image records",
    async () => {
      const students = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          call("save_worksheet", {
            a: activityId,
            hash: `load-${i}`,
            data: JSON.stringify({
              ...fixture.worksheets[i % 4],
              student_label: `load-${i}`,
            }),
          }),
        ),
      );
      const jobs = await Promise.all(
        students.flatMap((w) =>
          ["character", "scene"].map((image_type) =>
            reserve(w, upload({ image_type })).then((j) => ({ w, j })),
          ),
        ),
      );
      const results = await Promise.all(
        jobs.map(({ w, j }) =>
          call("finalize_upload", { a: activityId, w: w.id, j: j.id }),
        ),
      );
      assert.equal(results.length, 60);
      assert.equal(new Set(results.map((i) => i.id)).size, 60);
      const analytics = await db.query(
        "select count(distinct worksheet_id)::int as students,count(*)::int as images from image_submissions",
      );
      assert.deepEqual(analytics.rows[0], { students: 30, images: 60 });
    },
  );
  await t.test(
    "deleting activity blocks incoming writes and cascades its records",
    async () => {
      const deletion = await call("queue_deletion", {
        teacher,
        a: activityId,
        type: "activity",
        ids: [],
        target: activityId,
      });
      await assert.rejects(
        call("save_worksheet", {
          a: activityId,
          hash: "late",
          data: JSON.stringify(fixture.worksheets[0]),
        }),
        /STAGE_CLOSED/,
      );
      await call("claim_deletion", { id: deletion.id });
      await call("finish_deletion", { id: deletion.id });
      assert.equal(
        (await db.query("select count(*)::int as n from worksheets")).rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from image_submissions"))
          .rows[0].n,
        0,
      );
      assert.ok(
        (
          await db.query(
            "select count(*)::int as n from deletion_jobs where target_type='orphan' and not_before>now()",
          )
        ).rows[0].n > 0,
      );
    },
  );
});
