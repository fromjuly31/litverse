import { request } from "../services/api.js";
import { worksheetPage } from "./worksheet.js";
import { submissionPage } from "./submission.js";
import { backgroundStudent } from "./background.js";
export async function studentPage(root, path) {
  const token = decodeURIComponent(path.split("/")[2] || "");
  const activity = await request("student/activity", { token });
  if (path.startsWith("/submit/")) return submissionPage(root, activity, token);
  if (activity.stage === "BACKGROUND")
    return backgroundStudent(root, activity, token);
  return worksheetPage(root, activity, token);
}
