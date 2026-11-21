import { request } from "../services/api.js";
import { worksheetPage } from "./worksheet.js";
import { submissionPage } from "./submission.js";
import { backgroundStudent } from "./background.js";
import { deepeningStudent } from "./deepening-student.js";
import { watchStudentPhase } from "../services/student-phase.js";
import { lifeStudent } from "./life-connection.js";
export async function studentPage(root, path) {
  const [, , rawToken, mode, sessionId] = path.split("/");
  const token = decodeURIComponent(rawToken || "");
  if (mode === "life") return lifeStudent(root, token);
  const studentLink = { token, phase: mode === "deepening" ? mode : undefined };
  const activity = await request("student/activity", studentLink);
  let dispose;
  const showingDeepening =
    mode === "deepening" ||
    (activity.deepening_session_id &&
      activity.active_phase === "deepening" &&
      !path.endsWith("/understanding"));
  if (showingDeepening)
    dispose = await deepeningStudent(root, activity, token, sessionId);
  else if (path.startsWith("/submit/"))
    dispose = submissionPage(root, activity, token);
  else if (activity.stage === "BACKGROUND")
    dispose = backgroundStudent(root, activity, token);
  else dispose = worksheetPage(root, activity, token);
  const unwatch = watchStudentPhase(root, activity, {
    token,
    phase: showingDeepening ? "deepening" : undefined,
  });
  return () => {
    dispose?.();
    unwatch();
  };
}
