# Frontline SOP content standard

## Stable task contract

One SOP covers one job outcome. Its stable ID does not change when wording or
screenshots change. Every SOP records:

- title, app, audience, access class, owner, and approver;
- source app version, SOP revision, review dates, and publication status;
- purpose, prerequisites, estimated time, numbered actions, and expected result;
- one safe visual with alt text, caption, dimensions, and numbered callout for
  every executable step;
- troubleshooting, stop/escalate rules, and related SOP IDs.

Draft content may use a named operational role followed by `รอยืนยันชื่อ`, but
cannot become approved until a person is recorded as owner and approver.

## Directories

- `content/portfolio.json`: app/workflow/governance inventory
- `content/sops/<app>.json`: canonical SOP records
- `assets/<app>/`: versioned, safe UI crops or approved illustrations
- `sops/`: generated task pages; never hand-edit
- `pdf/`: generated A5 review copies

## Thai writing rules

- Use short sentences and one user action per step.
- Preserve exact visible UI labels in Thai or English.
- Say what correct output looks like after every action.
- Separate “ข้อมูลยังไม่บันทึก” from “บันทึกแล้วแต่ส่งต่อไม่สำเร็จ”.
- Use explicit stop conditions for duplicate, permission, stale-version, and
  uncertain-delivery risks.
- Do not expose implementation details unless the employee must act on them.

## Visual and privacy rules

- Exact controls use current UI screenshots, never AI approximations.
- Use Mock Mode or approved test data. Crop to the action/decision area.
- Remove or avoid names, customer details, document IDs, tokens, private URLs,
  commercial values, and other production identifiers.
- Every asset states its source app version in the generated caption.
- Replace a visual when the labeled control, state, or decision path changes.

## Presentation rules

- Each app reads as one orderly handbook: short cover, clickable contents,
  preparation, numbered normal flow, completion check, symptom-based help,
  stop/escalate rules, and document control at the end.
- Keep governance metadata out of the frontline opening flow. Show it in the
  final document-control section using familiar Thai labels.
- Screen output uses semantic landmarks, sequential headings, keyboard focus,
  a skip link, minimum 44 px interactive targets, and a 390 px layout check.
- Wide exact-UI screenshots may use deterministic focus windows from the same
  source image so important text remains readable without creating a mock UI.
- Print output uses A5 portrait CSS, grayscale-safe text labels, controlled page
  breaks, a contents page, footer page numbers, and eager image loading before
  print/PDF generation.
- The same JSON content generates both outputs; generated HTML is not a second
  editable source.

## Publication gate

A task remains a draft until factual owner review, representative employee
comprehension review, asset/privacy checks, and access classification pass.
Public, Main SSO-restricted, or mixed hosting is decided before deployment.
