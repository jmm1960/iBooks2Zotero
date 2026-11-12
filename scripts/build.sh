#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache dist
for arch in arm64 x86_64; do
  swiftc -O -module-cache-path .build/module-cache -target "$arch-apple-macosx12.0" \
    src/native/BooksParser.swift -o ".build/books-parser-$arch"
done
lipo -create .build/books-parser-arm64 .build/books-parser-x86_64 -output src/native/books-parser
codesign --force --sign - src/native/books-parser
VERSION=$(node -p 'require("./src/manifest.json").version')
rm -f "dist/iBooks2Zotero-$VERSION.xpi"
(cd src && zip -q -r "../dist/iBooks2Zotero-$VERSION.xpi" . -x '*.DS_Store')
zip -q -j "dist/iBooks2Zotero-$VERSION.xpi" LICENSE
printf 'Built dist/iBooks2Zotero-%s.xpi\n' "$VERSION"
