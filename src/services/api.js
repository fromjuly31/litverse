import { createClient } from "@supabase/supabase-js";
import { demoRequest, demoSubscribe } from "./demo.js";
import { accessToken, forgetAccess } from "./access.js";
export const isDemo = (import.meta.env.VITE_APP_MODE || "demo") === "demo";
export const supabase =
  !isDemo &&
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
export async function request(action, payload = {}) {
  if (isDemo)
    return demoRequest(action, {
      ...payload,
      __access: accessToken(payload.id),
      __admin: accessToken("admin"),
    });
  if (!supabase)
    throw new Error(
      "서비스 연결 설정이 필요합니다. Supabase 공개 환경변수를 확인해 주세요.",
    );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`/api/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken(payload.id)
        ? { "X-Lesson-Token": accessToken(payload.id) }
        : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  }).catch((error) => {
    throw new Error(
      error.name === "TimeoutError"
        ? "응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요."
        : "서버에 연결하지 못했어요. 네트워크를 확인해 주세요.",
    );
  });
  const body = await response
    .json()
    .catch(() => ({ error: "서버 응답을 읽을 수 없어요." }));
  if (!response.ok) {
    const error = new Error(body.error || "요청을 처리하지 못했어요.");
    error.status = response.status;
    throw error;
  }
  return body;
}
export async function teacherSession() {
  if (isDemo) return { email: "demo@litverse.local", demo: true };
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user || null;
}
export async function signIn(email, password) {
  if (!supabase)
    throw new Error("실서비스 로그인은 Supabase 연결 후 사용할 수 있어요.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(
      "이메일과 비밀번호를 확인해 주세요. 사전 등록된 교사 계정만 로그인할 수 있습니다.",
    );
}
export async function signOut() {
  forgetAccess();
  if (supabase) await supabase.auth.signOut();
}
export function subscribe(activityId, callback, onState = () => {}) {
  if (isDemo) {
    onState("demo");
    return demoSubscribe(callback);
  }
  if (!supabase) return () => {};
  let stopped = false;
  let busy = false;
  const refresh = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await callback();
    } finally {
      busy = false;
    }
  };
  const channel = supabase
    .channel(`activity-${activityId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "image_submissions",
        filter: `activity_id=eq.${activityId}`,
      },
      refresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "worksheets",
        filter: `activity_id=eq.${activityId}`,
      },
      refresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "activities",
        filter: `id=eq.${activityId}`,
      },
      refresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "background_questions",
        filter: `activity_id=eq.${activityId}`,
      },
      refresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "background_responses",
        filter: `activity_id=eq.${activityId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      onState(status === "SUBSCRIBED" ? "connected" : "reconnecting");
      if (status === "SUBSCRIBED") refresh();
    });
  const timer = setInterval(refresh, 60000); // Also refresh expiring signed URLs.
  window.addEventListener("online", refresh);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("online", refresh);
    supabase.removeChannel(channel);
  };
}
export async function uploadImage(payload, blob, onProgress = () => {}) {
  onProgress(15);
  if (isDemo) {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    onProgress(80);
    return request("student/upload", { ...payload, image_url: url });
  }
  const job = await request("student/upload-init", {
    ...payload,
    size: blob.size,
    mime: blob.type,
  });
  if (job.completed) return job.image;
  onProgress(35);
  const { error } = await supabase.storage
    .from("literature-images")
    .uploadToSignedUrl(job.path, job.token, blob, { contentType: blob.type });
  // A retry may find a previously uploaded object; finalization verifies its ownership and bytes.
  if (error && !/already|duplicate|exists/i.test(error.message))
    throw new Error("이미지를 업로드하지 못했어요. 다시 시도해 주세요.");
  onProgress(80);
  return request("student/upload-complete", {
    token: payload.token,
    code: payload.code,
    job_id: job.id,
  });
}
