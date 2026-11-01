import { randomCode } from "../utils/helpers.js";
const encoder = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function passwordHash(password, salt = randomCode()) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    throw new Error("비밀번호는 8~128자로 입력해 주세요.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 600000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
  return { salt, hash };
}
export async function checkPassword(password, record) {
  if (
    !record ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    return false;
  return (await passwordHash(password, record.salt)).hash === record.hash;
}
const tokenHash = async (token) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(token || "")));
export async function issueDemoAccess(state, scope) {
  const token = randomCode(),
    expires = Date.now() + 2 * 60 * 60 * 1000;
  state.access_sessions ||= [];
  state.access_sessions = state.access_sessions.filter(
    (s) => s.expires > Date.now(),
  );
  state.access_sessions.push({ scope, hash: await tokenHash(token), expires });
  return { token, expires };
}
export async function hasDemoAccess(state, scope, token) {
  if (!token) return false;
  const hash = await tokenHash(token);
  return (
    state.access_sessions?.some(
      (s) => s.scope === scope && s.hash === hash && s.expires > Date.now(),
    ) || false
  );
}
export function accessError(message = "수업 비밀번호를 입력해 주세요.") {
  const error = new Error(message);
  error.status = 401;
  throw error;
}
