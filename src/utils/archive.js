export function publicLesson(a) {
  return Object.fromEntries(
    [
      "id",
      "title",
      "author",
      "course_name",
      "class_name",
      "stage",
      "created_at",
      "updated_at",
      "finalized_at",
      "signature",
      "lesson_kind",
      "active_phase",
      "deepening_session_id",
    ].map((k) => [k, a[k] ?? null]),
  );
}

export function finalResult(activity, worksheets, images, input) {
  const required = (key, label, max = 1600) => {
    const value = String(input[key] || "").trim();
    if (!value || value.length > max)
      throw new Error(`${label}을(를) 1~${max}자로 작성해 주세요.`);
    return value;
  };
  const picked = (type) => {
    const image = images.find(
      (i) =>
        i.id === input[`${type}_image_id`] &&
        i.activity_id === activity.id &&
        i.image_type === type &&
        i.submission_status !== "deleting",
    );
    if (!image)
      throw new Error(
        `${type === "character" ? "인물" : "사건"} 최종 사진을 한 장 선택해 주세요.`,
      );
    const worksheet = worksheets.find(
      (w) => w.id === image.worksheet_id && w.activity_id === activity.id,
    );
    if (!worksheet) throw new Error("사진에 연결된 분석을 찾을 수 없어요.");
    return { image, worksheet };
  };
  const character = picked("character"),
    scene = picked("scene");
  return {
    version: 1,
    title: activity.title,
    author: activity.author,
    signature: required("signature", "전시작 제작자", 60),
    synopsis: required("synopsis", "줄거리", 1800),
    temporal_background: required("temporal_background", "시간적 배경", 1200),
    spatial_background: required("spatial_background", "공간적 배경", 1200),
    character: {
      image_id: character.image.id,
      name: character.worksheet.character_name,
      description: required("character_summary", "인물 성격 정리", 1600),
      evidence: character.worksheet.textual_evidence?.slice(0, 1600) || "",
    },
    scene: {
      image_id: scene.image.id,
      name: scene.worksheet.scene?.name || "인상 깊은 사건",
      description: required("scene_summary", "사건 정리", 1600),
      evidence: scene.worksheet.scene?.development?.slice(0, 1600) || "",
    },
  };
}

export const synopsisExamples = {
  "동백꽃|김유정":
    "농촌 소년 ‘나’는 점순이가 감자를 건네며 표현한 관심을 알아차리지 못한다. 거절당한 점순이가 닭싸움으로 감정을 드러내자 두 사람의 갈등이 깊어지고, 화가 난 ‘나’는 점순이네 수탉을 죽이고 만다. 이후 점순이의 말과 행동을 통해 두 인물의 서툰 마음이 드러나며 이야기는 봄꽃 속에서 끝난다.",
  "메밀꽃필무렵|이효석":
    "장돌뱅이 허 생원은 조 선달, 젊은 동이와 함께 장터를 옮겨 다닌다. 달빛 아래 메밀꽃이 핀 길을 걸으며 허 생원은 오래전 성 서방네 처녀와의 인연을 이야기한다. 동이의 가족 이야기를 듣고 그의 왼손잡이 모습을 보면서 두 사람 사이의 혈연 가능성이 암시된다.",
  "소나기|황순원":
    "시골 소년은 서울에서 온 소녀와 개울가에서 만나 가까워진다. 함께 들과 산을 거닐다 소나기를 만나 비를 피하며 두 사람은 소중한 추억을 쌓는다. 소녀가 병을 앓다 세상을 떠났다는 소식을 전해 들은 소년에게 짧은 만남의 기억과 상실감이 남는다.",
};
