# Changelog

All notable changes to this project will be documented in this file. The
format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
with versions cut by [Release Please](https://github.com/googleapis/release-please)
on each merge of a `chore(main): release` PR.

## [0.2.0](https://github.com/kaelys-js/heron/compare/v0.1.0...v0.2.0) (2026-05-29)


### ✨ Features

* native-release follow-ups, CI cache hardening, connect UX ([#139](https://github.com/kaelys-js/heron/issues/139)) ([f023544](https://github.com/kaelys-js/heron/commit/f023544055f06df55becac8e37d898a1fb7be254))


### 🐛 Bug Fixes

* **brand:** rename bundle id to com.resistjs.heron, derive consumers ([#136](https://github.com/kaelys-js/heron/issues/136)) ([02a0e95](https://github.com/kaelys-js/heron/commit/02a0e959b84f8070b15358a9e029260f8376fd35))


### 👷 CI

* expand caching, re-enable native jobs, oxlint + brand fixes ([#141](https://github.com/kaelys-js/heron/issues/141)) ([6be3422](https://github.com/kaelys-js/heron/commit/6be342203b8e21865e743119f7d24263b31c04da))
* **test:** run Android Espresso tests on an inline-booted emulator ([#138](https://github.com/kaelys-js/heron/issues/138)) ([c899712](https://github.com/kaelys-js/heron/commit/c89971238934d7f5c1110a5659f3ed9daa32923b))


### 🔧 Chore

* **screenshots:** refresh README PNGs ([#137](https://github.com/kaelys-js/heron/issues/137)) ([3afb980](https://github.com/kaelys-js/heron/commit/3afb980e97b41e997edbf9aa47af150387468f50))
* **screenshots:** refresh README PNGs ([#140](https://github.com/kaelys-js/heron/issues/140)) ([46bc379](https://github.com/kaelys-js/heron/commit/46bc3794226461396cf9ecf0a8ff2434318b23c2))
* **screenshots:** refresh README PNGs ([#142](https://github.com/kaelys-js/heron/issues/142)) ([16ffd1f](https://github.com/kaelys-js/heron/commit/16ffd1f3552fb9c1332bec9080fd9cf9e84de427))

## [0.1.0] — 2026-05-15

Initial release post-fork. The project diverged significantly from its
upstream (multi-user RBAC, native iOS / macOS apps, Better Auth, autonomous
apply pipeline, full Vitest matrix, per-user Playwright sessions) and the
prior version line no longer mapped meaningfully onto the current
architecture. New entries start from here; the pre-fork release log lives
in the upstream repository (`santifer/career-ops`).

See the git history for the full set of changes that produced this baseline.
