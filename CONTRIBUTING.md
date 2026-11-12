# Contributing

Run `npm test` before submitting changes. For native/parser changes, also run `npm run build` and `npm run demo` on macOS, then visually check the demo PDF and the Zotero preview.

Keep the geometric core independent of Zotero, PDFKit and filesystem access. Prefer focused tests of boundary behavior, path conservation and failures rather than snapshots that mirror implementation.

Do not commit personal PDFs, annotations, Zotero profiles/databases, local absolute paths, signing credentials, build caches or historical release bundles. Screenshots should use the original demo documents in this repository.

UI changes should be checked in the actual Zotero window, including opened dropdowns, keyboard selection, empty states and range-limited previews. A browser mock alone is not proof of Zotero rendering.

By contributing code you agree to distribute it under the MIT license. Include appropriate attribution and a compatible license for new third-party assets.
