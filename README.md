# AKRA Frontline SOP

The current `index.html` is the Main-authenticated SOP hub. It reads guide
metadata and authorized files from `sop-api`; the static JSON library below is
a retained historical publication, not the current hub's content source.

## Current state

- Retained library: July 26 publication `79b53e655bc245c0635bb014699f8db84534a558`, with the historical app versions in `content/portfolio.json`
- Retained output: one responsive handbook page and one paginated A5 handbook PDF per app
- These historical instructions have not been reviewed against today's app versions; preservation checks do not approve new publication
- Legacy recovery: branch `archive/legacy-v1` at commit `53f1fa9`

## Commands

Safe retained-library verification requires Node.js/npm and no install,
network access, regeneration, or changes to the current hub:

```powershell
npm run check:retained
```

`validate --retained` requires the exact canonical content and source versions
pinned in `scripts/retained-docs.json`, then runs all structural, asset and
privacy checks. The generated-site and PDF checks retain link, document shape,
source freshness, exact PDF hash and A5/page-limit assertions. Text source
fingerprints use LF line endings; binary asset and PDF hashes stay byte exact.

The existing `validate` command still checks historical stamps against current
sibling apps and correctly denies stale versions. The old `check` command is
also preserved; it is not the current hub's acceptance command. **Do not run
`build` or `build:pdf` in the active hub checkout:** the legacy generator writes
its old landing page over `index.html`. A future content refresh/rebuild needs
its own reviewed scope and an isolated historical-library workspace.

## Source layout

- `content/portfolio.json`: portfolio workflow and governance inventory
- `content/sops/*.json`: canonical task instructions
- `CONTENT-STANDARD.md`: writing, visual, privacy, and publication contract
- `assets/<app>/`: safe, versioned example visuals
- `styles/site.css`: responsive and A5 print presentation
- `scripts/build.mjs`: deterministic HTML generator
- `scripts/build-pdfs.ps1`: A5 PDF generator using the built task pages
- `scripts/validate.mjs`: metadata, coverage, asset, privacy, and version checks
- `scripts/retained-docs.json`: accepted historical source identity, canonical content hashes, and app-version stamps

Do not place secrets, production customer data, private URLs, employee
passwords, tokens, or unredacted screenshots in this repository.
