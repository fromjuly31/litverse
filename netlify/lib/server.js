import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes } from "node:crypto";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};
export function createServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.TOKEN_SECRET;
  if (!url || !key || !secret || secret.length < 32)
    fail(503, "서버 연결 설정이 필요합니다. 관리자에게 문의해 주세요.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const hmac = (value) =>
  createHmac("sha256", process.env.TOKEN_SECRET).update(value).digest("hex");
export const newCode = () => randomBytes(24).toString("hex");
export const activityTokens = (a) => ({
  worksheet_token: hmac(`worksheet:${a.id}:${a.qr_version || 1}`),
  submission_token: hmac(`submission:${a.id}:${a.qr_version || 1}`),
});
export function check(result) {
  if (result.error) throw result.error;
  return result.data;
}
export async function owner(db, request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) fail(401, "교사 로그인이 필요합니다.");
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user)
    fail(401, "로그인이 만료되었어요. 다시 로그인해 주세요.");
  const profile = check(
    await db
      .from("teacher_profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle(),
  );
  if (!profile) fail(403, "등록된 교사만 이용할 수 있습니다.");
  return data.user.id;
}
export async function ownedActivity(db, id, teacher) {
  const a = check(
    await db
      .from("activities")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", teacher)
      .eq("deletion_pending", false)
      .maybeSingle(),
  );
  if (!a) fail(404, "활동을 찾을 수 없거나 접근 권한이 없습니다.");
  return a;
}
export async function tokenActivity(db, token, kind) {
  const hash = hmac(`qr:${token}`);
  let query = db.from("activities").select("*").eq("deletion_pending", false);
  query = kind
    ? query.eq(
        kind === "submission"
          ? "submission_token_hash"
          : "worksheet_token_hash",
        hash,
      )
    : query.or(
        `worksheet_token_hash.eq.${hash},submission_token_hash.eq.${hash}`,
      );
  const a = check(await query.maybeSingle());
  if (!a || (a.stage === "DRAFT" && a.active_phase !== "deepening"))
    fail(404, "유효하지 않거나 아직 열리지 않은 활동입니다.");
  return a;
}
export async function studentRecord(db, activity, code) {
  const w = check(
    await db
      .from("worksheets")
      .select("*")
      .eq("activity_id", activity.id)
      .eq("submission_code_hash", hmac(`student:${code}`))
      .eq("deletion_pending", false)
      .maybeSingle(),
  );
  if (!w) fail(403, "제출 코드가 일치하지 않아요. 다시 확인해 주세요.");
  return w;
}
export function cleanWorksheet(w) {
  const { submission_code_hash, deletion_pending, ...safe } = w;
  return safe;
}
export async function enrichActivity(db, a, student = false) {
  const [tags, aliases] = await Promise.all([
    db.from("tag_catalog").select("tag_name").eq("activity_id", a.id),
    db
      .from("tag_aliases")
      .select("original_tag,canonical_tag")
      .eq("activity_id", a.id),
  ]);
  const { worksheet_token_hash, submission_token_hash, teacher_id, ...safe } =
    a;
  const questions = student
    ? check(
        await db
          .from("background_questions")
          .select(
            "id,activity_id,kind,prompt,status,summary,created_at,updated_at",
          )
          .eq("activity_id", a.id)
          .order("created_at"),
      )
    : undefined;
  return {
    ...safe,
    tags: check(tags).map((t) => t.tag_name),
    ...(student
      ? { questions }
      : {
          aliases: Object.fromEntries(
            check(aliases).map((t) => [t.original_tag, t.canonical_tag]),
          ),
        }),
  };
}
export async function signedImages(db, images) {
  if (!images.length) return [];
  const signed = check(
    await db.storage.from("literature-images").createSignedUrls(
      images.map((i) => i.image_path),
      600,
    ),
  );
  return images.map((image, index) => ({
    ...image,
    image_url: signed[index]?.signedUrl || "",
  }));
}
export async function limit(db, key, max = 600, seconds = 600) {
  const allowed = check(
    await db.rpc("consume_rate_limit", {
      p_key: hmac(`limit:${key}`),
      p_limit: max,
      p_window: seconds,
    }),
  );
  if (!allowed)
    fail(429, "요청이 너무 많아요. 잠시 기다린 뒤 다시 시도해 주세요.");
}
export async function runDeletion(db, id) {
  const job = check(await db.rpc("claim_deletion", { p_id: id }));
  if (!job?.id) return;
  try {
    let paths = [...new Set(job.image_paths)];
    if (job.target_type === "activity" && job.activity_id) {
      const documents = [];
      for (let offset = 0; ; offset += 1000) {
        const files = check(
          await db.storage
            .from("literature-texts")
            .list(job.activity_id, { limit: 1000, offset }),
        );
        documents.push(
          ...files
            .filter((file) => /^text-[a-f0-9-]+\.pdf$/.test(file.name))
            .map((file) => `${job.activity_id}/${file.name}`),
        );
        if (files.length < 1000) break;
      }
      for (let i = 0; i < documents.length; i += 100)
        check(
          await db.storage
            .from("literature-texts")
            .remove(documents.slice(i, i + 100)),
        );
    }
    // An orphan cleanup must never delete an object still referenced by a completed submission.
    if (job.target_type === "orphan" && paths.length) {
      const used = check(
        await db
          .from("image_submissions")
          .select("image_path")
          .in("image_path", paths)
          .eq("submission_status", "complete"),
      );
      paths = paths.filter((p) => !used.some((i) => i.image_path === p));
    }
    for (let i = 0; i < paths.length; i += 100)
      check(
        await db.storage
          .from("literature-images")
          .remove(paths.slice(i, i + 100)),
      );
    check(await db.rpc("finish_deletion", { p_id: job.id }));
  } catch (error) {
    await db
      .from("deletion_jobs")
      .update({
        status: "failed",
        lease_until: null,
        error_message: "파일 또는 데이터 정리에 실패했습니다. 재시도해 주세요.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw new HttpError(
      503,
      "삭제가 일부 진행되었어요. 설정의 정리 작업에서 다시 시도해 주세요.",
    );
  }
}
export async function cleanup(db, teacher = null) {
  check(await db.rpc("expire_uploads", { p_teacher: teacher }));
  let query = db
    .from("deletion_jobs")
    .select("id")
    .neq("status", "completed")
    .lte("not_before", new Date().toISOString())
    .order("created_at")
    .limit(100);
  if (teacher) query = query.eq("teacher_id", teacher);
  const jobs = check(await query);
  let failed = 0;
  for (const job of jobs) {
    try {
      await runDeletion(db, job.id);
    } catch {
      failed++;
    }
  }
  return { ok: failed === 0, attempted: jobs.length, failed };
}
export function errorResponse(error) {
  if (error.name === "ZodError")
    return Response.json(
      { error: "입력 내용의 형식과 길이를 확인해 주세요." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const messages = {
    REVISION_CONFLICT:
      "다른 창에서 기록이 변경되었습니다. 임시저장 내용을 유지하고 최신 기록을 불러와 주세요.",
    INITIAL_IMMUTABLE: "최초 판단은 성찰과 비교하기 위해 보존됩니다.",
    STARTED_CREATE_NEW_ROUND:
      "진행한 회차는 보존됩니다. 새 회차에서 분석을 수정해 주세요.",
    CLOSE_CURRENT_ROUND: "진행 중인 심화 회차를 먼저 종료해 주세요.",
    NO_COMPLETED_REFLECTION:
      "완료된 성찰이 있어야 전시관에 공개할 수 있습니다.",
    BACKGROUND_CLOSED:
      "배경 질문의 응답이 마감되었어요. 선생님의 정리를 확인해 주세요.",
    SCENE_REQUIRED:
      "인상 깊은 사건과 선택 이유, 장면 묘사를 모두 작성해 주세요.",
    STAGE_CLOSED:
      "이 단계에서는 작성이나 제출을 할 수 없어요. 선생님께 확인해 주세요.",
    FORBIDDEN: "이 자료에 접근할 수 없습니다.",
    INVALID_SLOT: "선택한 이미지 순번을 제출할 수 없어요.",
    SCENE_DISABLED: "사건 이미지 제출이 비활성화되어 있어요.",
    RESUBMIT_DISABLED: "재제출이 허용되지 않거나 삭제 중인 작품입니다.",
    UPLOAD_EXPIRED: "업로드 시간이 만료되었어요. 이미지를 다시 선택해 주세요.",
    UPLOAD_CONFLICT:
      "다른 제출이 먼저 완료되었어요. 제출 화면을 다시 열어 최신 작품을 확인해 주세요.",
    UPLOAD_SUPERSEDED: "이 업로드는 이미 다른 이미지로 교체되었어요.",
  };
  const key = Object.keys(messages).find((k) => error.message?.includes(k));
  const status = error.status || (key ? 409 : 500);
  if (status === 500)
    console.error(
      "LITVERSE server error",
      error.code || error.name || "unknown",
    );
  return Response.json(
    {
      error: key
        ? messages[key]
        : error instanceof HttpError
          ? error.message
          : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
