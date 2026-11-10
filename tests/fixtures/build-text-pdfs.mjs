import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:65px;font-family:'Malgun Gothic','Noto Sans CJK KR',sans-serif;color:#111;background:white}h1{font-size:34px;margin:0 0 70px}p{font-size:26px;line-height:1.9;margin:0 0 60px}.page{break-after:page}</style><section class="page"><h1>함께 읽는 이야기</h1><p>봄바람이 불어오던 아침, 소녀는 오래된 책을 펼쳤다. 책 속에는 작은 마을의 이야기가 담겨 있었다.</p><p>그는 인물의 말과 행동을 천천히 읽으며 마음의 변화를 생각했다.</p></section><section><p>서로의 생각을 나누자 같은 문장에서도 새로운 의미가 드러났다.</p></section>`;
const browser = await chromium.launch(
  process.platform === "win32" ? { channel: "msedge" } : {},
);
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1415 },
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await writeFile(
    new URL("text-study.pdf", import.meta.url),
    await page.pdf({ format: "A4", printBackground: true }),
  );
  await page.setContent(
    html
      .replace("font-size:26px", "font-size:36px")
      .replace("font-size:34px", "font-size:44px")
      .replace("<section><p>", '<section style="display:none"><p>'),
  );
  await page.evaluate(() => document.fonts.ready);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 96 });
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1000 /Height 1415 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(
      "<< /Length 31 >>\nstream\nq 595 0 0 842 0 0 cm /Im0 Do Q\nendstream",
    ),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  });
  chunks.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`,
    ),
  );
  await writeFile(
    new URL("text-study-scan.pdf", import.meta.url),
    Buffer.concat(chunks),
  );
} finally {
  await browser.close();
}
