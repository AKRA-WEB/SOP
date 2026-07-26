import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlFiles = [
  path.join(ROOT, "index.html"),
  path.join(ROOT, "inventory.html"),
  ...fs.readdirSync(path.join(ROOT, "sops"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(ROOT, "sops", name))
];
const errors = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const label = path.relative(ROOT, file);
  const h1Count = (html.match(/<h1(?:\s|>)/g) || []).length;
  if (h1Count !== 1) errors.push(`${label}: expected one h1, found ${h1Count}`);
  if (/\son[a-z]+\s*=/i.test(html)) errors.push(`${label}: inline event handler found`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) continue;
    const clean = target.split("#")[0].split("?")[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(resolved)) errors.push(`${label}: broken local reference ${target}`);
  }
}

const sopPacks = fs.readdirSync(path.join(ROOT, "content", "sops"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(ROOT, "content", "sops", name), "utf8")));
for (const pack of sopPacks) {
  for (const sop of pack.sops) {
    const file = path.join(ROOT, "sops", `${sop.slug}.html`);
    const html = fs.readFileSync(file, "utf8");
    const stepCount = (html.match(/<li class="step(?:\s[^"]*)?">/g) || []).length;
    if (stepCount !== sop.steps.length) {
      errors.push(`${sop.id}: generated ${stepCount} steps, expected ${sop.steps.length}`);
    }
    const printProblemCount = (html.match(/<div class="print-problem">/g) || []).length;
    if (printProblemCount !== sop.problems.length) {
      errors.push(`${sop.id}: generated ${printProblemCount} print problems, expected ${sop.problems.length}`);
    }
  }
}

if (errors.length) {
  console.error(`Generated-site check failed (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Generated-site check passed: ${htmlFiles.length} pages, local links/assets intact.`);
