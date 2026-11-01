import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { check, fail, hmac } from "./server.js";
const derive = promisify(scrypt);
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    fail(400, "비밀번호는 8~128자로 입력해 주세요.");
  const salt = randomBytes(24).toString("hex");
  const hash = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 128 || !stored)
    return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || "")) return false;
  const actual = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function issueAccess(id, version) {
  const expires = Date.now() + 2 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ id, version, expires })).toString(
    "base64url",
  );
  return { token: `${body}.${hmac(`lesson:${body}`)}`, expires };
}
export function verifyAccess(token, id, version) {
  try {
    if (typeof token !== "string" || token.length > 1000) return false;
    const [body, signature, extra] = token.split(".");
    if (extra || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
    if (
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(hmac(`lesson:${body}`), "hex"),
      )
    )
      return false;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return (
      data.id === id && data.version === version && data.expires > Date.now()
    );
  } catch {
    return false;
  }
}
export async function adminUser(db, req) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  const profile = check(
    await db
      .from("teacher_profiles")
      .select("id,is_admin")
      .eq("id", data.user.id)
      .maybeSingle(),
  );
  return profile?.is_admin ? data.user.id : null;
}
export async function lessonOwner(db, req, id) {
  const admin = await adminUser(db, req);
  if (!id) {
    if (!admin) fail(401, "관리자 로그인이 필요합니다.");
    return admin;
  }
  const a = check(
    await db
      .from("activities")
      .select("id,teacher_id")
      .eq("id", id)
      .eq("deletion_pending", false)
      .maybeSingle(),
  );
  if (!a) fail(404, "수업을 찾을 수 없어요.");
  if (admin) return a.teacher_id;
  const access = check(
    await db
      .from("lesson_access")
      .select("version")
      .eq("activity_id", id)
      .maybeSingle(),
  );
  if (
    !access ||
    !verifyAccess(req.headers.get("x-lesson-token"), id, access.version)
  )
    fail(401, "수업 비밀번호를 입력해 주세요.");
  return a.teacher_id;
}
