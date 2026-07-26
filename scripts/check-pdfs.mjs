import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(ROOT, "content", "sops");
const sops = fs.readdirSync(contentDir)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(contentDir, name), "utf8")).sops);
const errors = [];
const summaries = [];
const expectedFiles = new Set(sops.map((sop) => `${sop.id}-${sop.slug}.pdf`));
const pdfDir = path.join(ROOT, "pdf");
const manifestFile = path.join(pdfDir, "manifest.json");

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sourceHash() {
  const inputs = [
    ...listFiles(path.join(ROOT, "content")),
    ...listFiles(path.join(ROOT, "assets")),
    path.join(ROOT, "styles", "site.css"),
    path.join(ROOT, "scripts", "build.mjs"),
    path.join(ROOT, "scripts", "build-pdfs.ps1"),
    path.join(ROOT, "package-lock.json")
  ].sort((left, right) => left.localeCompare(right));
  const hash = crypto.createHash("sha256");
  for (const file of inputs) {
    hash.update(path.relative(ROOT, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

if (process.argv.includes("--write-manifest")) {
  const missing = [...expectedFiles].filter((file) => !fs.existsSync(path.join(pdfDir, file)));
  if (missing.length) {
    console.error(`Cannot write PDF manifest; missing: ${missing.join(", ")}`);
    process.exit(1);
  }
  const manifest = {
    version: 1,
    sourceHash: sourceHash(),
    pdfs: Object.fromEntries([...expectedFiles].sort().map((file) => [file, fileHash(path.join(pdfDir, file))]))
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (!fs.existsSync(manifestFile)) {
  errors.push("missing PDF freshness manifest; run npm run build:pdf");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.version !== 1) errors.push("unsupported PDF freshness manifest version");
  if (manifest.sourceHash !== sourceHash()) errors.push("PDF source fingerprint is stale; run npm run build:pdf");
  for (const file of expectedFiles) {
    const pdfFile = path.join(pdfDir, file);
    if (fs.existsSync(pdfFile) && manifest.pdfs?.[file] !== fileHash(pdfFile)) {
      errors.push(`${file}: PDF hash does not match freshness manifest`);
    }
  }
  for (const file of Object.keys(manifest.pdfs || {})) {
    if (!expectedFiles.has(file)) errors.push(`orphan PDF manifest entry ${file}`);
  }
}

for (const file of fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf"))) {
  if (!expectedFiles.has(file)) errors.push(`orphan PDF ${file}`);
}
const printCss = fs.readFileSync(path.join(ROOT, "styles", "site.css"), "utf8");
const printBodySize = printCss.match(/@media print[\s\S]*?body\s*\{[^}]*font-size:\s*([\d.]+)pt/i);
if (!printBodySize || Number(printBodySize[1]) < 14) {
  errors.push("print body text must be at least 14 pt");
}
const pdfBuildScript = fs.readFileSync(path.join(ROOT, "scripts", "build-pdfs.ps1"), "utf8");
for (const requiredMarker of ["displayHeaderFooter: true", "class=pageNumber", "class=totalPages"]) {
  if (!pdfBuildScript.includes(requiredMarker)) {
    errors.push(`PDF build is missing page-number marker ${requiredMarker}`);
  }
}

for (const sop of sops) {
  const file = path.join(ROOT, "pdf", `${sop.id}-${sop.slug}.pdf`);
  if (!fs.existsSync(file)) {
    errors.push(`${sop.id}: missing PDF`);
    continue;
  }
  const pdf = fs.readFileSync(file).toString("latin1");
  const pages = [...pdf.matchAll(/\/MediaBox\s*\[0\s+0\s+([\d.]+)\s+([\d.]+)\]/g)];
  if (!pages.length) {
    errors.push(`${sop.id}: no page MediaBox found`);
    continue;
  }
  const nonA5 = pages.find((match) => Math.abs(Number(match[1]) - 420) > 1 || Math.abs(Number(match[2]) - 595) > 1);
  if (nonA5) errors.push(`${sop.id}: PDF contains a non-A5 page (${nonA5[1]} × ${nonA5[2]} pt)`);
  if (pages.length > 16) errors.push(`${sop.id}: ${pages.length} pages exceeds the sixteen-page task limit`);
  summaries.push(`${sop.id} ${pages.length} page${pages.length === 1 ? "" : "s"}`);
}

if (errors.length) {
  console.error(`PDF check failed (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`PDF check passed: ${summaries.join(", ")}; all pages are A5 portrait.`);
