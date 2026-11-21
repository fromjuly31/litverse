import { code, token, uuid } from "./validation.js";
import { check, fail, hmac, limit } from "./server.js";
import { lessonOwner } from "./lesson-access.js";
import {
  lifeErrors,
  lifeLabelSchema,
  lifeQuestionSchema,
  lifeResponseSchema,
} from "../../src/utils/life-connection.js";

const questionFields = "question,is_open";
const responseFields =
  "article_url,article_summary,answer,student_label,submitted_at";
const safeResponse = ({ participant_hash, activity_id, ...response }) =>
  response;
function lifeCheck(result) {
  const error = result.error?.message;
  if (lifeErrors[error]) fail(409, lifeErrors[error]);
  return check(result);
}

export async function lifeAction(db, req, context, action, input) {
  if (!action.startsWith("life/")) return { handled: false };
  const done = (value) => ({ handled: true, value });
  if (["life/teacher-get", "life/start", "life/close"].includes(action)) {
    const id = uuid.parse(input.id);
    await lessonOwner(db, req, id);
    if (action !== "life/teacher-get") {
      const question = lifeCheck(
        await db.rpc("control_life_question", {
          p_activity: id,
          p_question:
            action === "life/start"
              ? lifeQuestionSchema.parse(input.question)
              : null,
        }),
      );
      return done({ question: question.question, is_open: question.is_open });
    }
    const [prompt, rows] = await Promise.all([
      db
        .from("life_questions")
        .select(questionFields)
        .eq("activity_id", id)
        .maybeSingle(),
      db
        .from("life_responses")
        .select(responseFields)
        .eq("activity_id", id)
        .order("submitted_at")
        .order("participant_hash"),
    ]);
    return done({ prompt: check(prompt), responses: check(rows) });
  }
  if (action === "life/student-get" || action === "life/student-submit") {
    const submitting = action === "life/student-submit";
    await limit(
      db,
      `life:${action}:${context.ip || "local"}`,
      submitting ? 250 : 1200,
      600,
    );
    const activity = check(
      await db
        .from("activities")
        .select("id,title,author")
        .eq("worksheet_token_hash", hmac(`qr:${token.parse(input.token)}`))
        .eq("deletion_pending", false)
        .maybeSingle(),
    );
    if (!activity) fail(404, "유효하지 않은 학생 참여 링크예요.");
    const hash = hmac(`life:${code.parse(input.code)}`);
    if (submitting) {
      return done(
        safeResponse(
          lifeCheck(
            await db.rpc("submit_life_response", {
              p_activity: activity.id,
              p_hash: hash,
              p_label: lifeLabelSchema.parse(input.student_label),
              p_question: lifeQuestionSchema.parse(input.question),
              p_entry: lifeResponseSchema.parse(input),
            }),
          ),
        ),
      );
    }
    const [prompt, response] = await Promise.all([
      db
        .from("life_questions")
        .select(questionFields)
        .eq("activity_id", activity.id)
        .maybeSingle(),
      db
        .from("life_responses")
        .select(responseFields)
        .eq("activity_id", activity.id)
        .eq("participant_hash", hash)
        .maybeSingle(),
    ]);
    return done({ activity, prompt: check(prompt), response: check(response) });
  }
  fail(404, "요청한 기능을 찾을 수 없습니다.");
}
