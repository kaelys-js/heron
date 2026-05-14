source "https://rubygems.org"

# Root Gemfile — repo-wide Ruby tooling pinned for lefthook + CI.
# `mise install` puts the right Ruby on PATH; `bundle install` then
# resolves these gems against it. Both lefthook and `.github/workflows/
# test.yml` call rufo via `bundle exec rufo` so the local + CI versions
# match exactly.
#
# Why a root Gemfile (not just iOS's): rufo is used by the pre-commit
# hook across the WHOLE repo (every .rb file — apply-brand helpers,
# scripts/native/, etc.), not just iOS. Keeping iOS's Gemfile narrow
# (fastlane + cocoapods) prevents the iOS bundler from getting bloated
# with formatter deps it doesn't need.

ruby "~> 3.3"

# rufo — opinionated Ruby formatter. Matches the pre-commit lefthook
# step + the CI `format` job. Bump when the formatter ships breaking
# style changes (rare).
gem "rufo", "~> 0.18"
