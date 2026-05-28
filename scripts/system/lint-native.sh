#!/usr/bin/env bash
# lint-native.sh [tool] -- the multi-language linters.
#
# With NO arg, runs ALL of them (local "lint everything" convenience). With a
# single tool arg (swift/kotlin/python/shell/ruby/toml/yaml/dotenv/plist/
# actionlint) it runs just that one -- which is how the per-tool
# `//#lint:<tool>` Turbo tasks invoke it, so each caches INDEPENDENTLY: a
# `.swift` edit busts only `lint:swift`, never ktlint/ruff/etc. This is the
# ONE source of truth -- pre-commit, pre-push, and CI all reach these same
# invocations through the turbo tasks. Each tool is `command -v`-guarded:
# present (CI always; locally after `mise install`) -> RUNS and BLOCKS;
# absent -> logs a skip. Scopes mirror CI (git ls-files of tracked files).
set -euo pipefail
cd "$(dirname "$0")/../.."

have() { command -v "$1" >/dev/null 2>&1; }
ls0() { git ls-files -z "$@"; }

lint_swift() {
  echo "▸ swiftlint"
  if have swiftlint; then swiftlint --strict --quiet --no-cache ui/ios/App; else echo "skip: swiftlint not installed"; fi
}
lint_kotlin() {
  echo "▸ ktlint"
  if have ktlint; then ls0 '*.kt' | xargs -0 -r ktlint; else echo "skip: ktlint not installed"; fi
}
lint_python() {
  echo "▸ ruff"
  if have ruff; then
    ls0 '*.py' | xargs -0 -r ruff format --check
    ls0 '*.py' | xargs -0 -r ruff check
  else echo "skip: ruff not installed"; fi
}
lint_shell() {
  echo "▸ shfmt"
  if have shfmt; then ls0 '*.sh' '*.bash' | xargs -0 -r shfmt -d -i 2 -ci; else echo "skip: shfmt not installed"; fi
}
lint_ruby() {
  echo "▸ rufo"
  if have rufo; then ls0 '*.rb' 'Gemfile' | xargs -0 -r rufo -x --check; else echo "skip: rufo not installed"; fi
}
lint_toml() {
  echo "▸ taplo"
  if have taplo; then ls0 '*.toml' | xargs -0 -r taplo format --check; else echo "skip: taplo not installed"; fi
}
lint_yaml() {
  echo "▸ yamllint"
  if have yamllint; then ls0 '*.yml' '*.yaml' | xargs -0 -r yamllint --no-warnings; else echo "skip: yamllint not installed"; fi
}
lint_dotenv() {
  echo "▸ dotenv-linter"
  if have dotenv-linter; then dotenv-linter check --ignore-checks UnorderedKey --skip-updates .env.example .env.act.example; else echo "skip: dotenv-linter not installed"; fi
}
lint_plist() {
  echo "▸ plists"
  if have python3; then python3 scripts/system/validate-plists.py; else echo "skip: python3 not installed"; fi
}
lint_actionlint() {
  echo "▸ actionlint"
  if have actionlint; then
    if have shellcheck; then actionlint -shellcheck=shellcheck; else actionlint; fi
  else echo "skip: actionlint not installed"; fi
}

case "${1:-all}" in
  swift) lint_swift ;;
  kotlin) lint_kotlin ;;
  python) lint_python ;;
  shell) lint_shell ;;
  ruby) lint_ruby ;;
  toml) lint_toml ;;
  yaml) lint_yaml ;;
  dotenv) lint_dotenv ;;
  plist) lint_plist ;;
  actionlint) lint_actionlint ;;
  all)
    lint_swift
    lint_kotlin
    lint_python
    lint_shell
    lint_ruby
    lint_toml
    lint_yaml
    lint_dotenv
    lint_plist
    lint_actionlint
    echo "✓ lint-native: all installed linters passed"
    ;;
  *)
    echo "unknown lint tool: $1" >&2
    exit 2
    ;;
esac
