import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { seedData } from "../src/services/seed.js";
import {
  attachDocentDraft,
  pcmToWav,
  saveDocentDraft,
  synthesizeDocent,
} from "../netlify/lib/docent.js";
import { signedImages } from "../netlify/lib/server.js";

test("docent synthesis creates a described voice and stores up to 20 seconds of WAV audio", async () => {
  const socket = new EventEmitter();
  const sent = [];
  const providerRequests = [];
  const event = (value) => socket.emit("message", JSON.stringify(value));
  socket.send = (value) => {
    const message = JSON.parse(value);
    sent.push(message);
    if (message.type === "session.close") event({ type: "session.closed" });
  };
  socket.close = () => socket.emit("close");
  const script = "이 장면을 함께 읽어 보세요.";
  const description = "친절하고 나이 많은 할아버지 같은 목소리";
  const output = synthesizeDocent(
    { script, voice_description: description },
    {
      key: "test-key",
      fetcher: async (url, options) => {
        providerRequests.push([url, options]);
        return Response.json({ id: "voice_test" });
      },
      connect: (url) => {
        assert.equal(url, "wss://api.openai.com/v1/live/sessions");
        setImmediate(() => {
          socket.emit("open");
          event({ type: "session.started" });
          event({
            type: "session.output_audio.delta",
            delta: Buffer.from([120, 0, 140, 0]).toString("base64"),
          });
          event({ type: "session.output_transcript.delta", delta: script });
          event({
            type: "session.output_audio.delta",
            delta: Buffer.alloc(28800).toString("base64"),
          });
        });
        return socket;
      },
    },
  );
  const audio = await output;
  assert.ok(
    JSON.parse(providerRequests[0][1].body).prompt.includes(description),
  );
  assert.equal(providerRequests[1][1].method, "DELETE");
  assert.equal(sent[0].session.audio.output.voice.id, "voice_test");
  assert.ok(sent[0].session.input[0].content[0].text.includes(script));
  assert.equal(sent[1].type, "session.input_audio.append");
  assert.equal(audio.toString("ascii", 0, 4), "RIFF");
  assert.equal(audio.readUInt32LE(24), 24000);
  assert.deepEqual([...audio.subarray(44, 48)], [120, 0, 140, 0]);
  assert.equal(pcmToWav([Buffer.alloc(960000)]).length, 960044);
  assert.throws(
    () => pcmToWav([Buffer.alloc(960002)]),
    /Invalid narration audio/,
  );
});

test("scene audio is uploaded once and only signed when playback is requested", async () => {
  const files = new Map();
  const db = {
    rpc: async () => ({ data: true }),
    from: () => ({
      select: () => ({
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: { id: "worksheet" } }),
      }),
    }),
    storage: {
      from: (bucket) => ({
        exists: async (path) =>
          files.has(`${bucket}/${path}`)
            ? { data: true, error: null }
            : { data: false, error: { status: 404 } },
        upload: async (path, bytes, options) => {
          assert.equal(options.contentType, "audio/wav");
          files.set(`${bucket}/${path}`, bytes);
          return { data: { path } };
        },
        copy: async (source, destination) => {
          files.set(
            `${bucket}/${destination}`,
            files.get(`${bucket}/${source}`),
          );
          return { data: { path: destination } };
        },
        createSignedUrl: async (path) => ({
          data: { signedUrl: `https://storage.test/${bucket}/${path}` },
        }),
        createSignedUrls: async (paths) => ({
          data: paths.map((path) => ({
            signedUrl: `https://storage.test/${bucket}/${path}`,
          })),
        }),
      }),
    },
  };
  const docent = {
    script: "이 장면의 두 인물을 살펴보세요.",
    voice_description: "따뜻한 목소리",
  };
  const image = {
    id: randomUUID(),
    activity_id: "lesson",
    worksheet_id: randomUUID(),
    image_path: "lesson/work/scene.webp",
    docent,
  };
  const generate = async (narration) => {
    assert.deepEqual(narration, docent);
    return pcmToWav([Buffer.from([1, 0, 2, 0])]);
  };
  process.env.TOKEN_SECRET ||= "test-only-secret-of-at-least-32-characters";
  await assert.rejects(attachDocentDraft(db, image), { status: 409 });
  const saved = await saveDocentDraft(
    db,
    image.activity_id,
    image.worksheet_id,
    docent,
    generate,
  );
  assert.match(saved.audio_url, /\/literature-docents\/drafts\//);
  await saveDocentDraft(db, image.activity_id, image.worksheet_id, docent, () =>
    assert.fail("An existing file should be reused"),
  );
  await assert.rejects(
    attachDocentDraft(db, {
      ...image,
      docent: { ...docent, script: "바뀐 대본" },
    }),
    { status: 409 },
  );
  await attachDocentDraft(db, image);
  await attachDocentDraft(db, image);
  assert.equal(
    files
      .get("literature-docents/lesson/work/scene.wav")
      .toString("ascii", 8, 12),
    "WAVE",
  );
  const [full] = await signedImages(db, [image]);
  const [compact] = await signedImages(db, [image], { withAudio: false });
  assert.equal(
    full.docent.audio_url,
    "https://storage.test/literature-docents/lesson/work/scene.wav",
  );
  assert.equal(compact.docent, undefined);
});

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
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/005_submission_questions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await t.test(
    "PDF originals use a private bucket without broadening student image uploads",
    async () => {
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/006_text_study.sql", import.meta.url),
          "utf8",
        ),
      );
      const buckets = (
        await db.query(
          "select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id",
        )
      ).rows;
      const pdf = buckets.find((bucket) => bucket.id === "literature-texts");
      const images = buckets.find(
        (bucket) => bucket.id === "literature-images",
      );
      assert.equal(pdf.public, false);
      assert.equal(Number(pdf.file_size_limit), 40 * 1024 * 1024);
      assert.deepEqual(pdf.allowed_mime_types, ["application/pdf"]);
      assert.equal(Number(images.file_size_limit), 5 * 1024 * 1024);
      assert.ok(!images.allowed_mime_types.includes("application/pdf"));
    },
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
    "photo questions and answers survive reservation, retries and replacement",
    async () => {
      const questions = [
        "내가 파악한 인물의 특징은?",
        "사진에 어떻게 표현했나요?",
      ];
      await db.query(
        "update activities set settings=jsonb_set(settings,'{submission_questions}',$2::jsonb) where id=$1",
        [activityId, JSON.stringify(questions)],
      );
      await assert.rejects(reserve(worksheet), /INVALID_QUESTION_RESPONSES/);
      const responses = questions.map((question, index) => ({
        question,
        answer: `사진과 연결한 나의 해석 ${index + 1}`,
      }));
      await assert.rejects(
        reserve(
          worksheet,
          upload({ question_responses: [...responses, responses[0]] }),
        ),
        /INVALID_QUESTION_RESPONSES/,
      );
      await assert.rejects(
        reserve(
          worksheet,
          upload({
            question_responses: responses.map((response) => ({
              ...response,
              answer: " ",
            })),
          }),
        ),
        /INVALID_QUESTION_RESPONSES/,
      );
      const reserved = await reserve(
        worksheet,
        upload({ question_responses: responses }),
      );
      assert.deepEqual(reserved.question_responses, responses);
      const saved = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: reserved.id,
      });
      assert.deepEqual(saved.question_responses, responses);
      const again = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: reserved.id,
      });
      assert.deepEqual(again.question_responses, responses);
      const revised = responses.map((response) => ({
        ...response,
        answer: "수정한 사진 해석",
      }));
      const replacement = await reserve(
        worksheet,
        upload({ question_responses: revised }),
      );
      const replaced = await call("finalize_upload", {
        a: activityId,
        w: worksheet.id,
        j: replacement.id,
      });
      assert.deepEqual(replaced.question_responses, revised);
      assert.equal(replaced.id, saved.id);
    },
  );
  await t.test(
    "scene narration stays linked on retries and cannot be attached to a portrait",
    async () => {
      await db.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20261121052826_scene_audio_docents.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const docent = {
        script: "두 인물의 마음이 엇갈리는 장면입니다.",
        voice_description: "차분하고 밝은 목소리",
      };
      const question_responses = [
        "내가 파악한 인물의 특징은?",
        "사진에 어떻게 표현했나요?",
      ].map((question) => ({
        question,
        answer: "본문에 나오는 행동을 표현했습니다.",
      }));
      const reserveDocent = (id, type, narration) =>
        call("reserve_docent_upload", {
          a: activityId,
          w: worksheet.id,
          id,
          d: JSON.stringify(upload({ image_type: type, question_responses })),
          docent: narration ? JSON.stringify(narration) : null,
        });
      await assert.rejects(
        reserveDocent(randomUUID(), "character", docent),
        /INVALID_DOCENT/,
      );
      const job = await reserveDocent(randomUUID(), "scene", docent);
      assert.deepEqual(job.docent, docent);
      await assert.rejects(
        reserveDocent(job.id, "scene", {
          ...docent,
          voice_description: "낮고 느린 목소리",
        }),
        /INVALID_DOCENT/,
      );
      const finalize = (jobId) =>
        call("finalize_docent_upload", {
          a: activityId,
          w: worksheet.id,
          j: jobId,
        });
      const saved = await finalize(job.id);
      assert.deepEqual(saved.docent, docent);
      assert.equal((await finalize(job.id)).id, saved.id);
      const replacement = await reserveDocent(randomUUID(), "scene", null);
      assert.equal((await finalize(replacement.id)).docent, null);
      await assert.rejects(finalize(job.id), /UPLOAD_SUPERSEDED/);
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
