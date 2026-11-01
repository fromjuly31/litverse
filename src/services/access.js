const key = "litverse-access-v1";
function read() {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function write(value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}
export function accessToken(scope) {
  const item = read()[scope];
  return item?.expires > Date.now() ? item.token : "";
}
export function rememberAccess(scope, result) {
  const items = read();
  items[scope] = { token: result.token, expires: result.expires };
  write(items);
}
export function forgetLessons() {
  const items = read();
  write(items.admin ? { admin: items.admin } : {});
}
export function forgetAccess() {
  sessionStorage.removeItem(key);
}
