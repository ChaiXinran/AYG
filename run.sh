#!/usr/bin/env sh
cd "$(dirname "$0")"
site="${1:-home}"
node scripts/build-site.js "$site" || exit 1
npx --yes serve dist -p 3000 --no-clipboard
