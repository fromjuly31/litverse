import { hasDemoAccess, accessError } from "./demo-access.js";
import {
  lifeErrors,
  lifeLabelSchema,
  lifeQuestionSchema,
  lifeResponseSchema,
} from "../utils/life-connection.js";

export async function demoLife(state, action, payload) {
  if (!action.startsWith("life/")) return { handled: false };
  const done = (result, changed = false) => ({
    handled: true,
    result,
    changed,
  });
  const fail = (error) => {
    throw new Error(lifeErrors[error] || error);
  };
  state.life_questions ||= {};
  state.life_responses ||= {};

  if (["life/teacher-get", "life/start", "life/close"].includes(action)) {
    const { id } = payload;
    if (
      !(await hasDemoAccess(state, "admin", payload.__admin)) &&
      !(await hasDemoAccess(state, id, payload.__access))
    )
      accessError();
    if (!state.activities.some((activity) => activity.id === id))
      fail("수업을 찾을 수 없어요.");
    const prompt = state.life_questions[id] || null;
    const responses = Object.values(state.life_responses[id] || {});
    if (action === "life/teacher-get") return done({ prompt, responses });
    if (action === "life/close") {
      if (!prompt) fail("LIFE_NOT_STARTED");
      prompt.is_open = false;
      return done(prompt, true);
    }
    const question = lifeQuestionSchema.parse(payload.question);
    if (
      prompt &&
      prompt.question !== question &&
      (prompt.is_open || responses.length)
    )
      fail("LIFE_QUESTION_LOCKED");
    state.life_questions[id] = { question, is_open: true };
    return done(state.life_questions[id], true);
  }

  if (action === "life/student-get" || action === "life/student-submit") {
    const lesson = state.activities.find(
      (activity) => activity.worksheet_token === payload.token,
    );
    if (!lesson) fail("유효하지 않은 학생 참여 링크예요.");
    const { id, title, author } = lesson;
    if (
      typeof payload.code !== "string" ||
      !/^[a-f0-9]{48}$/.test(payload.code)
    )
      fail("유효하지 않은 학생 참여 코드예요.");
    const prompt = state.life_questions[id] || null;
    const submitted = (state.life_responses[id] ||= {});
    const response = submitted[payload.code] || null;
    if (action === "life/student-get")
      return done({ activity: { id, title, author }, prompt, response });
    if (!prompt) fail("LIFE_NOT_STARTED");
    if (prompt.question !== payload.question) fail("LIFE_QUESTION_CHANGED");
    const entry = lifeResponseSchema.parse(payload);
    if (response) {
      if (Object.entries(entry).some(([key, value]) => response[key] !== value))
        fail("LIFE_ALREADY_SUBMITTED");
      return done(response);
    }
    if (!prompt.is_open) fail("LIFE_CLOSED");
    const saved = {
      ...entry,
      student_label: lifeLabelSchema.parse(payload.student_label),
      submitted_at: new Date().toISOString(),
    };
    submitted[payload.code] = saved;
    return done(saved, true);
  }
  fail("요청한 기능을 찾을 수 없습니다.");
}
