import { seedData } from "./seed.js";
import { demoArchive } from "./demo-archive.js";
import { demoDeepening } from "./demo-deepening.js";
import { passwordHash, issueDemoAccess } from "./demo-access.js";
import { randomCode } from "../utils/helpers.js";
import {
  createPrompt,
  createScenePrompt,
  normalizeTags,
  validCharacter,
  validScene,
} from "../utils/domain.js";
let database;
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("litverse-demo")
    : null;
const listeners = new Set();
channel?.addEventListener("message", () => listeners.forEach((fn) => fn()));
async function db() {
  if (!database)
    database = await new Promise((resolve, reject) => {
      const req = indexedDB.open("litverse-demo-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(
          new Error(
            "데모 저장소를 사용할 수 없어요. 브라우저 저장 권한을 확인해 주세요.",
          ),
        );
    });
  return database;
}
async function read() {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const req = conn.transaction("state").objectStore("state").get("app");
    req.onsuccess = () => resolve(req.result || seedData());
    req.onerror = () => reject(req.error);
  });
}
async function write(state) {
  const conn = await db();
  await new Promise((resolve, reject) => {
    const tx = conn.transaction("state", "readwrite");
    tx.objectStore("state").put(state, "app");
    tx.oncomplete = resolve;
    tx.onerror = () =>
      reject(
        new Error("저장 공간이 부족해요. 이전 데모 이미지를 정리해 주세요."),
      );
  });
  channel?.postMessage("updated");
  listeners.forEach((fn) => fn());
}
const fail = (message) => {
  throw new Error(message);
};
export async function demoRequest(action, payload = {}) {
  const execute = async () => {
    const state = await read();
    let changed = false;
    let result;
    state.questions ||= [];
    state.responses ||= [];
    state.revoked_codes ||= [];
    const deepening = await demoDeepening(state, action, payload);
    const archive = deepening.handled
      ? deepening
      : await demoArchive(state, action, payload);
    if (archive.handled) {
      if (archive.changed) await write(state);
      if (archive.result?.error) {
        const error = new Error(archive.result.error);
        error.status = archive.result.status;
        throw error;
      }
      return structuredClone(archive.result);
    }
    const activity = () =>
      state.activities.find((a) => a.id === payload.id) ||
      fail("활동을 찾을 수 없어요.");
    const byToken = () =>
      state.activities.find(
        (a) =>
          a.worksheet_token === payload.token ||
          a.submission_token === payload.token,
      ) || fail("유효하지 않은 활동 링크예요.");
    const getWorksheet = () =>
      state.worksheets.find(
        (w) =>
          w.activity_id === byToken().id && w.submission_code === payload.code,
      ) || fail("제출 코드가 일치하지 않아요. 다시 확인해 주세요.");
    if (action === "teacher/list") result = state.activities;
    else if (action === "teacher/get") {
      const a = activity();
      result = {
        activity: a,
        worksheets: state.worksheets.filter((w) => w.activity_id === a.id),
        images: state.images.filter((i) => i.activity_id === a.id),
      };
    } else if (action === "teacher/save") {
      const id = payload.id || crypto.randomUUID();
      const previous = state.activities.find((a) => a.id === id);
      if (!previous)
        state.lesson_passwords[id] = await passwordHash(payload.password);
      const a = {
        ...previous,
        ...payload.activity,
        id,
        stage: previous?.stage || "DRAFT",
        aliases: previous?.aliases || {},
        temporal_background: previous?.temporal_background || "",
        spatial_background: previous?.spatial_background || "",
        final_selection: previous?.final_selection || {},
        final_result: previous?.final_result || null,
        finalized_at: previous?.finalized_at || null,
        signature: previous?.signature || "",
        worksheet_token: previous?.worksheet_token || randomCode(),
        submission_token: previous?.submission_token || randomCode(),
        created_at: previous?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.activities = state.activities.filter((a) => a.id !== id).concat(a);
      result = a;
      if (!previous)
        result = { ...a, access: await issueDemoAccess(state, id) };
      changed = true;
    } else if (action === "teacher/stage") {
      activity().stage = payload.stage;
      result = activity();
      changed = true;
    } else if (action === "teacher/background") {
      const a = activity();
      result = {
        activity: a,
        questions: state.questions.filter((q) => q.activity_id === a.id),
        responses: state.responses
          .filter((r) => r.activity_id === a.id)
          .map(({ code, ...rest }) => rest),
      };
    } else if (action === "teacher/question-save") {
      const a = activity();
      const q = {
        id: crypto.randomUUID(),
        activity_id: a.id,
        kind: payload.kind,
        prompt: payload.prompt,
        status: "OPEN",
        summary: "",
        created_at: new Date().toISOString(),
      };
      state.questions.push(q);
      changed = true;
      result = q;
    } else if (action === "teacher/question-update") {
      const a = activity();
      const q = state.questions.find(
        (q) => q.id === payload.question_id && q.activity_id === a.id,
      );
      if (!q) fail("질문을 찾을 수 없어요.");
      q.status = payload.status;
      q.summary = payload.summary;
      a.temporal_background = state.questions
        .filter(
          (q) => q.activity_id === a.id && q.kind === "temporal" && q.summary,
        )
        .map((q) => q.summary)
        .join("\n\n");
      a.spatial_background = state.questions
        .filter(
          (q) => q.activity_id === a.id && q.kind === "spatial" && q.summary,
        )
        .map((q) => q.summary)
        .join("\n\n");
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/links")
      result = {
        worksheet_token: activity().worksheet_token,
        submission_token: activity().submission_token,
      };
    else if (action === "teacher/moderate") {
      state.images
        .filter(
          (i) => i.activity_id === activity().id && payload.ids.includes(i.id),
        )
        .forEach((i) => (i.approval_status = payload.status));
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/delete-images") {
      state.images = state.images.filter(
        (i) => !(i.activity_id === activity().id && payload.ids.includes(i.id)),
      );
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/delete-worksheet") {
      activity();
      state.images = state.images.filter(
        (i) =>
          !(
            i.activity_id === payload.id &&
            i.worksheet_id === payload.worksheet_id
          ),
      );
      state.worksheets = state.worksheets.filter(
        (w) => !(w.activity_id === payload.id && w.id === payload.worksheet_id),
      );
      state.deepening_records = (state.deepening_records || []).filter(
        (r) =>
          !(
            r.activity_id === payload.id &&
            r.worksheet_id === payload.worksheet_id
          ),
      );
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/delete-activity") {
      activity();
      state.images = state.images.filter((i) => i.activity_id !== payload.id);
      state.worksheets = state.worksheets.filter(
        (w) => w.activity_id !== payload.id,
      );
      state.activities = state.activities.filter((a) => a.id !== payload.id);
      for (const key of [
        "deepening_records",
        "deepening_sessions",
        "literary_work_versions",
      ])
        state[key] = (state[key] || []).filter(
          (r) => r.activity_id !== payload.id,
        );
      delete state.lesson_passwords[payload.id];
      state.access_sessions = (state.access_sessions || []).filter(
        (s) => s.scope !== payload.id,
      );
      state.questions = state.questions.filter(
        (q) => q.activity_id !== payload.id,
      );
      state.responses = state.responses.filter(
        (r) => r.activity_id !== payload.id,
      );
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/aliases") {
      activity().aliases = payload.aliases;
      changed = true;
      result = { ok: true };
    } else if (action === "teacher/reissue") {
      const w = state.worksheets.find(
        (w) => w.activity_id === activity().id && w.id === payload.worksheet_id,
      );
      if (!w) fail("학생을 찾을 수 없어요.");
      state.revoked_codes.push(w.submission_code);
      const previousCode = w.submission_code;
      w.submission_code = randomCode();
      (state.deepening_records || [])
        .filter(
          (r) =>
            r.activity_id === w.activity_id &&
            r.participant_hash === previousCode,
        )
        .forEach((r) => (r.participant_hash = w.submission_code));
      state.responses
        .filter(
          (r) => r.activity_id === w.activity_id && r.code === previousCode,
        )
        .forEach((r) => {
          r.code = w.submission_code;
        });
      changed = true;
      result = { code: w.submission_code };
    } else if (action === "teacher/jobs") result = [];
    else if (action === "teacher/retry-cleanup") result = { ok: true };
    else if (action === "student/activity") {
      const a = byToken();
      if (a.stage === "DRAFT" && a.active_phase !== "deepening")
        fail("아직 활동이 시작되지 않았어요.");
      result = {
        ...a,
        questions: state.questions.filter((q) => q.activity_id === a.id),
      };
    } else if (action === "student/background-answer") {
      const a = byToken();
      const q = state.questions.find(
        (q) => q.id === payload.question_id && q.activity_id === a.id,
      );
      if (a.stage !== "BACKGROUND" || !q || q.status !== "OPEN")
        fail("이 질문의 응답 시간이 종료되었어요.");
      if (state.revoked_codes.includes(payload.code))
        fail("다시 발급된 제출 코드를 사용해 주세요.");
      if (!payload.student_label?.trim() || payload.answer?.trim().length < 5)
        fail("학생 번호와 구체적인 응답을 작성해 주세요.");
      const old = state.responses.find(
        (r) => r.question_id === q.id && r.code === payload.code,
      );
      const response = {
        id: old?.id || crypto.randomUUID(),
        activity_id: a.id,
        question_id: q.id,
        code: payload.code,
        student_label: payload.student_label,
        answer: payload.answer,
        created_at: old?.created_at || new Date().toISOString(),
      };
      state.responses = state.responses
        .filter((r) => r.id !== response.id)
        .concat(response);
      changed = true;
      result = { ok: true };
    } else if (action === "student/complete") {
      const a = byToken();
      if (!["ANALYSIS", "SUBMISSION"].includes(a.stage))
        fail("지금은 인물·사건 분석을 제출할 수 없어요.");
      if (state.revoked_codes.includes(payload.code))
        fail("다시 발급된 제출 코드를 사용해 주세요.");
      if (
        !validCharacter(payload.worksheet) ||
        !validScene(payload.worksheet.scene)
      )
        fail("인물의 성격·본문 근거와 사건·선택 이유를 모두 완성해 주세요.");
      let w = state.worksheets.find(
        (w) => w.activity_id === a.id && w.submission_code === payload.code,
      );
      const id = w?.id || crypto.randomUUID();
      const code = w?.submission_code || payload.code || randomCode();
      w = {
        ...payload.worksheet,
        id,
        activity_id: a.id,
        submission_code: code,
        completed_at: new Date().toISOString(),
        created_at: w?.created_at || new Date().toISOString(),
      };
      (state.deepening_records || [])
        .filter((r) => r.activity_id === a.id && r.participant_hash === code)
        .forEach((r) => (r.worksheet_id = w.id));
      w.generated_prompt = createPrompt(a, w);
      w.scene_prompt = createScenePrompt(a, w);
      state.worksheets = state.worksheets.filter((x) => x.id !== id).concat(w);
      changed = true;
      result = { worksheet: w, code };
    } else if (action === "student/resume") {
      const w = getWorksheet();
      result = {
        worksheet: w,
        activity: byToken(),
        images: state.images.filter((i) => i.worksheet_id === w.id),
      };
    } else if (action === "student/upload") {
      const a = byToken();
      const w = getWorksheet();
      if (a.stage !== "SUBMISSION") fail("지금은 이미지 제출 시간이 아니에요.");
      const prior = state.images.find(
        (i) =>
          i.worksheet_id === w.id &&
          i.image_type === payload.image_type &&
          i.slot === (payload.slot || 0),
      );
      if (prior && !a.settings.allow_resubmit)
        fail("재제출이 허용되지 않은 활동이에요.");
      if (payload.image_type === "scene" && !a.settings.enable_scene)
        fail("사건 이미지 제출이 비활성화되어 있어요.");
      if ((payload.slot || 0) >= a.settings.max_images)
        fail("허용된 이미지 수를 초과했어요.");
      const image = {
        id: prior?.id || crypto.randomUUID(),
        activity_id: a.id,
        worksheet_id: w.id,
        image_type: payload.image_type,
        slot: payload.slot || 0,
        image_url: payload.image_url,
        hashtags: normalizeTags(payload.hashtags),
        one_line_description: payload.one_line_description,
        approval_status: a.settings.require_approval ? "pending" : "approved",
        created_at: new Date().toISOString(),
      };
      state.images = state.images
        .filter((i) => i.id !== image.id)
        .concat(image);
      changed = true;
      result = image;
    } else if (action === "demo/reset") {
      await write({
        ...seedData(),
        admin_password: state.admin_password,
        access_sessions: state.access_sessions.filter(
          (s) => s.scope === "admin",
        ),
      });
      return { ok: true };
    } else fail("지원하지 않는 요청이에요.");
    if (changed) await write(state);
    return structuredClone(result);
  };
  return navigator.locks
    ? navigator.locks.request("litverse-demo-state", execute)
    : execute();
}
export const demoSubscribe = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};
