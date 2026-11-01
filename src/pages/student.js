import { request } from "../services/api.js";
import { worksheetPage } from "./worksheet.js";
import { submissionPage } from "./submission.js";
import { backgroundStudent } from "./background.js";
import { deepeningStudent } from "./deepening-student.js";
import { watchStudentPhase } from "../services/student-phase.js";
export async function studentPage(root, path) {
  const token = decodeURIComponent(path.split("/")[2] || "");
  const activity = await request("student/activity", { token });
  let dispose;
  if (
    path.endsWith("/deepening") ||
    (activity.deepening_session_id &&
      activity.active_phase === "deepening" &&
      !path.endsWith("/understanding"))
  )
    dispose = await deepeningStudent(root, activity, token);
  else if (path.startsWith("/submit/"))
    dispose = submissionPage(root, activity, token);
  else if (activity.stage === "BACKGROUND")
    dispose = backgroundStudent(root, activity, token);
  else dispose = worksheetPage(root, activity, token);
  const unwatch = watchStudentPhase(root, activity, token);
  return () => {
    dispose?.();
    unwatch();
  };
}
