import {
  DEFAULT_TAGS,
  DEFAULT_TASKS,
  createPrompt,
  createScenePrompt,
} from "../utils/domain.js";
export function seedData() {
  const now = new Date().toISOString();
  const activity = {
    id: "demo-dongbaek",
    title: "동백꽃",
    author: "김유정",
    class_name: "2학년 3반",
    course_name: "문학의 다양한 시선",
    introduction:
      "같은 이야기를 읽어도, 우리가 만나는 인물은 조금씩 다릅니다. 점순이와 ‘나’의 말과 행동을 따라가며 나만의 시선으로 인물을 만나 보세요.",
    objectives:
      "인물의 말과 행동을 근거로 성격을 해석하고, 서로 다른 해석을 비교합니다.",
    tasks: DEFAULT_TASKS,
    temporal_background:
      "본문의 농사일과 노란 동백꽃을 단서로 봄철을 떠올릴 수 있습니다. 사회적 시대는 작품의 발표 시기와 소작 관계를 함께 살펴봅니다.",
    spatial_background:
      "산기슭과 밭을 중심으로 한 농촌 마을입니다. 점순이네와 나의 가족 사이 소작 관계도 공간을 이해하는 단서가 됩니다.",
    background: "한국 농촌, 노란 동백꽃이 피는 봄",
    default_image_style: "문학 일러스트레이션",
    expected_student_count: 30,
    stage: "SUBMISSION",
    settings: {
      allow_resubmit: true,
      require_approval: true,
      enable_scene: true,
      max_images: 1,
    },
    tags: DEFAULT_TAGS,
    aliases: {},
    created_at: now,
    updated_at: now,
    worksheet_token: "demo-dongbaek-analysis",
    submission_token: "demo-dongbaek-submit",
    prompt_template: "",
    standards: "",
  };
  const interpretations = [
    {
      name: "점순이",
      tags: ["적극적임", "다정함"],
      description:
        "마음을 표현하는 방법이 서툴지만 먼저 다가갈 줄 아는 인물이라고 생각한다. 감자를 건네는 행동에서 상대에게 관심을 표현하려는 마음을 읽었다.",
      evidence:
        "점순이는 일을 하던 나에게 다가와 감자를 건네지만 나는 그 감자를 거절한다.",
      explanation:
        "먼저 먹을 것을 건네는 행동은 관계를 시작하려는 용기로 해석할 수 있다.",
      caption: "툭 내민 손끝에 숨겨진, 서툴지만 다정한 마음.",
    },
    {
      name: "나",
      tags: ["소심함", "신중함"],
      description:
        "점순이의 마음을 알아차리지 못하고 겉으로 드러난 행동에만 반응하는 인물이다. 자신의 감정을 솔직히 표현하는 데에도 조심스럽다.",
      evidence:
        "점순이가 주는 감자를 거절하고, 닭싸움이 반복되자 그 행동의 이유를 이해하지 못한 채 분해한다.",
      explanation:
        "상대의 마음보다 상황에 집중하는 모습에서 서투르고 조심스러운 면을 볼 수 있다.",
      caption: "말하지 못한 마음이 조심스러운 눈빛에 남아 있다.",
    },
    {
      name: "점순이",
      tags: ["고집스러움", "용감함"],
      description:
        "거절을 당해도 자기 마음을 쉽게 접지 않는 끈기 있는 인물이다. 닭싸움을 통해 관심을 끌려는 행동은 고집과 서툰 용기가 함께 드러난다.",
      evidence:
        "감자를 거절당한 뒤 점순이는 닭싸움을 반복하며 나의 반응을 이끌어 낸다.",
      explanation:
        "자기 감정을 밀고 나가는 행동을 적극성뿐 아니라 고집으로도 읽을 수 있다.",
      caption: "고개를 들고 마주 보는, 물러서지 않는 시선.",
    },
    {
      name: "나",
      tags: ["충동적임", "불안함"],
      description:
        "화를 참지 못해 행동하지만 그 결과를 깨닫고 불안해하는 인물이다. 서로 다른 감정이 한 인물 안에서 이어진다.",
      evidence:
        "계속되는 닭싸움 끝에 점순이네 수탉을 발로 차고, 이후 소작 관계에서 일어날 일을 걱정한다.",
      explanation:
        "순간적인 행동과 뒤이은 두려움이 충동성과 불안을 동시에 보여 준다.",
      caption: "욱하는 마음 뒤로 밀려오는 걱정의 그림자.",
    },
  ];
  const worksheets = Array.from({ length: 18 }, (_, i) => {
    const entry = interpretations[i % 4];
    const w = {
      id: `demo-w-${i + 1}`,
      activity_id: activity.id,
      student_label: `${String(i + 1).padStart(2, "0")}번`,
      character_name: entry.name,
      character_selection_reason:
        "같은 행동이 다른 의미로 읽힐 수 있어서 더 깊이 들여다보고 싶다.",
      personality_tags: entry.tags,
      personality_description: entry.description,
      textual_evidence: entry.evidence,
      evidence_explanation: entry.explanation,
      canonical_appearance: "외모를 확정할 만큼 구체적인 서술은 찾지 못했다.",
      imagined_appearance:
        "봄빛 아래 선 인물. 눈빛과 표정에 망설임과 용기가 함께 드러나고, 옷차림에는 농촌의 소박한 일상이 묻어난다.",
      visual_description: "부드러운 자연광, 절제된 색감, 감정이 느껴지는 시선",
      image_style: "문학 일러스트레이션",
      completed_at: now,
      created_at: now,
      submission_code: `demo-student-${i + 1}`,
    };
    w.scene = {
      name: "점순이가 나에게 감자를 건네는 사건",
      reason:
        "관심을 표현하려는 마음과 이를 알아차리지 못하는 서투름이 함께 드러나서 인상 깊었다.",
      development:
        "점순이는 일을 하던 나에게 다가와 감자를 내밀지만 나는 그 뜻을 모르고 거절한다.",
      behavior: "점순이는 감자를 내밀고 나는 고개를 돌리며 거절하는 모습이다.",
      impact: "서로 마음을 다르게 이해하는 모습이 이후 갈등으로 이어진다.",
      visual:
        "봄날의 밭가에서 감자를 든 손과 고개를 돌리는 인물을 함께 담아 두 사람 사이의 거리를 보여 준다.",
      image_style: "문학 일러스트레이션",
    };
    w.generated_prompt = createPrompt(activity, w);
    w.scene_prompt = createScenePrompt(activity, w);
    return w;
  });
  const images = Array.from({ length: 12 }, (_, i) => ({
    id: `demo-img-${i + 1}`,
    activity_id: activity.id,
    worksheet_id: worksheets[i].id,
    image_type: "character",
    slot: 0,
    image_url: `/art/portrait-${(i % 4) + 1}.svg`,
    hashtags: interpretations[i % 4].tags,
    one_line_description: interpretations[i % 4].caption,
    approval_status: i < 9 ? "approved" : "pending",
    created_at: new Date(Date.now() - (12 - i) * 180000).toISOString(),
  }));
  images.push(
    ...Array.from({ length: 8 }, (_, i) => ({
      id: "demo-scene-" + (i + 1),
      activity_id: activity.id,
      worksheet_id: worksheets[i].id,
      image_type: "scene",
      slot: 0,
      image_url: "/art/scene-" + ((i % 2) + 1) + ".svg",
      hashtags: interpretations[i % 4].tags,
      one_line_description:
        "감자를 내미는 손과 외면하는 시선 사이, 서툰 마음의 거리.",
      approval_status: i < 6 ? "approved" : "pending",
      created_at: now,
    })),
  );
  const questions = [
    {
      id: "demo-time",
      activity_id: activity.id,
      kind: "temporal",
      prompt: "작품의 계절과 시대를 짐작할 수 있는 본문 속 단서는 무엇인가요?",
      status: "CLOSED",
      summary: activity.temporal_background,
      created_at: now,
    },
    {
      id: "demo-place",
      activity_id: activity.id,
      kind: "spatial",
      prompt: "이야기가 펼쳐지는 장소와 인물들의 관계를 본문에서 찾아볼까요?",
      status: "CLOSED",
      summary: activity.spatial_background,
      created_at: now,
    },
  ];
  return {
    questions,
    responses: [],
    revoked_codes: [],
    activities: [
      activity,
      {
        ...activity,
        id: "demo-memil",
        title: "메밀꽃 필 무렵",
        author: "이효석",
        class_name: "2학년 1반",
        stage: "DRAFT",
        worksheet_token: "demo-memil-analysis",
        submission_token: "demo-memil-submit",
        introduction: "달빛 아래 길을 걷는 인물들의 관계와 마음을 살펴봅니다.",
      },
    ],
    worksheets,
    images,
    jobs: [],
  };
}
