import { assetUrl } from "./paths.js";
// Only the bundled illustrative fixtures are mapped. Student uploads are untouched.
export function artworkSource(url) {
  if (/^\/art\/portrait-[1-4]\.svg$/.test(url || "")) {
    const number = Number(url.match(/portrait-(\d)/)[1]);
    return assetUrl(
      [
        "/art/literary-girl.webp",
        "/art/literary-boy.webp",
        "/art/literary-girl-reserved.webp",
        "/art/literary-boy-defiant.webp",
      ][number - 1],
    );
  }
  if (/^\/art\/scene-[12]\.svg$/.test(url || ""))
    return assetUrl("/art/literary-landscape.webp");
  return url?.startsWith("/art/") ? assetUrl(url) : url;
}
