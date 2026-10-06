// Captures README screenshots from a running dev server using the Chrome already on the machine.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });
const pages = ["overview", "map", "grading", "golden", "releases"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(`${base}/#/${p}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${out}/${p}${theme === "dark" ? "-dark" : ""}.png`, fullPage: p !== "overview" });
      console.log(`${out}/${p}${theme === "dark" ? "-dark" : ""}.png`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
