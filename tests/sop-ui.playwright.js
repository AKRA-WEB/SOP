async page => {
  await page.goto('http://127.0.0.1:4173/index.html?demo=1');
  await page.waitForFunction(() => document.querySelectorAll('[data-guide-row]').length >= 8);
  const stockRow = page.locator('[data-guide-row]').filter({ hasText: 'Workflow การเบิกเติมสต๊อก AKRA' });
  if (await stockRow.count() !== 1) throw new Error('stock_workflow_topic_missing');
  await stockRow.locator('[data-select-guide]').click();
  await page.locator('[data-modal]').waitFor({ state: 'visible' });
  if (await page.locator('[data-modal-preview] img').count() !== 1) throw new Error('topic_did_not_open_image');
  const stepButtons = page.locator('[data-modal-assets] [data-preview-asset]');
  if (await stepButtons.count() < 5) throw new Error('workflow_steps_missing');
  await stepButtons.nth(3).click();
  const selectedAlt = await page.locator('[data-modal-preview] img').getAttribute('alt');
  if (!selectedAlt.includes('การจัด')) throw new Error('step_image_did_not_switch');
  await page.locator('[data-modal-zoom]').click();
  const zoomed = await page.locator('[data-modal]').evaluate(node => node.classList.contains('modal--zoomed'));
  if (!zoomed) throw new Error('full_step_zoom_did_not_activate');
  return 'SOP_UI_PASS';
}
