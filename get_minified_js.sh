#!/usr/bin/env bash

API=https://closure-compiler.appspot.com/compile
INPUT=strictdown.js
OUTPUT=strictdown.min.js

curl -s "$API" \
    -d "compilation_level=SIMPLE_OPTIMIZATIONS" \
    -d "exclude_default_externs=true" \
    -d "output_format=text" \
    -d "output_info=compiled_code" \
    -d "language=ECMASCRIPT5_STRICT" \
    --data-urlencode "js_code@$INPUT" \
    -o "$OUTPUT"

sed -i "1s/^\('use strict';\)\([^{]*\){/;\2{\1/" "$OUTPUT"