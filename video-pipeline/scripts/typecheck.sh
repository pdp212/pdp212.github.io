#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "VIDEO PIPELINE — TYPE INTEGRITY CHECK"
echo "=================================================="

cd "$(dirname "$0")/.."
npx tsc --noEmit
echo "✔ TypeScript compilation check passed with 0 errors."
