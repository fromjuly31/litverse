import { z } from "zod";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_PARAGRAPHS = 300;
export const MAX_PARAGRAPH_LENGTH = 12000;
export const MAX_TEXT_LENGTH = 120000;
export const textStudySchema = z
  .object({
    enabled: z.boolean(),
    source_name: z.string().max(260).default(""),
    source_id: z.string().uuid().optional(),
    paragraphs: z
      .array(
        z.object({
          id: z.string().max(160),
          text: z
            .string()
            .trim()
            .min(1, "비어 있는 본문 문단을 입력하거나 삭제해 주세요.")
            .max(
              MAX_PARAGRAPH_LENGTH,
              "한 문단은 12,000자 이내로 정리해 주세요.",
            ),
          page: z.number().int().min(1).optional(),
          source_name: z.string().max(260).optional(),
        }),
      )
      .max(MAX_PARAGRAPHS),
  })
  .refine(
    (value) => !value.enabled || value.paragraphs.length > 0,
    "본문 학습에 사용할 문단을 하나 이상 선택해 주세요.",
  )
  .refine(
    (value) =>
      value.paragraphs.reduce(
        (sum, paragraph) => sum + paragraph.text.length,
        0,
      ) <= MAX_TEXT_LENGTH,
    "본문은 총 120,000자 이내로 선택해 주세요.",
  );

export function textStudyValue(activity) {
  return (
    activity?.settings?.text_study || {
      enabled: false,
      source_name: "",
      paragraphs: [],
    }
  );
}

// Join PDF text fragments into lines, then group lines by spacing and indentation.
// Coordinates use a unit page so the same hit areas work at every zoom level.
export function textParagraphs(items, width, height, page = 1) {
  const lines = [];
  const fragments = items
    .filter((item) => item.text?.trim())
    .sort((a, b) =>
      Math.abs(a.y - b.y) < Math.min(a.height, b.height) * 0.45
        ? a.x - b.x
        : a.y - b.y,
    );
  for (const item of fragments) {
    let line = lines.findLast(
      (line) =>
        Math.abs(line.y - item.y) < Math.max(line.height, item.height) * 0.45 &&
        item.x >= line.x &&
        item.x - line.right < Math.max(item.height * 3, width * 0.04),
    );
    if (!line) {
      lines.push({
        ...item,
        right: item.x + item.width,
        bottom: item.y + item.height,
      });
      continue;
    }
    const gap = item.x - line.right;
    line.text += `${gap > item.height * 0.12 && !line.text.endsWith(" ") && !item.text.startsWith(" ") ? " " : ""}${item.text}`;
    line.right = Math.max(line.right, item.x + item.width);
    line.bottom = Math.max(line.bottom, item.y + item.height);
    line.height = Math.max(line.height, item.height);
  }
  const groups = [];
  for (const line of lines) {
    const previous = groups.findLast((group) => {
      const last = group.lines.at(-1);
      const gap = line.y - last.y;
      const aligned = Math.abs(line.x - group.x) < line.height * 1.8;
      const newIndent =
        line.x - last.x > line.height * 0.65 &&
        /[.!?。…」”]$/.test(last.text.trim());
      const previousShort =
        last.right - last.x < group.right - group.x - line.height * 2;
      return (
        gap > line.height * 0.6 &&
        gap < line.height * 1.9 &&
        aligned &&
        !newIndent &&
        !previousShort
      );
    });
    if (previous) {
      previous.lines.push(line);
      previous.x = Math.min(previous.x, line.x);
      previous.right = Math.max(previous.right, line.right);
      previous.bottom = Math.max(previous.bottom, line.bottom);
    } else groups.push({ ...line, lines: [line] });
  }
  return groups.map((group, index) => ({
    id: `${page}:text:${index}`,
    page,
    text: group.lines
      .map((line) => line.text.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    rect: {
      x: Math.max(0, group.x / width),
      y: Math.max(0, group.y / height),
      width: Math.min(1, (group.right - group.x) / width),
      height: Math.min(1, (group.bottom - group.y) / height),
    },
  }));
}

export function speechSegments(text, limit = 150) {
  const segments = [];
  const expression = /[^.!?。！？\n]+[.!?。！？\n]*|[.!?。！？\n]+/g;
  for (const match of text.matchAll(expression)) {
    let offset = match.index;
    let remaining = match[0];
    while (remaining.length) {
      let length = Math.min(limit, remaining.length);
      if (length < remaining.length) {
        const space = remaining.lastIndexOf(" ", length);
        if (space > limit / 2) length = space + 1;
        if (/[\uD800-\uDBFF]/.test(remaining[length - 1])) length--;
      }
      segments.push({ text: remaining.slice(0, length), offset });
      remaining = remaining.slice(length);
      offset += length;
    }
  }
  return segments.filter((segment) => segment.text.trim());
}
