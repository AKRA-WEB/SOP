# AKRA Frontline SOP

Task-based Thai employee SOPs generated from one structured content source.

## Current state

- Review packs: all nine current apps, using the source versions recorded in `content/portfolio.json`
- Output: one responsive handbook page and one paginated A5 handbook PDF per app
- Publishing: local review only until the public/restricted access model is approved
- Legacy recovery: branch `archive/legacy-v1` at commit `53f1fa9`

## Commands

Prerequisites: Node.js/npm and Python 3. Run `npm install` once from the pinned
lockfile before building PDFs. The first install may need network access.

```powershell
npm run validate
npm run build
npm run build:pdf
npm run check
```

The build writes the landing page to `index.html`, the workflow inventory to
`inventory.html`, and task pages to `sops/`. Open a task page and use
**พิมพ์ / บันทึก PDF** to produce an A5 copy from the same content.

## Source layout

- `content/portfolio.json`: portfolio workflow and governance inventory
- `content/sops/*.json`: canonical task instructions
- `CONTENT-STANDARD.md`: writing, visual, privacy, and publication contract
- `assets/<app>/`: safe, versioned example visuals
- `styles/site.css`: responsive and A5 print presentation
- `scripts/build.mjs`: deterministic HTML generator
- `scripts/build-pdfs.ps1`: A5 PDF generator using the built task pages
- `scripts/validate.mjs`: metadata, coverage, asset, privacy, and version checks

Do not place secrets, production customer data, private URLs, employee
passwords, tokens, or unredacted screenshots in this repository.
