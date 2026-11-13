# Annotation ZIP format (v1)

A source bundle can replace the annotated source PDF, not the target PDF in Zotero. It contains all successfully parsed source annotations, independent of the current import range. Grouping settings/results are intentionally not stored; strokes can be regrouped on import.

```text
manifest.json
README.txt
page-0001.strokes.json
page-0001.notes.json
page-0001-annotation-01.apple.plist
page-0001-annotation-01.drawing
page-0001-annotation-01.png
page-0001-annotation-01.preview.json
...
```

`manifest.json` has `format: "ibooks2zotero-bundle"`, `version: 1`, `pageCount`, `legacy`, `warnings`, `sourceName`, and `pages`. Each page records a zero-based `pageIndex`, `pageLabel`, `[width,height]` PDF bounds, rotation, a SHA-256 page-content fingerprint, and relative filenames for strokes, notes, and Apple archives. Filenames use one-based physical PDF pages. A single enclosing folder is accepted when importing.

- Stroke JSON: an array of `{color, points}`, with points `[x,y,width]` in PDF coordinates (origin at bottom left). It is sampled data used for conversion, not a lossless replacement for the original archive.
- Notes JSON: highlight/text-note type, rectangle(s), color, text, and comment.
- Apple archive: the original binary keyed archive, kept intact.
- Drawing: decoded PencilKit drawing data, including properties not represented by the simplified stroke JSON.
- PNG/preview JSON: approximate transparent stroke rendering, with drawing-space bounds and drawing size. These previews are for browsing and are not needed for import. Empty drawings have no PNG. They do not claim to reproduce pressure, pen texture, or erasing exactly.

No source PDF, book-page background images, Zotero IDs, import history, or current grouping configuration is included. Warnings and unsupported original annotation metadata cannot be recovered from parsed data alone.

## Legacy extraction ZIPs

The earlier extraction format uses an array in `manifest.json` with one-based `pdf_page`, `annotation`, `type`, and `rectangle`, and files such as `page-174-annotation-01.apple.plist`. Handwriting is decoded from the original archive, using its drawing dimensions to map points onto the selected target PDF. Legacy `.strokes.json` uses a different, drawing-space schema and is not mistaken for normalized PDF coordinates.

These archives do not contain page fingerprints or the complete original page count. The selected PDF supplies page backgrounds and total page count. The importer checks referenced page indices and drawing aspect ratios but cannot establish document identity. It requires explicit edition confirmation before importing. Legacy highlights use stored rectangles with a default yellow color; original quadrilaterals/colors may be unavailable. Re-export retains `legacy: true` and empty fingerprints, preventing a legacy bundle from being relabeled as a verified source.

Other ZIPs, unsupported manifest versions, missing data files, unsafe/duplicate paths and references, and invalid coordinates are rejected. Limits: 10,000 entries, 64 MiB per entry, 256 MiB total uncompressed data, and 2 million stroke sample points. Archive entries are read directly as streams, not extracted to arbitrary filesystem paths. Export builds a temporary bundle before writing the chosen destination.
