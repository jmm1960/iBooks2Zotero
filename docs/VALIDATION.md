# Validation: 0.3.4

Validated on macOS with Zotero 10.0.9.

- `npm test`: 4 synthetic geometry/conversion tests pass.
- `npm run build`: Apple Silicon + Intel Swift compilation succeeds; universal parser is ad-hoc signed; XPI generated.
- Demo parser check: clean/source page count and annotated-page content fingerprints agree; no parser warnings.
- The source has 13 synthetic pen strokes, 2 standard PDF highlights and 1 text note across 2 of 3 pages.
- Default grouping produces 11 annotations: 8 ink groups, 2 highlights, 1 note. All 13 paths survive conversion.
- Actual Zotero import from `demo/annotated.pdf` into a newly imported `demo/clean.pdf` succeeds with 11 native annotations. Zotero item types independently confirm the 8/2/1 counts.
- The reader displays the highlight, its comment, the separate note, and ink previews in its annotation sidebar.
- `docs/images/import-preview.jpg` and `docs/images/zotero-annotations.jpg` are actual application screenshots taken with these original fixtures. No commercial book or personal annotation content is included.

The fixture exercises the specific archive structure supported by the parser. It does not validate every Apple Books release or all possible PDF annotations. Earlier private book tests are deliberately excluded from the public repository.


## 0.4.0 localization and public release

- Eight Node tests pass: geometry, locale precedence/fallback, catalog keys/parameters, translation references, and Chinese source confinement.
- A synthetic unsupported PDF Ink annotation emits a structured `warning.type` record; an encrypted PDF emits error code 4. These map to localized UI text.
- Rebuilt the universal native helper and XPI successfully. The original demo still produces 13 strokes and 11 annotations without warnings.
- Installed iBooks2Zotero 0.4.0 in Zotero 10.0.9. Add-on state confirms it is active; Zotero and app locale both report `en-US`.

- Actual English Zotero UI: source parsing, dynamic counts, page dropdown, and clear confirmation were checked. Clear was cancelled; all 11 existing demo annotations remained.
- Chinese UI and clear confirmation were checked with an isolated copy of the same bootstrap code using a Chinese locale resolver; the actual installed dialog resources were used. This did not modify Zotero's language setting.
- New English/Chinese import screenshots are `import-preview-en.jpg` and `import-preview-zh.jpg`. They show the original fixture in real Zotero windows.
