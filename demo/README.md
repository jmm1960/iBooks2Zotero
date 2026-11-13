# Original demonstration material

- `clean.pdf`: the PDF to add to Zotero as the target attachment.
- `annotated.pdf`: the PDF source to select in the importer. Three pages: two annotated, one intentionally empty.
- `annotations.zip`: a smaller source bundle with the same annotations and page fingerprints, raw drawing archives, and approximate transparent previews. No book page images are included.
- Both have the same original page content. There is no third-party book content and no personal data.

The pen strokes are synthetic `PKDrawing` data, wrapped in a minimal archive with the keys consumed by this parser. Standard PDF ink appearances make the source viewable in other readers. This fixture tests our parser's expected representation; **it is not an Apple Books export and does not prove compatibility with every Apple Books version**. No Apple private framework is used to generate it.

The PDF text, pen strokes, highlights, and comments are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generators also carry the project's MIT license. The screenshots may include Zotero interface elements and use this original demo content; no ownership of Zotero or Apple trademarks is claimed.

## Reproduce

On macOS, install Python `reportlab` and `pypdf` in your environment, then run `npm run demo`. This also verifies content fingerprints and parsed strokes if the native parser has already been built.

## Demonstrate

1. Add `clean.pdf` to a new Zotero item.
2. Select it and open **Tools → iBooks2Zotero…**.
3. Choose `annotated.pdf` or `annotations.zip` as the source. Leave the default range `1–3`.
4. Review page 1 and page 2. Change split order or gaps to observe grouping.
5. Click **Append annotations** and open the Zotero PDF reader to inspect editable native annotations.
6. Range `3–3` is an empty-source example. Range `2–2` processes the second page only.

Avoid repeatedly appending to the same demo attachment unless duplicates are intended. Replacement first removes all native annotations in the chosen range, including notes created by hand in Zotero.
