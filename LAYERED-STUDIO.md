# Layered Studio — 27 September 2026

Six editable gallery designs use four optimized, text-free image assets with genuine alpha cutouts. Each design has six independent image, text or color layers. Local IndexedDB preserves editable documents and drafts. Exports flatten only at delivery and retain visible edits at the selected output dimensions.

Analyze artwork submits the current Studio image to the existing analyzer; Analyze edits saves the editor document and submits its current composite. The UI guards concurrent analysis and reports daily-limit failures. No paid generation is needed for manual editing or export. Thumbnail art uses the key-art review role rather than pretending to be a Steam capsule.

Performance: editor UI is dynamically loaded, gallery canvases render near the viewport at 560px, editor previews are capped at 1600px, exports remain full resolution. Four shared WebP assets total approximately 781 KB.

Fixes: file-picker cancel events no longer dismiss the parent editor; Edit waits for stored artwork restoration; square previews stay inside their cards; direct screenshot analysis preserves editable caption layers. Mobile action controls have a dedicated row. File imports validate image signatures even when a browser supplies no MIME type; mislabeled SVG is rejected. Export extensions and analysis uploads follow the actual encoded format.

Validation: 60 offline tests passed, three opt-in Redis tests skipped (no billing/storage changes in this update). UI verification covers six templates, text edits, image replacement, export visibility, reload persistence, exact edited-image submission, quota failure, mobile layout and 4K export from a 1600px preview. Chrome, Edge, Firefox and WebKit all passed against the HTTPS release preview. These UI checks mock API responses to avoid spending credits; they verify submitted image bytes, not model output quality. WebKit is an engine check, not testing on a physical Apple device.

Assets were generated using the built-in image-generation tool. Backgrounds have no lettering; text is rendered from the document model. Original PNGs remain in the local generated-images archive; WebP copies are in public/gallery/layers.

## Final asset prompts

- ember-background: Premium 1536×1024 cinematic painterly dark-fantasy background plate; ruined castle across a misty pine valley at dusk, amber lighting and charcoal/teal palette, foreground rock ledge, architecture on the right and quiet left/lower space. No people, characters, text, logos or UI.
- ember-subject: Isolated 1024×1536 full-body hooded ranger in charcoal cloak and leather armor, three-quarter view facing left, glowing amber lantern, teal rim light, realistic anatomy, full figure inside transparent margins. Genuine alpha cutout, no landscape, floor, text or UI.
- orbit-background: Text-free 1536×1024 sci-fi background plate; luminous teal planet at upper right, violet nebula, sparse stars, orbital ring/station on right, calm dark navy left for separate titles. No foreground craft, people, lettering or UI.
- orbit-subject: Isolated 1536×1024 compact exploration ship, three-quarter view with nose lower-left, angular swept wings, charcoal armor, cyan engines and amber cockpit. Entire ship with transparent margins and genuine alpha, no space background, planet, text, logos or UI.

## Repeat the browser checks

Run `npm run test:studio -- http://localhost:3000 chrome` against a running app, or replace the URL with an HTTPS deployment. Repeat with `edge`, `firefox` and `webkit`; install the corresponding Playwright browser engines first. Screenshots and exports go to the system temporary directory (override with `DPX_QA_OUTPUT`). All artwork API calls are mocked, and no payment or generation charges are made.

The existing concept gallery and imported flattened images remain single image layers; the six new compositions provide separate backgrounds, subjects, text and accents. PNG/JPEG/WebP exports are flattened delivery files. Editable drafts persist locally in the browser.
