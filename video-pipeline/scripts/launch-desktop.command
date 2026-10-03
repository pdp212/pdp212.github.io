#!/bin/bash
# ==============================================================================
# Video Pipeline — Desktop Launcher
# Double-click this file or run it to launch Video Pipeline Desktop App
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR" || exit 1

npm run desktop:dev
