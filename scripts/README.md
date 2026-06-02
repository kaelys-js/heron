# scripts/

Node (`.mjs`) and Python helpers that back CI gates, branding, release
automation, the scanner, and the tracker. Hand-rolled `*.test.mjs` files
sit next to the script they cover and run standalone (`node x.test.mjs`),
not under vitest, so pre-commit and CI can run them without booting the
vitest workspace.

## Symbolicating client stacks (`scripts/system/symbolicate.mjs`)

Production client error stacks are persisted minified (the build's
`.js.map` files are NOT shipped to browsers). To read one, recover the
build's maps locally and run the offline symbolicator. A persisted client
error carries the build id (`<version>+<build>`) the telemetry handler
folds into the stack as a leading `build:` line, so you know which build's
maps to use.

```sh
# Pipe a stack on stdin, point --maps at the build's client output:
pbpaste | node scripts/system/symbolicate.mjs --maps ui/build/client

# Or from a file (e.g. one pulled from a Settings → Diagnostics bundle):
node scripts/system/symbolicate.mjs --file stack.txt --maps ui/build/client
```

Each `…/<chunk>.js:LINE:COL` frame is rewritten to
`originalSource:function:line:col`. A frame whose map is missing passes
through unchanged, so output is never worse than the input. `--build` is
accepted for documentation of which build the stack came from. `source-map`
is a dev-only dependency (the standard map consumer); it is never bundled
into the app. Exit `2` when the maps directory is missing or no stack was
provided.

## Logging (`scripts/lib/logger.mjs`)

New or edited scripts that need to surface a problem to a human should
emit through the shared logger rather than hand-rolling the GitHub
annotation string:

```js
import { error, warn, notice } from '../lib/logger.mjs'; // from scripts/system|native
error('3 targets below threshold');
error('cobertura.xml missing', { file: 'scripts/x.mjs', line: 12 });
```

What it does:

- Under GitHub Actions (`GITHUB_ACTIONS` set) it emits a workflow-command
  annotation -- `::error file=...,line=...::message` /  `::warning::` /
  `::notice::` -- with the message and any `file`/`line`/`col` property
  values escaped per the Actions rules (`%`/`\r`/`\n`, plus `,`/`:` in
  property values). Multiline messages no longer truncate the annotation.
- It prefixes every CI annotation with `[run <GITHUB_RUN_ID>]` when the
  run id is present, so overlapping runs (a push plus a scheduled sweep
  landing in the same window) stay disambiguable in shared log views.
- Locally (no `GITHUB_ACTIONS`) it prints a plain `error: <msg>` /
  `warning: <msg>` / `notice: <msg>` line with no annotation noise.

`error`/`warn` write to stderr; `notice` writes to stdout (notices are
advisory). The escaping + prefixing live in the pure
`formatAnnotation(level, msg, props, env)` -- unit-tested in
`scripts/lib/logger.test.mjs`.

## Exit-code convention

A convention for NEW and EDITED gating scripts (the verifiers and checks
that CI / lefthook run to pass-or-fail a change). It is NOT a mass
retrofit -- existing scripts adopt it when touched.

| Code | Meaning | Example |
|------|---------|---------|
| `0` | OK -- no violations | all coverage targets meet threshold |
| `1` | Expected failure -- the gate found a real violation in the input it checks | a target below threshold; deflection language in the diff |
| `2` | Setup / input error -- the gate could not run as intended | a required file missing; malformed JSON/YAML; bad CLI args |
| `3` | Transient environment error -- retry may succeed | a network/service call the script depends on timed out |

Why separate `1` from `2`/`3`: a `1` means the change under test is at
fault and the author must fix it; a `2` means the gate's own inputs are
wrong (wrong directory, missing artifact) and re-running won't help until
that is fixed; a `3` is worth a retry. Collapsing them all into `1` hides
"the gate is misconfigured" behind "your change failed".

Pair the exit code with a logger `error()` line that explains which case
fired, so the annotation and the code agree.
