import { z } from "zod";
import { activitySchema, uuid } from "./validation.js";
import {
  check,
  fail,
  limit,
  activityTokens,
  hmac,
  enrichActivity,
  signedImages,
  runDeletion,
} from "./server.js";
import {
  adminUser,
  lessonOwner,
  hashPassword,
  verifyPassword,
  issueAccess,
} from "./lesson-access.js";
import { finalResult, publicLesson } from "../../src/utils/archive.js";
import { generateSynopsis } from "./synopsis.js";

export async function archiveAction(db, req, context, action, p) {
  const done = (value) => ({ handled: true, value });
  if (action === "admin/session")
    return done({
      configured: true,
      authenticated: !!(await adminUser(db, req)),
    });
  if (action.startsWith("public/") || action === "lesson/unlock")
    await limit(db, `archive:${context.ip || "local"}`, 300, 600);
  if (action === "public/synopsis") {
    await limit(db, `synopsis:${context.ip || "local"}`, 12, 3600);
    return done(await generateSynopsis(p));
  }
  if (["public/list", "public/exhibits", "public/exhibit"].includes(action)) {
    const fields =
      "id,title,author,course_name,class_name,stage,created_at,updated_at,finalized_at,signature";
    if (action === "public/list") {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const batch = check(
          await db
            .from("activities")
            .select(fields)
            .eq("deletion_pending", false)
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 499),
        );
        all.push(...batch.map(publicLesson));
        if (batch.length < 500) break;
      }
      return done(all);
    }
    let q = db
      .from("activities")
      .select(fields + ",final_result", { count: "exact" })
      .eq("deletion_pending", false)
      .not("finalized_at", "is", null)
      .order("finalized_at", { ascending: false })
      .order("id");
    if (action === "public/exhibit") q = q.eq("id", uuid.parse(p.id));
    const search = z
      .string()
      .max(120)
      .default("")
      .parse(p.query)
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
    if (search)
      q = q.or(
        `title.ilike.%${search}%,author.ilike.%${search}%,signature.ilike.%${search}%`,
      );
    const offset = z
      .number()
      .int()
      .min(0)
      .max(1000000)
      .default(0)
      .parse(p.offset);
    const response = await q.range(offset, offset + 23),
      activities = check(response);
    const exhibits = await Promise.all(
      activities
        .filter((a) => a.final_result)
        .map(async (a) => {
          const rows = check(
            await db
              .from("image_submissions")
              .select("*")
              .eq("activity_id", a.id)
              .eq("submission_status", "complete")
              .in("id", [
                a.final_result.character.image_id,
                a.final_result.scene.image_id,
              ]),
          );
          const images = (await signedImages(db, rows)).map(
            ({ id, image_type, image_url }) => ({ id, image_type, image_url }),
          );
          return { ...publicLesson(a), result: a.final_result, images };
        }),
    );
    if (action === "public/exhibit" && !exhibits.length)
      fail(404, "아직 전시되지 않은 수업이에요.");
    return done(
      action === "public/exhibit"
        ? exhibits[0]
        : { items: exhibits, total: response.count },
    );
  }
  if (action === "lesson/unlock") {
    const id = uuid.parse(p.id);
    await limit(db, `unlock:${id}:${context.ip || "local"}`, 8, 600);
    const record = check(
      await db
        .from("lesson_access")
        .select("password_hash,version")
        .eq("activity_id", id)
        .maybeSingle(),
    );
    if (!record || !(await verifyPassword(p.password, record.password_hash)))
      fail(
        401,
        "수업 비밀번호가 일치하지 않아요. 이전 수업의 암호 설정은 관리자에게 요청해 주세요.",
      );
    return done(issueAccess(id, record.version));
  }
  if (action === "teacher/save" && !p.id) {
    await limit(db, `create-lesson:${context.ip || "local"}`, 10, 3600);
    const input = activitySchema.parse(p.activity);
    const password = await hashPassword(p.password);
    const profile = check(
      await db
        .from("teacher_profiles")
        .select("id")
        .eq("is_admin", true)
        .order("created_at")
        .limit(1),
    );
    if (!profile.length) fail(503, "관리자 계정 설정이 필요합니다.");
    const id = crypto.randomUUID(),
      tokens = activityTokens({ id });
    const a = check(
      await db.rpc("create_lesson", {
        p_teacher: profile[0].id,
        p_id: id,
        p_data: input,
        p_worksheet_hash: hmac(`qr:${tokens.worksheet_token}`),
        p_submission_hash: hmac(`qr:${tokens.submission_token}`),
        p_password_hash: password,
      }),
    );
    return done({
      ...(await enrichActivity(db, a)),
      access: issueAccess(id, 1),
    });
  }
  if (action === "admin/password") {
    if (!(await adminUser(db, req))) fail(403, "관리자 권한이 필요합니다.");
    const id = uuid.parse(p.id),
      password = await hashPassword(p.password);
    check(
      await db.rpc("reset_lesson_password", {
        p_activity: id,
        p_hash: password,
      }),
    );
    return done({ ok: true });
  }
  if (
    ["teacher/select-final", "teacher/finalize", "teacher/reopen"].includes(
      action,
    )
  ) {
    const id = uuid.parse(p.id),
      teacher = await lessonOwner(db, req, id);
    if (action === "teacher/select-final") {
      return done(
        check(
          await db.rpc("select_final_image", {
            p_teacher: teacher,
            p_activity: id,
            p_image: uuid.parse(p.image_id),
            p_type: z.enum(["character", "scene"]).parse(p.image_type),
          }),
        ),
      );
    }
    if (action === "teacher/reopen") {
      check(
        await db
          .from("activities")
          .update({ finalized_at: null, stage: "ANALYSIS" })
          .eq("id", id)
          .eq("teacher_id", teacher)
          .eq("deletion_pending", false),
      );
      return done({ ok: true });
    }
    const a = check(
      await db.from("activities").select("*").eq("id", id).single(),
    );
    const ids = [
      uuid.parse(p.result?.character_image_id),
      uuid.parse(p.result?.scene_image_id),
    ];
    const images = check(
      await db
        .from("image_submissions")
        .select("*")
        .eq("activity_id", id)
        .eq("submission_status", "complete")
        .in("id", ids),
    );
    if (images.length !== 2)
      fail(400, "인물과 사건 최종 사진을 한 장씩 선택해 주세요.");
    const worksheets = check(
      await db
        .from("worksheets")
        .select("*")
        .eq("activity_id", id)
        .in("id", [...new Set(images.map((i) => i.worksheet_id))]),
    );
    let result;
    try {
      result = finalResult(a, worksheets, images, p.result || {});
    } catch (error) {
      fail(400, error.message);
    }
    const saved = check(
      await db.rpc("finalize_lesson", {
        p_teacher: teacher,
        p_activity: id,
        p_result: result,
      }),
    );
    let cleanupPending = false;
    for (const job of saved.jobs || []) {
      try {
        await runDeletion(db, job);
      } catch {
        cleanupPending = true;
      }
    }
    return done({
      id,
      removed: saved.removed,
      cleanup_pending: cleanupPending,
    });
  }
  return { handled: false };
}
