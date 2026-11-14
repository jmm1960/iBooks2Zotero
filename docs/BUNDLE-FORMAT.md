# Raw annotation archive (version 1)

Only this format is supported. Earlier experimental converted-data ZIPs are not accepted.

```
manifest.json
annotations.pdf
README.txt
```

The manifest has `format: "ibooks2zotero-raw-annotations"`, `version: 1`, `payload: "annotations.pdf"`, SHA-256 hashes `payloadSHA256` and `sourceSHA256`, `sourceName`, `pageCount`, `annotationCount`, and `pages`. Each zero-based page record has `pageIndex`, `annotationCount`, `[width,height]` bounds, rotation, and an original book-content fingerprint when it has annotations. Fingerprints are computed before removing page content, never from the blank payload.

`annotations.pdf` has the original physical page order and geometry. Annotation dictionaries are copied recursively, preserving unknown fields, opaque strings, original compressed stream bytes, appearances, image masks, resources, popup/reply relationships and shared/cyclic references. References to original pages/page trees/catalog are remapped to the new blank document. Page labels, document Info, Metadata, AcroForm, optional-content properties and destination data are copied. Page body content and ordinary page resources are excluded, unless explicitly reachable through annotation dependencies.

Export does not instantiate PencilKit drawings, resample paths, group strokes, reconstruct appearances, or flatten annotations. Before accepting the payload, export reloads it and compares canonical annotation graphs, page geometry, selected document dependencies, binary-string hashes and raw-stream hashes. Unresolved references in the original remain unresolved. If this verification fails, export fails rather than silently omitting data.

The payload is an annotation-data archive, not a complete original-PDF backup. Object numbering, cross-reference tables, container serialization and indirect stream lengths can change; signatures on the source file are not retained as valid signatures. Unrelated document structures are outside its scope. Keep the original PDF when whole-file preservation is required. Referenced annotation resources may include images/text; this is not a privacy sanitization format.

Incremental-update history is deliberately excluded. Objects left orphaned or overwritten by earlier PDF saves are not reachable from the current page/catalog graph, so the importer neither restores them nor exports them. Preserve the original PDF separately when historical or forensic recovery matters.

On selection, validate manifest/hash/page inventory, then match original fingerprints against the target PDF. Only then decode supported annotations from the payload, extract highlight text/backgrounds from the target, and apply current grouping settings. Unknown annotations remain in the stored payload even if the converter reports warnings or no supported annotations. Re-exporting a ZIP writes the same payload bytes and manifest, without reprocessing or regrouping them.

ZIP entries are CRC-tested and read as streams, never extracted to arbitrary paths. Unsafe/duplicate paths, unsupported manifests, missing payloads and modified payload hashes are rejected. Limits: 10,000 entries, 128 MiB per entry, 256 MiB total uncompressed data, graph depth 200 and 100,000 copied/traversed objects. Source SHA-256 records provenance; it is not an authenticity signature.
