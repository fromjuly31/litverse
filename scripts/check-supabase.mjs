import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

// No credentials or database records are printed. All data checks are read-only.
const publicOnly = process.argv.includes("--public-only");
const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const secret =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const tables = [
  "teacher_profiles",
  "activities",
  "worksheets",
  "image_submissions",
  "tag_catalog",
  "tag_aliases",
  "upload_jobs",
  "deletion_jobs",
  "rate_limits",
  "revoked_student_codes",
  "background_questions",
  "background_responses",
  "lesson_access",
  "literary_work_versions",
  "deepening_sessions",
  "deepening_records",
  "deepening_ai_jobs",
];
const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input, init = {}) =>
      fetch(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      }),
  },
};

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  requireCheck(url && key, ".env에 Supabase URL과 공개 키를 입력해 주세요.");
  let legacyRole;
  if (key.split(".").length === 3) {
    try {
      legacyRole = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role;
    } catch {
      throw new Error("공개 키 형식이 올바르지 않습니다.");
    }
  }
  requireCheck(
    key.startsWith("sb_publishable_") || legacyRole === "anon",
    "브라우저에는 publishable 또는 anon 키만 사용할 수 있습니다.",
  );
  const settingsResponse = await fetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  requireCheck(
    settingsResponse.ok,
    `공개 키 인증 실패 (HTTP ${settingsResponse.status}).`,
  );
  const settings = await settingsResponse.json();
  console.log("PASS 프로젝트 연결 및 공개 키 인증");

  const publicClient = createClient(url, key, clientOptions);
  const denied = await publicClient.from("activities").select("id").limit(1);
  requireCheck(
    denied.error?.code === "42501",
    "익명 테이블 접근이 예상대로 차단되지 않았습니다. 마이그레이션과 권한을 확인해 주세요.",
  );
  console.log("PASS 익명 사용자의 수업 테이블 직접 조회 차단");
  if (!settings.disable_signup) {
    console.log(
      "TODO Supabase Authentication > Sign In / Providers에서 신규 가입 허용을 꺼 주세요.",
    );
  }
  if (publicOnly) {
    console.log(
      "공개 연결만 확인했습니다. 서버 키·저장소·관리자 검증은 npm run check:supabase로 실행하세요.",
    );
    return;
  }

  requireCheck(
    process.env.SUPABASE_URL?.replace(/\/$/, "") === url.replace(/\/$/, ""),
    "브라우저와 서버의 SUPABASE_URL이 같아야 합니다.",
  );
  requireCheck(
    secret,
    ".env의 SUPABASE_SECRET_KEY에 서버 비밀 키를 입력해 주세요.",
  );
  requireCheck(
    (process.env.TOKEN_SECRET || "").length >= 32,
    "TOKEN_SECRET은 최소 32자 이상의 무작위 비밀값이어야 합니다.",
  );
  const server = createClient(process.env.SUPABASE_URL, secret, clientOptions);
  for (const table of tables) {
    const result = await server
      .from(table)
      .select("*", { head: true })
      .limit(1);
    requireCheck(
      !result.error,
      `${table} 조회 실패 (코드 ${result.error?.code || "unknown"}).`,
    );
  }
  console.log(`PASS 서버 키로 ${tables.length}개 테이블 조회`);
  const view = await server
    .from("deepening_exhibit_index")
    .select("*", { head: true })
    .limit(1);
  requireCheck(
    !view.error,
    "심화 전시 뷰 조회 실패. 마이그레이션 004를 확인해 주세요.",
  );
  console.log("PASS 심화 전시 뷰 조회");

  const { data: bucket, error: bucketError } =
    await server.storage.getBucket("literature-images");
  requireCheck(
    !bucketError && bucket && !bucket.public,
    "literature-images 비공개 버킷을 확인해 주세요.",
  );
  requireCheck(
    Number(bucket.file_size_limit) === 5242880,
    "이미지 버킷의 파일 한도는 5MB여야 합니다.",
  );
  const types = bucket.allowed_mime_types || [];
  requireCheck(
    types.length === 3 &&
      ["image/jpeg", "image/png", "image/webp"].every((type) =>
        types.includes(type),
      ),
    "이미지 버킷은 JPEG·PNG·WebP만 허용해야 합니다.",
  );
  console.log("PASS 비공개 이미지 버킷, 5MB 한도, 이미지 형식 제한");
  const admin = await server
    .from("teacher_profiles")
    .select("id", { head: true, count: "exact" })
    .eq("is_admin", true);
  requireCheck(!admin.error, "관리자 프로필 조회에 실패했습니다.");
  console.log("Supabase 데이터 연결 검증을 완료했습니다.");
  if (!admin.count)
    console.log(
      "TODO 첫 관리자 계정과 teacher_profiles 등록이 필요합니다. docs/SUPABASE.md를 확인해 주세요.",
    );
  if (!settings.disable_signup || !admin.count) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  // SDK errors can contain request information; only our own messages are displayed.
  const message =
    error.message === "fetch failed"
      ? "네트워크 연결을 확인해 주세요."
      : error.name === "TimeoutError"
        ? "Supabase 응답 시간이 초과되었습니다."
        : error.message;
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}
