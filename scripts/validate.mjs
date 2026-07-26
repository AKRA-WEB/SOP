import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE = path.resolve(ROOT, "..");
const CONTENT_DIR = path.join(ROOT, "content", "sops");

const REQUIRED_PACKS = [
  "shared",
  "main",
  "pr",
  "po",
  "gr",
  "returnitem",
  "kpitracker",
  "trdakra",
  "akra-w5",
  "picking"
];

const APP_DIRS = {
  main: "Main",
  pr: "PR",
  po: "PO",
  gr: "GR",
  returnitem: "Returnitem",
  kpitracker: "KPITracker",
  trdakra: "TRDAKRA",
  "akra-w5": "AKRA",
  picking: "Picking"
};

const errors = [];
const warnings = [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(ROOT, file)}: ${error.message}`);
    return null;
  }
}

function requireValue(value, label) {
  if (value === undefined || value === null || value === "") {
    errors.push(`${label} is required`);
  }
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const portfolio = readJson(path.join(ROOT, "content", "portfolio.json"));
const sopFiles = fs.existsSync(CONTENT_DIR)
  ? fs.readdirSync(CONTENT_DIR).filter((name) => name.endsWith(".json"))
  : [];
const packs = sopFiles.map((name) => readJson(path.join(CONTENT_DIR, name))).filter(Boolean);

if (portfolio) {
  const packIds = new Set((portfolio.packs || []).map((pack) => pack.id));
  for (const id of REQUIRED_PACKS) {
    if (!packIds.has(id)) errors.push(`portfolio is missing pack ${id}`);
  }
  for (const pack of portfolio.packs || []) {
    for (const field of ["id", "name", "sourceVersion", "ownerRole", "approverRole", "access", "verification"]) {
      requireValue(pack[field], `portfolio.${pack.id || "unknown"}.${field}`);
    }
    if (!Array.isArray(pack.workflows) || pack.workflows.length === 0) {
      errors.push(`portfolio.${pack.id}.workflows must not be empty`);
    }
    const appDir = APP_DIRS[pack.id];
    if (!appDir) continue;
    const versionFile = path.join(WORKSPACE, appDir, "version.json");
    if (!fs.existsSync(versionFile)) {
      warnings.push(`${pack.id}: local app version unavailable outside the portfolio workspace`);
      continue;
    }
    const versionData = readJson(versionFile);
    const actual = versionData && String(versionData.version || versionData.VERSION || "");
    const expected = String(pack.sourceVersion).split("-")[0];
    if (actual && actual !== expected) {
      errors.push(`${pack.id}: SOP inventory version ${expected} does not match local ${actual}`);
    }
  }
}

const portfolioPackById = new Map((portfolio?.packs || []).map((pack) => [pack.id, pack]));
const sopIds = new Set();
const referencedAssets = new Set([path.normalize("assets/favicon.svg")]);
for (const pack of packs) {
  requireValue(pack.app, "content pack app");
  requireValue(pack.sourceVersion, `${pack.app}.sourceVersion`);
  const inventoryPack = portfolioPackById.get(pack.app);
  if (!inventoryPack) {
    errors.push(`${pack.app}: canonical SOP pack is missing from portfolio inventory`);
  } else if (String(inventoryPack.sourceVersion) !== String(pack.sourceVersion)) {
    errors.push(`${pack.app}: content sourceVersion ${pack.sourceVersion} does not match portfolio ${inventoryPack.sourceVersion}`);
  }
  const appDir = APP_DIRS[pack.app];
  const versionFile = appDir && path.join(WORKSPACE, appDir, "version.json");
  if (versionFile && fs.existsSync(versionFile)) {
    const versionData = readJson(versionFile);
    const actual = versionData && String(versionData.version || versionData.VERSION || "");
    const expected = String(pack.sourceVersion).split("-")[0];
    if (actual && actual !== expected) {
      errors.push(`${pack.app}: content sourceVersion ${expected} does not match local ${actual}`);
    }
  }
  for (const sop of pack.sops || []) {
    if (sopIds.has(sop.id)) errors.push(`duplicate SOP id ${sop.id}`);
    sopIds.add(sop.id);
    for (const field of ["id", "slug", "title", "audience", "access", "owner", "approver", "status", "revision", "purpose"]) {
      requireValue(sop[field], `${sop.id || "unknown"}.${field}`);
    }
    if (String(sop.owner).includes("รอยืนยัน") || String(sop.approver).includes("รอยืนยัน")) {
      warnings.push(`${sop.id}: named owner/approver confirmation remains pending`);
    }
    if (!sop.reviewedOn || !sop.nextReviewOn) {
      warnings.push(`${sop.id}: review dates remain pending while status is ${sop.status}`);
    }
    if (!Array.isArray(sop.steps) || sop.steps.length === 0) {
      errors.push(`${sop.id}.steps must not be empty`);
      continue;
    }
    if (!Array.isArray(sop.successChecklist) || sop.successChecklist.length === 0) {
      errors.push(`${sop.id}.successChecklist must not be empty`);
    }
    for (const [index, decision] of (sop.decisions || []).entries()) {
      for (const field of ["symptom", "meaning", "response"]) {
        requireValue(decision[field], `${sop.id}.decisions[${index}].${field}`);
      }
    }
    sop.steps.forEach((step, index) => {
      const label = `${sop.id}.steps[${index}]`;
      for (const field of ["title", "action", "expected"]) requireValue(step[field], `${label}.${field}`);
      if (!step.visual) {
        errors.push(`${label}.visual is required`);
        return;
      }
      for (const field of ["src", "alt", "caption", "width", "height"]) {
        requireValue(step.visual[field], `${label}.visual.${field}`);
      }
      const asset = path.join(ROOT, step.visual.src || "");
      referencedAssets.add(path.normalize(step.visual.src || ""));
      if (!fs.existsSync(asset)) {
        errors.push(`${label}: missing asset ${step.visual.src}`);
      } else if (path.extname(asset).toLowerCase() === ".png") {
        const size = pngSize(asset);
        if (!size || size.width !== step.visual.width || size.height !== step.visual.height) {
          errors.push(`${label}: declared dimensions do not match ${step.visual.src}`);
        }
      }
      const callout = step.visual.callout;
      if (!callout || !Number.isFinite(callout.top) || !Number.isFinite(callout.left)) {
        errors.push(`${label}: numeric callout top/left are required`);
      }
      for (const [focusIndex, focus] of (step.visual.focuses || []).entries()) {
        const focusLabel = `${label}.visual.focuses[${focusIndex}]`;
        for (const field of ["label", "x", "y", "width", "height"]) {
          requireValue(focus[field], `${focusLabel}.${field}`);
        }
        if (
          !Number.isFinite(focus.x) ||
          !Number.isFinite(focus.y) ||
          !Number.isFinite(focus.width) ||
          !Number.isFinite(focus.height) ||
          focus.width <= 0 ||
          focus.height <= 0 ||
          focus.x < 0 ||
          focus.y < 0 ||
          focus.x + focus.width > step.visual.width ||
          focus.y + focus.height > step.visual.height
        ) {
          errors.push(`${focusLabel}: focus rectangle must stay inside the source image`);
        }
      }
    });
    (sop.problems || []).forEach((problem, index) => {
      const label = `${sop.id}.problems[${index}]`;
      requireValue(problem.symptom, `${label}.symptom`);
      requireValue(problem.response, `${label}.response`);
      if (Array.isArray(problem.response) && problem.response.length === 0) {
        errors.push(`${label}.response must not be empty`);
      }
      if (problem.visual) {
        for (const field of ["src", "alt", "caption", "width", "height"]) {
          requireValue(problem.visual[field], `${label}.visual.${field}`);
        }
        const asset = path.join(ROOT, problem.visual.src || "");
        referencedAssets.add(path.normalize(problem.visual.src || ""));
        if (!fs.existsSync(asset)) {
          errors.push(`${label}: missing asset ${problem.visual.src}`);
        } else if (path.extname(asset).toLowerCase() === ".png") {
          const size = pngSize(asset);
          if (!size || size.width !== problem.visual.width || size.height !== problem.visual.height) {
            errors.push(`${label}: declared dimensions do not match ${problem.visual.src}`);
          }
        }
        const callout = problem.visual.callout;
        if (callout && (!Number.isFinite(callout.top) || !Number.isFinite(callout.left))) {
          errors.push(`${label}: numeric callout top/left are required`);
        }
        for (const [focusIndex, focus] of (problem.visual.focuses || []).entries()) {
          const focusLabel = `${label}.visual.focuses[${focusIndex}]`;
          for (const field of ["label", "x", "y", "width", "height"]) {
            requireValue(focus[field], `${focusLabel}.${field}`);
          }
          if (
            !Number.isFinite(focus.x) ||
            !Number.isFinite(focus.y) ||
            !Number.isFinite(focus.width) ||
            !Number.isFinite(focus.height) ||
            focus.width <= 0 ||
            focus.height <= 0 ||
            focus.x < 0 ||
            focus.y < 0 ||
            focus.x + focus.width > problem.visual.width ||
            focus.y + focus.height > problem.visual.height
          ) {
            errors.push(`${focusLabel}: focus rectangle must stay inside the source image`);
          }
        }
      }
    });
  }
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const assetsDir = path.join(ROOT, "assets");
for (const asset of fs.existsSync(assetsDir) ? listFiles(assetsDir) : []) {
  const relative = path.normalize(path.relative(ROOT, asset));
  if (!referencedAssets.has(relative)) errors.push(`orphan asset ${relative}`);
}

for (const pack of packs) {
  for (const sop of pack.sops || []) {
    for (const related of sop.related || []) {
      if (!sopIds.has(related)) errors.push(`${sop.id}: unknown related SOP ${related}`);
    }
  }
}

const scanFiles = [path.join(ROOT, "content", "portfolio.json"), ...sopFiles.map((name) => path.join(CONTENT_DIR, name))];
const unsafePatterns = [
  /script\.google\.com\/macros\//i,
  /bearer\s+[a-z0-9._-]+/i,
  /AKfy[a-z0-9_-]{20,}/i,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/
];
for (const file of scanFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of unsafePatterns) {
    if (pattern.test(text)) errors.push(`${path.relative(ROOT, file)} matched unsafe pattern ${pattern}`);
  }
}

if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const sopCount = packs.reduce((total, pack) => total + (pack.sops || []).length, 0);
const stepCount = packs.reduce(
  (total, pack) => total + (pack.sops || []).reduce((sum, sop) => sum + sop.steps.length, 0),
  0
);
console.log(`Validation passed: ${portfolio.packs.length} packs, ${sopCount} SOPs, ${stepCount} visual steps.`);
