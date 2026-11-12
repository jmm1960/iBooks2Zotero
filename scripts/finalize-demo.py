#!/usr/bin/env python3
"""Install synthetic fixture archives after PDFKit writes annotation appearances."""
from pathlib import Path
import json
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject, DictionaryObject

root = Path(__file__).resolve().parents[1] / 'demo'
archives = json.loads((root / 'archives.json').read_text())
reader = PdfReader(root / 'annotated.pdf')
writer = PdfWriter()
writer.clone_document_from_reader(reader)
for page_index, page in enumerate(writer.pages):
    for ref in page.get('/Annots', []):
        a = ref.get_object()
        a[NameObject('/T')] = TextStringObject('Open Demo')
        a.pop('/M', None)
        key = NameObject('/AAPL:' + 'AK' + 'Extras')
        a.pop(key, None)
        if a.get('/Subtype') == '/Ink':
            a[key] = DictionaryObject({NameObject('/AKAnnotationV2'): TextStringObject(archives[str(page_index)])})
writer.add_metadata({'/Author':'Apple Books Notes contributors', '/Title':'Small Ideas, Clear Notes - Annotated Demo'})
with (root / 'annotated.pdf').open('wb') as out:
    writer.write(out)
(root / 'archives.json').unlink()
