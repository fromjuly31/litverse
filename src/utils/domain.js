export const STAGES = {
  DRAFT: "준비 중",
  BACKGROUND: "배경 탐구 중",
  ANALYSIS: "인물·사건 분석 중",
  SUBMISSION: "두 작품 제출 중",
  CLOSED: "활동 종료",
};
export const DEFAULT_TAGS = [
  "소심함",
  "용감함",
  "신중함",
  "충동적임",
  "이기적임",
  "희생적임",
  "불안함",
  "책임감",
  "냉정함",
  "다정함",
  "고집스러움",
  "내성적임",
  "적극적임",
];
export const DEFAULT_TASKS = [
  "시간적·공간적 배경에 대한 선생님의 질문에 응답해요.",
  "선생님이 정리한 배경을 바탕으로 등장인물의 성격과 본문 근거를 작성해요.",
  "인상 깊은 사건과 선택 이유, 장면을 구체적으로 묘사해요.",
  "인물과 사건의 프롬프트로 외부 AI에서 각각 이미지를 만들어요.",
  "인물 사진 한 장, 사건 장면 사진 한 장을 두 탭에 제출해요.",
];
export const STYLES = [
  "문학 일러스트레이션",
  "수채화",
  "유화",
  "시네마틱 초상화",
  "연필 드로잉",
  "한국화",
];
export function normalizeTags(value, max = 5) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[,\s]+/u);
  return [
    ...new Set(
      values
        .map((t) => String(t).normalize("NFKC").replace(/^#+/, "").trim())
        .filter(
          (t) => t.length > 0 && t.length <= 20 && /^[\p{L}\p{N}_-]+$/u.test(t),
        ),
    ),
  ].slice(0, max);
}
export function createPrompt(activity, worksheet) {
  return `다음 소설의 등장인물을 한 장의 문학적 인물 초상화로 표현해 줘.\n\n작품: ${activity.title} — ${activity.author}\n등장인물: ${worksheet.character_name}\n핵심 성격: ${(worksheet.personality_tags || []).join(", ")}\n\n인물에 대한 나의 해석:\n${worksheet.personality_description}\n\n작품 속 근거:\n${worksheet.textual_evidence}\n${worksheet.evidence_quote || ""}\n\n근거를 이렇게 해석한 이유:\n${worksheet.evidence_explanation}\n\n작품에 명시된 외모:\n${worksheet.canonical_appearance || "명시된 특징 없음"}\n\n해석을 바탕으로 상상한 모습:\n${worksheet.imagined_appearance}\n${worksheet.visual_description || ""}\n\n시간적 배경: ${activity.temporal_background || "원작의 시간적 배경을 참고"}\n공간적 배경: ${activity.spatial_background || "원작의 공간적 배경을 참고"}\n추가 배경 안내: ${worksheet.background || activity.background || "작품의 배경을 참고"}\n그림 스타일: ${worksheet.image_style || activity.default_image_style || STYLES[0]}\n${activity.prompt_template ? `\n교사의 표현 안내:\n${activity.prompt_template}\n` : ""}\n인물의 외모, 표정, 눈빛, 자세를 통해 학생이 분석한 성격이 드러나게 해 줘. 작품에서 명시된 특징을 우선 반영하고, 상상한 외모를 원작의 확정적인 사실로 취급하지 말아 줘. 완성도 높은 문학 일러스트레이션으로 표현해 줘.`;
}
export function createScenePrompt(activity, w) {
  return `${activity.author}의 「${activity.title}」에서 다음 사건을 한 장의 문학적 장면으로 표현해 줘.\n\n시간적 배경: ${activity.temporal_background || "원작의 시간적 배경을 참고"}\n공간적 배경: ${activity.spatial_background || "원작의 공간적 배경을 참고"}\n교사의 배경 안내: ${activity.background || "추가 안내 없음"}\n\n인상 깊은 사건: ${w.scene?.name || ""}\n이 사건을 선택한 이유: ${w.scene?.reason || ""}\n사건의 전개와 본문 내용: ${w.scene?.development || ""}\n장면 속 인물의 행동: ${w.scene?.behavior || ""}\n인물과 주제에 미친 영향: ${w.scene?.impact || ""}\n시각적 묘사·구도·표정: ${w.scene?.visual || ""}\n그림 스타일: ${w.scene?.image_style || w.image_style || activity.default_image_style}\n\n원작의 사실과 학생의 상상은 구분하고, 선택한 사건과 그 이유가 인물의 행동, 배경, 구도와 감정으로 드러나게 해 줘. 원작에 없는 내용을 확정적인 사실처럼 덧붙이지 말아 줘.`;
}
export function submissionProgress(images, worksheetId) {
  const own = images.filter((i) => i.worksheet_id === worksheetId);
  return {
    character: own.some((i) => i.image_type === "character"),
    scene: own.some((i) => i.image_type === "scene"),
    complete: ["character", "scene"].every((type) =>
      own.some((i) => i.image_type === type),
    ),
  };
}
export function validScene(scene = {}) {
  return ["name", "reason", "development", "behavior", "visual"].every(
    (key) => scene[key]?.trim().length >= 10,
  );
}
export function validCharacter(w) {
  return [1, 2, 3, 4].every((step) => validateStep(step, w));
}
export function tagStatistics(images, worksheets, aliases = {}) {
  const people = new Map();
  const lookup = new Map(worksheets.map((w) => [w.id, w]));
  for (const image of images) {
    if (!lookup.has(image.worksheet_id)) continue;
    const set = people.get(image.worksheet_id) || new Set();
    normalizeTags(image.hashtags).forEach((t) => set.add(aliases[t] || t));
    people.set(image.worksheet_id, set);
  }
  const frequencies = new Map();
  const pairs = new Map();
  people.forEach((tags) => {
    const list = [...tags].sort();
    list.forEach((t) => frequencies.set(t, (frequencies.get(t) || 0) + 1));
    list.forEach((a, i) =>
      list.slice(i + 1).forEach((b) => {
        const key = `${a}|${b}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }),
    );
  });
  return {
    total: people.size,
    tags: [...frequencies]
      .map(([tag, count]) => ({
        tag,
        count,
        percent: people.size ? Math.round((count / people.size) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ko")),
    pairs: [...pairs].map(([key, count]) => ({ tags: key.split("|"), count })),
  };
}
export function filterImages(
  images,
  worksheets,
  {
    query = "",
    character = "",
    tags = [],
    type = "",
    approval = "",
    sort = "newest",
    aliases = {},
  } = {},
) {
  const lookup = new Map(worksheets.map((w) => [w.id, w]));
  const frequencies = tagStatistics(images, worksheets, aliases).tags;
  const score = (image) =>
    image.hashtags.reduce(
      (sum, t) =>
        sum +
        (frequencies.find((f) => f.tag === (aliases[t] || t))?.count || 0),
      0,
    );
  return images
    .filter((i) => {
      const w = lookup.get(i.worksheet_id) || {};
      const mapped = i.hashtags.map((t) => aliases[t] || t);
      return (
        (!character || w.character_name === character) &&
        (!type || i.image_type === type) &&
        (!approval || i.approval_status === approval) &&
        tags.every((t) => mapped.includes(t)) &&
        `${w.character_name} ${w.student_label} ${i.hashtags.join(" ")} ${i.one_line_description} ${i.image_type === "scene" ? Object.values(w.scene || {}).join(" ") : ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase().trim())
      );
    })
    .sort((a, b) =>
      sort === "oldest"
        ? a.created_at.localeCompare(b.created_at)
        : sort === "student"
          ? (lookup.get(a.worksheet_id)?.student_label || "").localeCompare(
              lookup.get(b.worksheet_id)?.student_label || "",
              "ko",
              { numeric: true },
            )
          : sort === "character"
            ? (lookup.get(a.worksheet_id)?.character_name || "").localeCompare(
                lookup.get(b.worksheet_id)?.character_name || "",
                "ko",
              )
            : sort === "frequency"
              ? score(b) - score(a)
              : b.created_at.localeCompare(a.created_at),
    );
}
export function validateStep(step, w) {
  if (step === 1)
    return w.character_name?.trim() && w.character_selection_reason?.trim();
  if (step === 2)
    return (
      w.personality_tags?.length >= 1 &&
      w.personality_tags.length <= 3 &&
      w.personality_description?.trim().length >= 20
    );
  if (step === 3)
    return (
      w.textual_evidence?.trim().length >= 20 &&
      w.evidence_explanation?.trim().length >= 10
    );
  if (step === 4) return w.imagined_appearance?.trim().length >= 20;
  return true;
}
