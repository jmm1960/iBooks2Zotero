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

## 0.5.0 annotation ZIPs

- Thirteen Node regression tests pass, including full bundle data round trips, regrouping, legacy provenance retention, invalid metadata, path/reference checks, and localization.
- Real Zotero ZIP APIs exported the original demo from parsed PDF data and read the resulting ZIP back. Strokes, notes/comments, page fingerprints, and raw Apple archives matched exactly. The ZIP had 14 files, including two transparent previews, and was about 34 KiB.
- Imported the restored data into a new, dedicated demo PDF attachment: 11 native annotations were saved.
- Read the earlier private extraction ZIP with its enclosing directory through the actual ZIP reader and native legacy adapter: 2550 strokes and 74 groups. A local coordinate comparison against the original PDF extraction found a maximum floating-point difference below 1e-9 PDF points. Private input files are not included in the repository.
- Two malformed/unsupported ZIPs and a mismatched target PDF were rejected. Cancelling legacy edition confirmation preserved all target annotation IDs.
- Export PNGs are approximate stroke previews, not original PDF appearance images. Original archives/drawing data remain intact; no book page backgrounds are included in the ZIP.
- The native helper cache now uses immutable content hashes to avoid repeatedly overwriting an executable cached by macOS code-signature validation.
- The 0.5.0 add-on installed successfully. The final file-picker/button visual pass could not be completed because desktop window control became unavailable; the actual ZIP read/write and import APIs were exercised successfully in Zotero before that interruption.
