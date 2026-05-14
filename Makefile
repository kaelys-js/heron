# career-ops — one-shot commands for native apps + general dev.
#
# Every target maps to a script in scripts/native/. Same as the pnpm
# scripts in package.json — pick whichever you prefer.
#
#   make help          # print this menu (default)
#   make setup         # interactive setup wizard
#   make dev           # web dev server only
#   make dev-desktop   # web + Electron with HMR
#   make dev-ios       # web + iOS sim + Xcode
#   make build-desktop # local DMG/exe/AppImage
#   make build-ios     # TestFlight upload
#   make icons         # regenerate all platform icons
#   make release V=patch  # bump+tag+push (V can be patch/minor/major or x.y.z)

.PHONY: help setup dev dev-desktop dev-ios build-desktop build-ios icons brand release verify

help:
	@node scripts/native/help.mjs

setup:
	@node scripts/native/setup.mjs

dev:
	@cd ui && pnpm dev

dev-desktop:
	@node scripts/native/dev-desktop.mjs

dev-ios:
	@node scripts/native/dev-ios.mjs

build-desktop:
	@node scripts/native/build-desktop.mjs

build-ios:
	@node scripts/native/build-ios-testflight.mjs

icons:
	@node scripts/native/icons.mjs

brand:
	@node scripts/native/apply-brand.mjs

V ?= patch
release:
	@node scripts/native/release.mjs $(V)

verify:
	@pnpm test
