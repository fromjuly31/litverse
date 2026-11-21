import { z } from "zod";

export const DOCENT_DURATION_SECONDS = 20;
export const DOCENT_SCRIPT_LIMIT = 120;
export const DOCENT_VOICE_DESCRIPTION_LIMIT = 160;

export const docentSchema = z.object({
  script: z.string().trim().min(1).max(DOCENT_SCRIPT_LIMIT),
  voice_description: z
    .string()
    .trim()
    .min(1)
    .max(DOCENT_VOICE_DESCRIPTION_LIMIT),
});

export const DOCENT_BUCKET = "literature-docents";

export function docentPath(imagePath) {
  return imagePath.replace(/\.(webp|png|jpg)$/, ".wav");
}
