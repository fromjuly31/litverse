import { request, isDemo, supabase } from "./api.js";
import { putDocument, getDocument } from "./document-store.js";

export async function saveLessonPdf(id, study, file) {
  if (!file || !study.source_id) return;
  if (isDemo) return putDocument(id, study.source_id, file);
  const job = await request("teacher/pdf-init", {
    id,
    source_id: study.source_id,
    size: file.size,
  });
  const { error } = await supabase.storage
    .from("literature-texts")
    .uploadToSignedUrl(job.path, job.token, file, {
      contentType: "application/pdf",
    });
  if (error && !/already|duplicate|exists/i.test(error.message))
    throw new Error(
      "본문은 저장했지만 PDF 첨부가 완료되지 않았어요. 다시 저장해 주세요.",
    );
}
export async function readLessonPdf(id, source, name) {
  let blob;
  if (isDemo) blob = await getDocument(id, source);
  else {
    const { url } = await request("teacher/pdf-url", { id, source_id: source });
    const response = await fetch(url);
    if (!response.ok) throw new Error("첨부된 PDF를 내려받지 못했어요.");
    blob = await response.blob();
  }
  if (!blob)
    throw new Error(
      "이 기기에 첨부된 PDF가 없어요. PDF를 다시 첨부해 주세요. 저장한 본문 문단은 유지됩니다.",
    );
  return new File([blob], name || "본문.pdf", { type: "application/pdf" });
}
