import {
  publicLesson,
  finalResult,
  synopsisExamples,
} from "../utils/archive.js";
import {
  alternatePosters,
  findWork,
  groupExhibits,
  matchWorks,
  workSummary,
  WORKS_PER_PAGE,
} from "../utils/exhibition-catalog.js";
import {
  demoPublicDeepeningExhibit,
  demoPublicDeepeningSessions,
} from "./demo-deepening.js";
import {
  passwordHash,
  checkPassword,
  issueDemoAccess,
  hasDemoAccess,
  accessError,
} from "./demo-access.js";

function demoPoster(state, activity) {
  if (!activity) return null;
  const result = activity.final_result;
  const imageIds = [result.character.image_id, result.scene.image_id];
  return {
    ...publicLesson(activity),
    result,
    can_reopen: !activity.images,
    images:
      activity.images ||
      state.images
        .filter(
          (image) =>
            image.activity_id === activity.id && imageIds.includes(image.id),
        )
        .map(({ id, image_type, image_url }) => ({
          id,
          image_type,
          image_url,
        })),
  };
}

export async function demoArchive(state, action, p) {
  state.lesson_passwords ||= {};
  const admin = await hasDemoAccess(state, "admin", p.__admin);
  const lesson = () => {
    const a = state.activities.find((a) => a.id === p.id);
    if (!a) throw new Error("수업을 찾을 수 없어요.");
    return a;
  };
  const done = (result, changed = false) => ({
    handled: true,
    result,
    changed,
  });
  if (action === "admin/session")
    return done({ configured: !!state.admin_password, authenticated: admin });
  if (action === "admin/setup" || action === "admin/login") {
    state.admin_attempts ||= { count: 0, reset: 0 };
    if (state.admin_attempts.reset <= Date.now())
      state.admin_attempts = { count: 0, reset: Date.now() + 60000 };
    if (++state.admin_attempts.count > 8)
      return done({ error: "잠시 후 다시 시도해 주세요.", status: 429 }, true);
    if (action === "admin/setup") {
      if (state.admin_password)
        accessError("이미 관리자가 설정되어 있어요. 로그인해 주세요.");
      state.admin_password = await passwordHash(p.password, undefined, 8);
    } else if (!(await checkPassword(p.password, state.admin_password)))
      return done(
        { error: "관리자 비밀번호가 일치하지 않아요.", status: 401 },
        true,
      );
    return done(await issueDemoAccess(state, "admin"), true);
  }
  if (action === "public/list")
    return done(
      state.activities.map((a) => ({
        ...publicLesson(a),
        needs_password_setup: !state.lesson_passwords[a.id],
      })),
    );
  if (action === "public/collection" || action === "public/work") {
    const works = groupExhibits(
      [...state.activities, ...(state.standalone_posters || [])].filter(
        (activity) =>
          activity.finalized_at &&
          activity.final_result &&
          !activity.deletion_pending,
      ),
      demoPublicDeepeningSessions(state),
    );
    if (action === "public/collection") {
      const matched = matchWorks(works, p.query);
      if (p.count_only) return done({ total: matched.length });
      const offset = Math.max(0, Number(p.offset) || 0);
      return done({
        total: matched.length,
        items: matched
          .slice(offset, offset + WORKS_PER_PAGE)
          .map((work) => workSummary(work, demoPoster(state, work.posters[0]))),
      });
    }
    const work = findWork(works, p);
    if (!work) throw new Error("아직 전시 중인 자료가 없는 작품이에요.");
    const poster = p.poster_id
      ? work.posters.find(({ id }) => id === p.poster_id)
      : work.posters[0];
    return done({
      ...workSummary(work, demoPoster(state, poster)),
      posters: alternatePosters(work),
      perspectives: work.perspectives.map((session) =>
        demoPublicDeepeningExhibit(state, session),
      ),
    });
  }
  if (action === "public/exhibits") {
    const query = String(p.query || "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim()
        .toLocaleLowerCase(),
      offset = Math.max(0, Number(p.offset) || 0);
    const all = [...state.activities, ...(state.standalone_posters || [])]
      .filter(
        (a) =>
          a.finalized_at &&
          a.final_result &&
          `${a.title} ${a.author} ${a.signature}`
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          new Date(b.finalized_at) - new Date(a.finalized_at) ||
          a.id.localeCompare(b.id),
      );
    return done({
      total: all.length,
      items: all.slice(offset, offset + 24).map((a) => demoPoster(state, a)),
    });
  }
  if (action === "public/exhibit") {
    const a =
      state.standalone_posters?.find((poster) => poster.id === p.id) ||
      lesson();
    if (!a.finalized_at || !a.final_result)
      throw new Error("아직 전시되지 않은 수업이에요.");
    return done(demoPoster(state, a));
  }
  if (action === "public/synopsis") {
    const synopsis =
      synopsisExamples[
        `${String(p.title).replace(/\s/g, "")}|${String(p.author).trim()}`
      ];
    if (!synopsis)
      throw new Error(
        "이 작품의 AI 요약은 운영 서버 연결 후 사용할 수 있어요. 줄거리를 직접 입력할 수도 있습니다.",
      );
    return done({
      synopsis,
      source: "example",
      note: "내장 예시 요약입니다. 원문과 대조하고 수업에 맞게 다듬어 주세요.",
    });
  }
  if (action === "lesson/unlock") {
    lesson();
    state.password_attempts ||= {};
    let attempts = state.password_attempts[p.id];
    if (!attempts || attempts.reset <= Date.now())
      attempts = state.password_attempts[p.id] = {
        count: 0,
        reset: Date.now() + 60000,
      };
    if (++attempts.count > 8)
      return done(
        {
          error: "비밀번호 시도가 많아요. 1분 후 다시 시도해 주세요.",
          status: 429,
        },
        true,
      );
    if (!state.lesson_passwords[p.id]) {
      if (!p.set_password)
        accessError("이전 수업의 비밀번호를 먼저 설정해 주세요.");
      state.lesson_passwords[p.id] = await passwordHash(p.password);
    } else if (!(await checkPassword(p.password, state.lesson_passwords[p.id])))
      return done(
        { error: "수업 비밀번호가 일치하지 않아요.", status: 401 },
        true,
      );
    return done(await issueDemoAccess(state, p.id), true);
  }
  if (action.startsWith("teacher/") || action === "demo/reset") {
    if (
      !(action === "teacher/save" && !p.id) &&
      !admin &&
      !(await hasDemoAccess(state, p.id, p.__access))
    )
      accessError();
    if (!p.id && action !== "teacher/save" && !admin)
      accessError("관리자 로그인이 필요합니다.");
    if (
      p.id &&
      lesson().finalized_at &&
      ![
        "teacher/get",
        "teacher/background",
        "teacher/links",
        "teacher/reopen",
      ].includes(action) &&
      !(admin && action === "teacher/delete-activity")
    )
      throw new Error("완료한 수업입니다. 먼저 수업을 다시 열어 주세요.");
  }
  if (action === "teacher/synopsis") {
    const synopsis = String(p.synopsis || "").trim();
    if (synopsis.length > 1800)
      throw new Error("줄거리는 1,800자 이내로 작성해 주세요.");
    lesson().synopsis = synopsis;
    return done({ ok: true }, true);
  }
  if (action === "teacher/select-final") {
    const a = lesson();
    const image = state.images.find(
      (i) =>
        i.id === p.image_id &&
        i.activity_id === a.id &&
        i.image_type === p.image_type,
    );
    if (!image) throw new Error("이 수업의 사진을 선택해 주세요.");
    a.final_selection = { ...a.final_selection, [p.image_type]: image.id };
    return done(a.final_selection, true);
  }
  if (action === "teacher/finalize") {
    const a = lesson();
    const result = finalResult(a, state.worksheets, state.images, p.result);
    const keep = [result.character.image_id, result.scene.image_id];
    const removed = state.images.filter(
      (i) => i.activity_id === a.id && !keep.includes(i.id),
    ).length;
    state.images = state.images.filter(
      (i) => i.activity_id !== a.id || keep.includes(i.id),
    );
    state.images
      .filter((i) => keep.includes(i.id))
      .forEach((i) => (i.approval_status = "approved"));
    Object.assign(a, {
      stage: "CLOSED",
      synopsis: result.synopsis,
      temporal_background: result.temporal_background,
      spatial_background: result.spatial_background,
      final_result: result,
      signature: result.signature,
      finalized_at: new Date().toISOString(),
    });
    return done({ id: a.id, removed, cleanup_pending: false }, true);
  }
  if (action === "teacher/reopen") {
    Object.assign(lesson(), { stage: "ANALYSIS", finalized_at: null });
    return done({ ok: true }, true);
  }
  if (action === "admin/password") {
    if (!admin) accessError("관리자 로그인이 필요합니다.");
    lesson();
    state.lesson_passwords[p.id] = await passwordHash(p.password);
    state.access_sessions = state.access_sessions.filter(
      (s) => s.scope !== p.id,
    );
    return done({ ok: true }, true);
  }
  return { handled: false };
}
