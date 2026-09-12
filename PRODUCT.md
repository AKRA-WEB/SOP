# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: HTML/CSS/JS in `index.html`, with Main SSO and a Supabase Edge Function/API for the managed catalog and private source files.

## Users

Primary users are AKRA employees who need to find a procedure quickly while working. Secondary users are team leads and administrators who share the correct guide with a role or team.

## Product Purpose

The SOP hub is a single place to browse app guides, standard operating procedures, and work workflows. Success means a staff member can identify the right guide by role or task, open the supporting document or image, and download or share it without searching through folders.

## Positioning

The hub organizes operational guidance around the employee's role and task, while keeping the original document or SOP image available as the source artifact.

## Operating Context

The site is used on desktop computers and mobile phones in an internal work setting. Existing source artifacts include PDFs and Thai-named PNG files stored inside the `SOP` repository. Local demo mode remains available for preview; the connected mode is opened from Main with an SSO token and reads the managed catalog from Supabase.

## Capabilities and Constraints

- Search titles, descriptions, roles, and keywords.
- Filter by guide type and employee role.
- Preview a guide's source artifact when it is an image or PDF.
- Download an individual artifact and copy/share its link.
- Use Main SSO to identify the employee and enforce the `app-manual` audience.
- Allow ADMIN users to create, edit, publish, archive, tag, and upload PDF/image source files through the Admin console.
- Keep source files in a private Supabase Storage bucket and expose time-limited signed URLs to the UI.
- Publication status is explicit: `draft`, `published`, or `archived`; employee views receive published documents only.

## Brand Commitments

The product name is AKRA SOP Hub. Thai is the primary interface language, with short English labels only where they help identify a system or file type. The voice should be clear, calm, and action-oriented.

## Evidence on Hand

The repository currently contains onboarding, cashier/admin, front-store, and AKRA stock-replenishment source artifacts under `SOP/`. The existing generated handbook content is present in Git history but the working tree has broad unrelated deletions; this task does not restore or rewrite those files.

## Product Principles

- Start from the employee's job, not the folder name.
- Make the next action obvious: read, download, or share.
- Keep source artifacts visible and attributable.
- Prefer a fast, forgiving search over deep navigation.
- Treat role and publication status as explicit metadata, not hidden assumptions.

## Accessibility & Inclusion

The web UI should support keyboard navigation, visible focus states, readable contrast, large touch targets, responsive layouts, and reduced-motion preferences. Thai copy must remain legible at increased text size.
