#!/usr/bin/env bash
# lint-native.sh -- every multi-language linter (Swift / Kotlin / Python /
# Shell / Ruby / TOML / YAML / dotenv / plist) run as ONE blocking unit.
# Wrapped by the `//#lint:native` Turbo task (content-hash cached) and run
# by pre-commit, pre-push, and CI via `turbo run lint:native` -- 100% parity.
#
# Each tool is `command -v`-guarded: present (CI always; locally after
# `mise install`) -> it RUNS and BLOCKS on violations; genuinely absent ->
# it logs a skip rather than failing the machine. Scopes mirror CI exactly
# (git ls-files of tracked files) so local and CI can't drift.
set -euo pipefail
cd "$(dirname "$0")/../.."

have() { command -v "$1" >/dev/null 2>&1; }
ls0() { git ls-files -z "$@"; }

echo "▸ swiftlint"
if have swiftlint; then swiftlint --strict --quiet --no-cache ui/ios/App; else echo "skip: swiftlint not installed"; fi

echo "▸ ktlint"
if have ktlint; then ls0 '*.kt' | xargs -0 -r ktlint; else echo "skip: ktlint not installed"; fi

echo "▸ ruff"
if have ruff; then
  ls0 '*.py' | xargs -0 -r ruff format --check
  ls0 '*.py' | xargs -0 -r ruff check
else echo "skip: ruff not installed"; fi

echo "▸ shfmt"
if have shfmt; then ls0 '*.sh' '*.bash' | xargs -0 -r shfmt -d -i 2 -ci; else echo "skip: shfmt not installed"; fi

echo "▸ rufo"
if have rufo; then ls0 '*.rb' 'Gemfile' | xargs -0 -r rufo -x --check; else echo "skip: rufo not installed"; fi

echo "▸ taplo"
if have taplo; then ls0 '*.toml' | xargs -0 -r taplo format --check; else echo "skip: taplo not installed"; fi

echo "▸ yamllint"
if have yamllint; then ls0 '*.yml' '*.yaml' | xargs -0 -r yamllint --no-warnings; else echo "skip: yamllint not installed"; fi

echo "▸ dotenv-linter"
if have dotenv-linter; then dotenv-linter check --ignore-checks UnorderedKey --skip-updates .env.example .env.act.example; else echo "skip: dotenv-linter not installed"; fi

echo "▸ plists"
if have python3; then python3 scripts/system/validate-plists.py; else echo "skip: python3 not installed"; fi

echo "▸ actionlint"
if have actionlint; then
  if have shellcheck; then actionlint -shellcheck=shellcheck; else actionlint; fi
else echo "skip: actionlint not installed"; fi

echo "✓ lint-native: all installed linters passed"
