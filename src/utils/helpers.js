export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const e = escapeHtml;
export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export const dateLabel = (value) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
export const timeLabel = (value) =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function downloadText(text, filename, mime) {
  const json = filename.toLowerCase().endsWith(".json");
  downloadBlob(
    new Blob(json ? [text] : ["\ufeff", text], {
      type:
        mime ||
        (json ? "application/json;charset=utf-8" : "text/plain;charset=utf-8"),
    }),
    filename,
  );
}
export function safeStorage(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return value === undefined ? null : false;
  }
}
export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
export async function optimizeImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPG, PNG, WebP 이미지만 선택할 수 있어요.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("원본 이미지는 12MB 이하로 선택해 주세요.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "이미지를 읽을 수 없어요. 다른 이미지 파일을 선택해 주세요.",
    );
  }
  if (bitmap.width * bitmap.height > 80_000_000) {
    bitmap.close();
    throw new Error("이미지 해상도가 너무 커요. 크기를 줄여 주세요.");
  }
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (blob?.size > 2 * 1024 * 1024)
    blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.68),
    );
  if (!blob) blob = file;
  if (blob.size > 5 * 1024 * 1024)
    throw new Error(
      "압축 후 5MB를 초과했어요. 더 작은 이미지를 선택해 주세요.",
    );
  return blob;
}
