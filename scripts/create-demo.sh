#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
"${PYTHON:-python3}" scripts/create-demo.py
swiftc -O -module-cache-path .build/module-cache scripts/AnnotateDemo.swift -o .build/annotate-demo
.build/annotate-demo demo
"${PYTHON:-python3}" scripts/finalize-demo.py
if [ -x src/native/books-parser ]; then
  src/native/books-parser parse demo/annotated.pdf .build/demo-parsed.json
  src/native/books-parser inspect demo/clean.pdf .build/demo-clean.json 0,1,2
  node scripts/check-demo.cjs .build/demo-parsed.json .build/demo-clean.json
  node scripts/create-demo-bundle.cjs
fi
