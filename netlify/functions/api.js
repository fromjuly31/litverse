import { z } from "zod";
import { archiveAction } from "../lib/archive.js";
import { lessonOwner, adminUser } from "../lib/lesson-access.js";
import {
  activitySchema,
  worksheetSchema,
  uploadSchema,
  aliasSchema,
  questionSchema,
  responseSchema,
  uuid,
  token as tokenSchema,
  code as codeSchema,
  idsSchema,
  validImageSignature,
} from "../lib/validation.js";
import {
  createServer,
  owner,
  ownedActivity,
  tokenActivity,
  studentRecord,
  check,
  hmac,
  newCode,
  activityTokens,
  cleanWorksheet,
  enrichActivity,
  signedImages,
  limit,
  fail,
  cleanup,
  runDeletion,
  errorResponse,
} from "../lib/server.js";
import { createPrompt, createScenePrompt } from "../../src/utils/domain.js";
export const config = { path: "/api/*" };
async function rows(queryFactory) {
  let all = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const batch = check(await queryFactory().range(offset, offset + 499));
    all.push(...batch);
    if (batch.length < 500) return all;
  }
  fail(
    413,
    "한 번에 조회할 수 있는 자료 수를 초과했습니다. 활동을 나누어 주세요.",
  );
}
export async function dispatch(db, req, context, action, p) {
  const archive = await archiveAction(db, req, context, action, p);
  if (archive.handled) return archive.value;
  if (action.startsWith("teacher/")) {
    const teacher = await lessonOwner(db, req, p.id ? uuid.parse(p.id) : null);
    await limit(db, `teacher:${teacher}`, 1200);
    if (action === "teacher/list")
      return rows(() =>
        db
          .from("activities")
          .select("id,title,author,class_name,stage,created_at")
          .eq("teacher_id", teacher)
          .eq("deletion_pending", false)
          .order("created_at", { ascending: false }),
      );
    if (action === "teacher/jobs")
      return check(
        await db
          .from("deletion_jobs")
          .select("id,target_type,status,error_message,not_before")
          .neq("status", "completed")
          .order("created_at")
          .limit(100),
      );
    if (action === "teacher/retry-cleanup") return cleanup(db);
    if (action === "teacher/save") {
      const input = activitySchema.parse(p.activity);
      const id = p.id ? uuid.parse(p.id) : crypto.randomUUID();
      let current;
      if (p.id) current = await ownedActivity(db, id, teacher);
      if (current?.finalized_at)
        fail(409, "완료한 수업입니다. 먼저 수업을 다시 열어 주세요.");
      const tokens = activityTokens({
        id,
        qr_version: current?.qr_version || 1,
      });
      const a = check(
        await db.rpc("save_lesson", {
          p_teacher: teacher,
          p_id: id,
          p_data: input,
          p_worksheet_hash: hmac(`qr:${tokens.worksheet_token}`),
          p_submission_hash: hmac(`qr:${tokens.submission_token}`),
        }),
      );
      return enrichActivity(db, a);
    }
    const id = uuid.parse(p.id);
    const a = await ownedActivity(db, id, teacher);
    if (
      a.finalized_at &&
      !["teacher/get", "teacher/background", "teacher/links"].includes(
        action,
      ) &&
      !(action === "teacher/delete-activity" && (await adminUser(db, req)))
    )
      fail(409, "완료한 수업입니다. 먼저 수업을 다시 열어 주세요.");
    if (action === "teacher/synopsis") {
      const synopsis = z.string().trim().max(1800).parse(p.synopsis);
      check(
        await db
          .from("activities")
          .update({ synopsis })
          .eq("id", id)
          .eq("teacher_id", teacher)
          .is("finalized_at", null)
          .select("id")
          .single(),
      );
      return { ok: true };
    }
    if (action === "teacher/background") {
      const [questions, responses, activity] = await Promise.all([
        rows(() =>
          db
            .from("background_questions")
            .select("*")
            .eq("activity_id", id)
            .order("created_at"),
        ),
        rows(() =>
          db
            .from("background_responses")
            .select(
              "id,activity_id,question_id,student_label,answer,created_at,updated_at",
            )
            .eq("activity_id", id)
            .order("created_at"),
        ),
        enrichActivity(db, a),
      ]);
      return { questions, responses, activity };
    }
    if (action === "teacher/question-save") {
      const input = questionSchema.parse(p);
      return check(
        await db
          .from("background_questions")
          .insert({ ...input, activity_id: id })
          .select("id")
          .single(),
      );
    }
    if (action === "teacher/question-update") {
      const questionId = uuid.parse(p.question_id),
        status = z.enum(["OPEN", "CLOSED"]).parse(p.status),
        summary = z.string().trim().max(5000).parse(p.summary);
      check(
        await db.rpc("publish_background_summary", {
          p_teacher: teacher,
          p_activity: id,
          p_question: questionId,
          p_summary: summary,
          p_status: status,
        }),
      );
      return { ok: true };
    }
    if (action === "teacher/get") {
      const [worksheets, images, activity] = await Promise.all([
        rows(() =>
          db
            .from("worksheets")
            .select("*")
            .eq("activity_id", id)
            .eq("deletion_pending", false)
            .order("created_at"),
        ),
        rows(() =>
          db
            .from("image_submissions")
            .select("*")
            .eq("activity_id", id)
            .eq("submission_status", "complete")
            .order("created_at"),
        ),
        enrichActivity(db, a),
      ]);
      return {
        activity,
        worksheets: worksheets.map(cleanWorksheet),
        images: await signedImages(db, images),
      };
    }
    if (action === "teacher/links") return activityTokens(a);
    if (action === "teacher/stage") {
      const stage = z
        .enum(["DRAFT", "BACKGROUND", "ANALYSIS", "SUBMISSION", "CLOSED"])
        .parse(p.stage);
      return check(
        await db
          .from("activities")
          .update({ stage })
          .is("finalized_at", null)
          .eq("id", id)
          .eq("teacher_id", teacher)
          .eq("deletion_pending", false)
          .select("id,stage")
          .single(),
      );
    }
    if (action === "teacher/moderate") {
      const ids = idsSchema.parse(p.ids);
      const status = z.enum(["approved", "pending", "hidden"]).parse(p.status);
      const eligible = check(
        await db
          .from("image_submissions")
          .select("id")
          .eq("activity_id", id)
          .eq("submission_status", "complete")
          .in("id", ids),
      );
      if (eligible.length !== ids.length)
        fail(403, "선택한 이미지에 접근할 수 없습니다.");
      check(
        await db
          .from("image_submissions")
          .update({ approval_status: status })
          .eq("activity_id", id)
          .eq("submission_status", "complete")
          .in("id", ids),
      );
      return { ok: true };
    }
    if (action === "teacher/aliases") {
      const aliases = aliasSchema.parse(p.aliases);
      check(
        await db.rpc("replace_aliases", {
          p_teacher: teacher,
          p_activity: id,
          p_aliases: aliases,
        }),
      );
      return { ok: true };
    }
    if (action === "teacher/reissue") {
      const worksheetId = uuid.parse(p.worksheet_id);
      const code = newCode();
      check(
        await db.rpc("rotate_student_code", {
          p_teacher: teacher,
          p_activity: id,
          p_worksheet: worksheetId,
          p_new_hash: hmac(`student:${code}`),
        }),
      );
      return { code };
    }
    const deletionTypes = {
      "teacher/delete-images": "images",
      "teacher/delete-worksheet": "worksheet",
      "teacher/delete-activity": "activity",
    };
    if (deletionTypes[action]) {
      const type = deletionTypes[action];
      const job = check(
        await db.rpc("queue_deletion", {
          p_teacher: teacher,
          p_activity: id,
          p_type: type,
          p_ids: type === "images" ? idsSchema.parse(p.ids) : [],
          p_target:
            type === "worksheet"
              ? uuid.parse(p.worksheet_id)
              : type === "activity"
                ? id
                : null,
        }),
      );
      await runDeletion(db, job.id);
      return { ok: true, job_id: job.id };
    }
    fail(404, "요청한 기능을 찾을 수 없습니다.");
  }
  if (action.startsWith("student/")) {
    // context.ip is set by Netlify. Never accept a caller-supplied forwarded-for value.
    await limit(
      db,
      `${action === "student/activity" ? "poll" : "student"}-ip:${context.ip || "local"}`,
      action === "student/activity" ? 5000 : 600,
      600,
    );
    const token = tokenSchema.parse(p.token);
    const kind = ["student/complete", "student/background-answer"].includes(
      action,
    )
      ? "analysis"
      : action.startsWith("student/upload")
        ? "submission"
        : null;
    const a = await tokenActivity(db, token, kind);
    if (action === "student/activity") return enrichActivity(db, a, true);
    const code = codeSchema.parse(p.code);
    await limit(db, `student-code:${code}`, 100, 600);
    if (action === "student/background-answer") {
      const input = responseSchema.parse(p);
      check(
        await db.rpc("save_background_response", {
          p_activity: a.id,
          p_question: input.question_id,
          p_hash: hmac(`student:${code}`),
          p_label: input.student_label,
          p_answer: input.answer,
        }),
      );
      return { ok: true };
    }
    if (action === "student/complete") {
      const input = worksheetSchema.parse(p.worksheet);
      input.generated_prompt = createPrompt(a, input);
      input.scene_prompt = createScenePrompt(a, input);
      const w = check(
        await db.rpc("save_worksheet", {
          p_activity: a.id,
          p_hash: hmac(`student:${code}`),
          p_data: input,
        }),
      );
      return { worksheet: cleanWorksheet(w), code };
    }
    const w = await studentRecord(db, a, code);
    if (action === "student/resume") {
      const images = check(
        await db
          .from("image_submissions")
          .select("*")
          .eq("worksheet_id", w.id)
          .eq("submission_status", "complete")
          .order("created_at"),
      );
      return {
        activity: await enrichActivity(db, a, true),
        worksheet: cleanWorksheet(w),
        images: await signedImages(db, images),
      };
    }
    if (action === "student/upload-init") {
      const input = uploadSchema.parse(p);
      const job = check(
        await db.rpc("reserve_upload", {
          p_activity: a.id,
          p_worksheet: w.id,
          p_id: input.request_id,
          p_data: input,
        }),
      );
      if (job.status === "complete") {
        const image = check(
          await db
            .from("image_submissions")
            .select("*")
            .eq("id", job.image_id)
            .eq("image_path", job.image_path)
            .eq("submission_status", "complete")
            .maybeSingle(),
        );
        if (!image)
          fail(
            409,
            "기존 업로드가 이미 교체되거나 삭제되었습니다. 이미지를 다시 선택해 주세요.",
          );
        return { completed: true, image: (await signedImages(db, [image]))[0] };
      }
      // Issue a token only during the original reservation window, preventing perpetual extension.
      if (Date.now() - new Date(job.created_at).getTime() > 10 * 60 * 1000)
        fail(
          409,
          "업로드 시간이 지났어요. 같은 요청은 더 이상 재시도할 수 없습니다. 정리 후 다시 제출해 주세요.",
        );
      const signed = check(
        await db.storage
          .from("literature-images")
          .createSignedUploadUrl(job.image_path),
      );
      return { id: job.id, path: job.image_path, token: signed.token };
    }
    if (action === "student/upload-complete") {
      const jobId = uuid.parse(p.job_id);
      const job = check(
        await db
          .from("upload_jobs")
          .select("*")
          .eq("id", jobId)
          .eq("worksheet_id", w.id)
          .eq("activity_id", a.id)
          .maybeSingle(),
      );
      if (!job) fail(403, "유효하지 않은 업로드입니다.");
      if (job.status !== "complete") {
        if (a.stage !== "SUBMISSION")
          fail(409, "이미지 제출이 종료되었습니다.");
        if (job.status !== "pending" || new Date(job.expires_at) < new Date())
          fail(409, "업로드 시간이 만료되었습니다.");
        const blob = check(
          await db.storage.from("literature-images").download(job.image_path),
        );
        if (
          blob.size !== job.size ||
          blob.size > 5242880 ||
          blob.type.split(";")[0] !== job.mime
        )
          fail(400, "업로드한 파일의 크기 또는 형식이 일치하지 않습니다.");
        const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
        if (!validImageSignature(bytes, job.mime))
          fail(400, "정상적인 JPG, PNG, WebP 파일만 제출할 수 있습니다.");
      }
      const image = check(
        await db.rpc("finalize_upload", {
          p_activity: a.id,
          p_worksheet: w.id,
          p_job: job.id,
        }),
      );
      return (await signedImages(db, [image]))[0];
    }
    fail(404, "요청한 기능을 찾을 수 없습니다.");
  }
  fail(404, "요청한 기능을 찾을 수 없습니다.");
}
export default async function handler(req, context = {}) {
  try {
    if (req.method !== "POST")
      return Response.json(
        { error: "POST 요청만 사용할 수 있습니다." },
        {
          status: 405,
          headers: { Allow: "POST", "Cache-Control": "no-store" },
        },
      );
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      fail(415, "JSON 요청만 지원합니다.");
    const origin = req.headers.get("origin");
    const url = new URL(req.url);
    const allowed = [
      process.env.SITE_URL,
      process.env.URL,
      process.env.DEPLOY_PRIME_URL,
      url.origin,
    ]
      .filter(Boolean)
      .map((v) => v.replace(/\/$/, ""));
    if (origin && !allowed.includes(origin))
      fail(403, "허용되지 않은 요청 출처입니다.");
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 131072)
      fail(413, "요청 데이터가 너무 큽니다.");
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      fail(400, "요청 형식이 올바르지 않습니다.");
    }
    if (!payload || Array.isArray(payload) || typeof payload !== "object")
      fail(400, "요청 형식이 올바르지 않습니다.");
    const action = url.pathname
      .replace(/^\/api\//, "")
      .replace(/^\/\.netlify\/functions\/api\//, "");
    const result = await dispatch(
      createServer(),
      req,
      context,
      action,
      payload,
    );
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
