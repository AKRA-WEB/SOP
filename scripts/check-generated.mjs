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
// The generated library now links to the signed-session application hub. Its
// sole static auth-return handler is intentional; generated documents still
// prohibit all inline handlers. Dynamic reader templates are tested at runtime.
const hubAuthReturnTag = '<button class="button button--outline" type="button" data-auth-main hidden onclick="returnToMain()">';
// Pin the existing frozen hub favicon and its element, not arbitrary data URIs.
const hubFaviconTag = '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'8\' fill=\'%23111b22\'/%3E%3Cpath d=\'M8 9h16v4H8zM8 18h10v4H8z\' fill=\'%23f47b43\'/%3E%3C/svg%3E">';

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const label = path.relative(ROOT, file);
  // Retain real script/link attributes, while excluding JS strings and comments
  // from HTML structure/reference checks.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1</script>");
  const h1Count = (markup.match(/<h1(?:\s|>)/g) || []).length;
  if (h1Count !== 1) errors.push(`${label}: expected one h1, found ${h1Count}`);
  let allowedHubHandler = false;
  for (const tag of markup.match(/<[^>]+>/g) || []) {
    if (!/\son[a-z]+\s*=/i.test(tag)) continue;
    if (label === "index.html" && tag === hubAuthReturnTag && !allowedHubHandler) {
      allowedHubHandler = true;
    } else {
      errors.push(`${label}: inline event handler found`);
    }
  }
  for (const tag of markup.match(/<[^>]+>/g) || []) {
    for (const match of tag.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) continue;
      if (label === "index.html" && tag === hubFaviconTag) continue;
      const clean = target.split("#")[0].split("?")[0];
      if (!clean) continue;
      const resolved = path.resolve(path.dirname(file), clean);
      if (!fs.existsSync(resolved)) errors.push(`${label}: broken local reference ${target}`);
    }
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
