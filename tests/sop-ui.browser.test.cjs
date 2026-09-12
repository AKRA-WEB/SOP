const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://127.0.0.1:4173';
const PLAYWRIGHT_FILE = path.join('tests', 'sop-ui.playwright.js');
const REQUIRED_ASSETS = [
  'SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/Workflow.png',
  'SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/workflow2.png',
  'SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/การเบิก.png',
  'SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/การจัด.png',
  'SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/ยืนยันรับสินค้า.png',
  'SOP/Workflow_Onboarding_7day_Trials/7daytrialsOnboarding.png',
  'SOP/Workflow_Onboarding_7day_Trials/AKRA_Onboarding_7Day_Management_Proposal.pdf',
  'SOP/SOP_frontstore/SOP_แผนกในร้าน.png',
  'SOP/SOP_frontstore/SOP_แผนกหน้าร้าน.png',
  'SOP/SOP_cashieradmin/SOP_Casheir_Admin.png',
  'SOP/SOP_lalamove/TRD_SOP_Lalamove_Large.pdf'
];

function runPlaywrightCli(args) {
  const command = `npx.cmd -y @playwright/cli@latest ${args.map(String).join(' ')}`;
  const result = spawnSync(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', command], {
    cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 120000, windowsHide: true
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_error) {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('local_server_not_ready');
}

test('all supplied SOP/workflow source artifacts are readable files', () => {
  for (const relativePath of REQUIRED_ASSETS) {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    const stat = fs.statSync(absolutePath);
    assert.ok(stat.isFile() && stat.size > 0, `${relativePath} should be a non-empty file`);
  }
});

test('employee can open a guide topic, switch steps, and zoom the full image', async () => {
  const server = spawn('python', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    windowsHide: true
  });

  try {
    await waitForServer(`${BASE_URL}/index.html`);
    runPlaywrightCli(['open', `${BASE_URL}/index.html?demo=1`]);
    const output = runPlaywrightCli(['run-code', '--filename', PLAYWRIGHT_FILE]);
    assert.match(output, /SOP_UI_PASS/);
  } finally {
    try { runPlaywrightCli(['close']); } catch (_error) {}
    server.kill();
  }
});
