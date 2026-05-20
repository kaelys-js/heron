#!/usr/bin/env ruby
# add-xcode-targets -- programmatically add the 3 iOS extension targets
# to App.xcodeproj using the xcodeproj gem.
#
# Without this script, the user has to do 3 File→New→Target dances in Xcode
# AND manually link the source files in Extensions/AppWidget/ etc. With this
# script, one `ruby add-xcode-targets.rb` does it all.
#
# Targets created:
#   • AppWidget          -- Widget Extension (small/medium/circular)
#   • AppLiveActivity    -- Widget Extension w/ ActivityKit
#   • AppShareExtension  -- Share Extension
#
# All three get:
#   • Their Swift source from ui/ios/App/Extensions/AppXxx/ (or WatchApp/)
#   • Bundle ID: com.heron.app.{widget,liveactivity,share}
#   • App Group capability: group.com.heron.app
#   • Deployment target: matches main app
#
# Safe to re-run -- checks if a target already exists before adding.

require "xcodeproj"
require "fileutils"
require "plist"
require "set"

PROJECT_PATH = File.expand_path("App.xcodeproj", Dir.pwd)
unless File.exist?(PROJECT_PATH)
  puts "✗ App.xcodeproj not found in #{Dir.pwd}"
  puts "  Run this from ui/ios/App/"
  exit 1
end

project = Xcodeproj::Project.open(PROJECT_PATH)
main_target = project.targets.find { |t| t.name == "App" }
unless main_target
  puts "✗ Main 'App' target not found in #{PROJECT_PATH}"
  exit 1
end
puts "✓ opened #{PROJECT_PATH}"

deployment_target = main_target.build_configurations.first.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] || "15.0"
team_id = main_target.build_configurations.first.build_settings["DEVELOPMENT_TEAM"]
app_group = "group.com.heron.app"
bundle_root = "com.heron.app"

# ── PrivacyInfo.xcprivacy -- Apple privacy manifest, required for App
# Store submission since May 2024. Must be in the App target's Copy
# Bundle Resources phase so it ships inside the .app bundle.
privacy_manifest_path = File.expand_path("App/PrivacyInfo.xcprivacy", File.dirname(PROJECT_PATH))
if File.exist?(privacy_manifest_path)
  app_group_ref = project.main_group.find_subpath("App", true)
  app_group_ref.set_source_tree("<group>")
  privacy_basename = "PrivacyInfo.xcprivacy"

  already_referenced = app_group_ref.files.any? { |f| f.path == privacy_basename }
  unless already_referenced
    file_ref = app_group_ref.new_reference(privacy_basename)
    resources_phase = main_target.resources_build_phase
    resources_phase.add_file_reference(file_ref)
    puts "✓ added App/PrivacyInfo.xcprivacy to App target's Copy Bundle Resources"
  else
    # Even if file_ref exists, make sure it's in the resources phase.
    resources_phase = main_target.resources_build_phase
    file_ref = app_group_ref.files.find { |f| f.path == privacy_basename }
    in_resources = resources_phase.files.any? { |bf| bf.file_ref == file_ref }
    unless in_resources
      resources_phase.add_file_reference(file_ref)
      puts "✓ App/PrivacyInfo.xcprivacy re-attached to App target's Copy Bundle Resources"
    end
  end
end

EXTENSIONS = [
  {
    name: "AppWidget",
    bundle_suffix: "widget",
    type: "com.apple.product-type.app-extension",
    extension_point: "com.apple.widgetkit-extension",
    source_dir: "Extensions/AppWidget",
    info_plist_extra: {},
    deployment_min: "16.0", # WidgetKit modern features need 16+
  },
  {
    name: "AppLiveActivity",
    bundle_suffix: "liveactivity",
    type: "com.apple.product-type.app-extension",
    extension_point: "com.apple.widgetkit-extension",
    source_dir: "Extensions/AppLiveActivity",
    info_plist_extra: {
      "NSSupportsLiveActivities" => true,
    },
    deployment_min: "16.1",
  },
  {
    name: "AppShareExtension",
    bundle_suffix: "share",
    type: "com.apple.product-type.app-extension",
    extension_point: "com.apple.share-services",
    source_dir: "Extensions/AppShareExtension",
    info_plist_extra: {
      "NSExtensionAttributes" => {
        "NSExtensionActivationRule" => {
          "NSExtensionActivationSupportsWebURLWithMaxCount" => 1,
          "NSExtensionActivationSupportsWebPageWithMaxCount" => 1,
        },
      },
    },
    deployment_min: "15.0",
  },
]

# ── App-target Swift sources ────────────────────────────────────────
# `cap add ios` only initializes the App target with AppDelegate.swift.
# Native features we add later (BonjourBrowser, NetworkMonitor, Biometric,
# KeychainStore, BackgroundFetcher, SpotlightIndexer, WatchSessionBridge,
# NativePlugin, ErrorReporter, Brand) live in App/*.swift on disk
# but aren't auto-added to the App target. Without this block xcodebuild
# fails: "cannot find type 'BonjourBrowser' in scope". Walk App/*.swift
# and ensure every file is in the App target's compile-sources phase.
# Safe to re-run -- checks for existing refs in both the group and the
# build phase.
app_sources_dir = File.expand_path("App", Dir.pwd)
if Dir.exist?(app_sources_dir)
  # NOTE: do NOT name this `app_group` -- the outer scope's `app_group`
  # string ('group.com.heron.app') is reused in the entitlements
  # block below. Shadowing it with a PBXGroup object corrupts the
  # entitlements file (the plist gem then Marshal-dumps the Ruby object
  # into the <data> element).
  app_files_group = project.main_group.find_subpath("App", true)
  app_files_group.set_source_tree("<group>")
  app_files_group.path = "App"

  sources_phase = main_target.source_build_phase
  in_sources = sources_phase.files.map { |bf|
    bf.file_ref ? File.basename(bf.file_ref.path.to_s) : nil
  }.compact

  added = 0
  Dir.glob(File.join(app_sources_dir, "*.swift")).sort.each do |file|
    rel = File.basename(file)
    next if in_sources.include?(rel)

    # Reuse an existing file reference if the group already has one;
    # otherwise create it.
    existing_ref = app_files_group.files.find { |f| File.basename(f.path.to_s) == rel }
    file_ref = existing_ref || app_files_group.new_file(rel)
    main_target.add_file_references([file_ref])
    puts "    + App/#{rel} → App target sources"
    added += 1
  end
  puts(added.zero? ? "✓ App target sources up-to-date" : "✓ added #{added} Swift file(s) to App target")
end

EXTENSIONS.each do |ext|
  # Extension target sources live at `ui/ios/App/<Name>/` -- same level
  # as the main App/ folder. (Earlier versions of this script used
  # `../<Name>` and silently skipped on every run; consistent with
  # turbo.json + biome.json + capacitor.integration.test.ts which all
  # use the `App/<Name>/` layout.)
  source_dir_abs = File.expand_path(ext[:source_dir], Dir.pwd)
  unless Dir.exist?(source_dir_abs)
    puts "✗ source dir not found: #{source_dir_abs}"
    next
  end

  # IDEMPOTENCY MODEL -- find existing target, REPAIR it; only create
  # if missing. Earlier this loop just `next`-ed on existing targets,
  # which masked broken state: the three extension targets were
  # already in project.pbxproj from a stale Xcode-edited run with
  # EMPTY PRODUCT_NAME (the xcodeproj gem doesn't set it automatically
  # for :app_extension), so xcodebuild emitted them as `.appex` (no
  # filename) -- duplicate output paths, build aborts. Repair runs on
  # every script invocation: ensures PRODUCT_NAME, INFOPLIST_FILE,
  # bundle id, signing settings are always correct, even if a previous
  # author hand-edited the pbxproj or an older script version omitted
  # them.
  existing_target = project.targets.find { |t| t.name == ext[:name] }
  target = if existing_target
      puts "▸ repairing target #{ext[:name]}"
      existing_target
    else
      puts "▸ adding target #{ext[:name]}"
      project.new_target(
        :app_extension,
        ext[:name],
        :ios,
        ext[:deployment_min],
        project.products_group,
        :swift
      )
    end

  # Build settings -- set EVERY time, overriding whatever was there.
  # This is critical for repairing the previously-broken state where
  # `PRODUCT_NAME` was empty (xcodebuild then emitted `.appex` with
  # no filename → duplicate-output errors → BUILD FAILED).
  target.build_configurations.each do |config|
    # PRODUCT_NAME -- the binary basename. MUST be non-empty or every
    # build-output path collapses to just `.appex`. xcodeproj gem's
    # `new_target` doesn't auto-set this for :app_extension; the
    # default `$(TARGET_NAME)` only kicks in if the build settings
    # don't override. Hand-edited / older script-produced projects
    # often have PRODUCT_NAME = "" which silently wedges xcodebuild.
    config.build_settings["PRODUCT_NAME"] = ext[:name]
    config.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = "#{bundle_root}.#{ext[:bundle_suffix]}"
    config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = ext[:deployment_min]
    config.build_settings["INFOPLIST_FILE"] = "#{ext[:source_dir]}/Info.plist"
    config.build_settings["CODE_SIGN_STYLE"] = "Automatic"
    config.build_settings["DEVELOPMENT_TEAM"] = team_id if team_id
    # SWIFT_VERSION 5.9 keeps parity with the main App target's modern
    # toolchain (Xcode 15+ default). 5.0 is the floor; 5.9 unlocks
    # parameter packs + macro support without breaking any older
    # extensions.
    config.build_settings["SWIFT_VERSION"] = "5.9"
    config.build_settings["CODE_SIGN_ENTITLEMENTS"] = "#{ext[:source_dir]}/#{ext[:source_dir]}.entitlements"
    # ENABLE_USER_SCRIPT_SANDBOXING = YES is the Xcode 15+ best-practice
    # default -- sandboxes shell scripts run in build phases so a stray
    # `rm -rf $DERIVED_DATA` in a third-party run-script phase can't
    # nuke user files outside the project tree.
    config.build_settings["ENABLE_USER_SCRIPT_SANDBOXING"] = "YES"
    config.build_settings["SKIP_INSTALL"] = "YES"
    # CURRENT_PROJECT_VERSION + MARKETING_VERSION MUST resolve to
    # non-empty strings or the extension's Info.plist will ship
    # `CFBundleVersion = ""` (because the source plist uses
    # `$(CURRENT_PROJECT_VERSION)` placeholder expansion). iOS's
    # installer then rejects the .appex with error code 17:
    # "bundleVersion must be set in placeholder attributes for an app
    # extension placeholder" -- which surfaces to the user as the
    # vague "Invalid placeholder attributes" deploy failure. Match
    # the main App target's defaults (1 / 1.0) so versions stay in
    # lockstep across host + extensions; the brand pipeline
    # (apply-brand.mjs) bumps both via MARKETING_VERSION at release.
    config.build_settings["CURRENT_PROJECT_VERSION"] = "1"
    config.build_settings["MARKETING_VERSION"] = "1.0"
  end

  # Add Swift sources from the source dir
  group = project.main_group.find_subpath(ext[:source_dir], true)
  group.set_source_tree("<group>")
  group.path = ext[:source_dir]
  swift_files = Dir.glob(File.join(source_dir_abs, "*.swift"))
  # Dedupe: only add Swift files NOT already in this target's
  # sources build phase. Re-running the script on a project that
  # already has these targets (existing_target path) would otherwise
  # double-list every file → "duplicate output file" for every
  # compiled .o, then the link step collides on `.swiftmodule`.
  sources_phase = target.source_build_phase
  already_compiled = sources_phase.files.map { |bf|
    bf.file_ref ? File.basename(bf.file_ref.path.to_s) : nil
  }.compact
  swift_files.each do |file|
    rel = File.basename(file)
    next if already_compiled.include?(rel)
    existing_ref = group.files.find { |f| File.basename(f.path.to_s) == rel }
    file_ref = existing_ref || group.new_file(rel)
    target.add_file_references([file_ref])
    puts "    + #{rel}"
  end

  # Generate Info.plist for the target
  plist_path = File.join(source_dir_abs, "Info.plist")
  unless File.exist?(plist_path)
    info_plist = {
      "CFBundleDevelopmentRegion" => "$(DEVELOPMENT_LANGUAGE)",
      "CFBundleDisplayName" => ext[:name],
      "CFBundleExecutable" => "$(EXECUTABLE_NAME)",
      "CFBundleIdentifier" => "$(PRODUCT_BUNDLE_IDENTIFIER)",
      "CFBundleInfoDictionaryVersion" => "6.0",
      "CFBundleName" => "$(PRODUCT_NAME)",
      "CFBundlePackageType" => "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
      "CFBundleShortVersionString" => "$(MARKETING_VERSION)",
      "CFBundleVersion" => "$(CURRENT_PROJECT_VERSION)",
      "NSExtension" => {
        "NSExtensionPointIdentifier" => ext[:extension_point],
      },
    }
    # ShareExtension also needs principal class.
    if ext[:bundle_suffix] == "share"
      info_plist["NSExtension"]["NSExtensionPrincipalClass"] = "$(PRODUCT_MODULE_NAME).ShareViewController"
    end
    # Merge extra fields
    ext[:info_plist_extra].each { |k, v|
      if info_plist["NSExtension"] && k == "NSExtensionAttributes"
        info_plist["NSExtension"]["NSExtensionAttributes"] = v
      else
        info_plist[k] = v
      end
    }
    File.write(plist_path, Plist::Emit.dump(info_plist))
    puts "    + Info.plist"
  end

  # Generate Entitlements with App Group + Live Activity if applicable
  entitlements_path = File.join(source_dir_abs, "#{ext[:source_dir]}.entitlements")
  unless File.exist?(entitlements_path)
    entitlements = {
      "com.apple.security.application-groups" => [app_group],
    }
    if ext[:bundle_suffix] == "liveactivity"
      entitlements["com.apple.developer.live-activities"] = true
    end
    File.write(entitlements_path, Plist::Emit.dump(entitlements))
    puts "    + #{File.basename(entitlements_path)}"
  end

  # Embed the extension in the host app target.
  # Step 1: PURGE stale embed entries. Previous script versions added
  # a new entry every run, leaving multiples; if you also hand-edited
  # the project in Xcode the dupes can point at different
  # product_references that all build to the same `.appex`. Walk the
  # phase and drop any entry whose file_ref name (or path) matches
  # this extension. After purge there are zero entries for this ext.
  embed_phase = main_target.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" }
  embed_phase ||= main_target.new_copy_files_build_phase("Embed Foundation Extensions")
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  ext_basename = "#{ext[:name]}.appex"
  embed_phase.files.dup.each do |bf|
    next unless bf.file_ref
    fr_name = bf.file_ref.path.to_s
    fr_display = bf.file_ref.display_name.to_s rescue ""
    if fr_name == ext_basename || fr_display == ext_basename || fr_name == ".appex"
      embed_phase.remove_build_file(bf)
    end
  end
  # Step 2: Add exactly one fresh entry pointing at the (now-repaired
  # PRODUCT_NAME) target's product reference.
  build_file = embed_phase.add_file_reference(target.product_reference)
  build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

  # Add explicit dependency (idempotent -- add_dependency dedupes
  # against existing PBXTargetDependency entries internally).
  main_target.add_dependency(target) unless main_target.dependencies.any? { |d| d.target == target }
  puts "  ✓ #{ext[:name]} added + linked to App target"
end

# Add App Group entitlement to the main App target too.
# Use the `plist` gem to read (Xcodeproj::Plist.read_from_path silently
# returns nil when the file has unfamiliar features like XML comments
# or $(AppIdentifierPrefix) build-vars, which would cause us to OVERWRITE
# the entitlements with an empty file and lose keychain/aps/background-
# tasks entitlements. Quick + safe shortcut: if the raw text already
# mentions the app_group string, do nothing.
main_entitlements = File.expand_path("App/App.entitlements", Dir.pwd)
if File.exist?(main_entitlements) && File.read(main_entitlements).include?(app_group)
  puts "✓ #{app_group} already in App.entitlements"
else
  existing_entitlements = nil
  if File.exist?(main_entitlements)
    begin
      existing_entitlements = Plist.parse_xml(File.read(main_entitlements))
    rescue => e
      puts "! could not parse App.entitlements (#{e.message}) — refusing to overwrite"
      existing_entitlements = nil
    end
  end
  if existing_entitlements
    existing_entitlements["com.apple.security.application-groups"] ||= []
    unless existing_entitlements["com.apple.security.application-groups"].include?(app_group)
      existing_entitlements["com.apple.security.application-groups"] << app_group
      File.write(main_entitlements, Plist::Emit.dump(existing_entitlements))
      puts "✓ added #{app_group} to App.entitlements"
    end
  elsif !File.exist?(main_entitlements)
    # No file at all -- safe to create a fresh one.
    File.write(main_entitlements, Plist::Emit.dump({
      "com.apple.security.application-groups" => [app_group],
    }))
    puts "✓ created App.entitlements with #{app_group}"
  end
end

# Make sure the main target's build settings reference the entitlements file
main_target.build_configurations.each do |config|
  config.build_settings["CODE_SIGN_ENTITLEMENTS"] ||= "App/App.entitlements"
end

# ── Apple Watch (WatchApp) target ─────────────────────────────
# watchOS 10+ single-target SwiftUI app. The source files live at
# ../WatchApp/ (WatchApp.swift, RootView.swift,
# WatchModel.swift). Without registering this target, dev:apple-watch
# can't build -- and the user has to do the dance of "File → New →
# Target → watchOS → App" through the Xcode UI, which is fragile and
# manual. Idempotent: skips if a WatchApp target already exists.
WATCH_NAME = "WatchApp"
# Source dir lives at ui/ios/App/WatchApp/ -- same level as the
# .xcodeproj (cwd), NOT one level up. The legacy EXTENSIONS loop above
# uses `../#{name}` which resolves to ui/ios/ -- those extension dirs
# don't actually exist on disk, so that branch has been silently
# skipped. The Watch target ships real source files so we get the path
# right here.
WATCH_SOURCE_DIR = File.expand_path(WATCH_NAME, Dir.pwd)
WATCH_BUNDLE_ID = "#{bundle_root}.watchkitapp"
WATCH_DEPLOY = "10.0"

if project.targets.any? { |t| t.name == WATCH_NAME }
  # Repair path: target exists, but new Swift files (e.g. Brand.swift
  # generated by apply-brand.mjs after the target was first created)
  # need to be added to the existing compile-sources phase. Without
  # this, the Watch target would silently miss Brand.swift and
  # Watch-side code couldn't use `Brand.displayName` etc.
  watch_target = project.targets.find { |t| t.name == WATCH_NAME }
  watch_group = project.main_group.find_subpath(WATCH_NAME, true)
  watch_group.set_source_tree("<group>")
  watch_group.path = WATCH_NAME
  watch_sources_phase = watch_target.source_build_phase
  already_compiled = watch_sources_phase.files.map { |bf|
    bf.file_ref ? File.basename(bf.file_ref.path.to_s) : nil
  }.compact
  added_to_watch = 0
  Dir.glob(File.join(WATCH_SOURCE_DIR, "*.swift")).sort.each do |file|
    rel = File.basename(file)
    next if already_compiled.include?(rel)
    existing_ref = watch_group.files.find { |f| File.basename(f.path.to_s) == rel }
    file_ref = existing_ref || watch_group.new_file(rel)
    watch_target.add_file_references([file_ref])
    added_to_watch += 1
    puts "    + #{WATCH_NAME}/#{rel}"
  end
  if added_to_watch > 0
    puts "✓ target #{WATCH_NAME} repaired — added #{added_to_watch} Swift file(s)"
  else
    puts "✓ target #{WATCH_NAME} already exists — sources up-to-date"
  end
elsif !Dir.exist?(WATCH_SOURCE_DIR)
  puts "✗ Watch source dir not found: #{WATCH_SOURCE_DIR} — skipping target creation"
else
  puts "▸ adding watchOS target #{WATCH_NAME}"

  # `project.new_target` for watchOS requires platform :watchos. The
  # xcodeproj gem (1.27+) supports this; older versions fail with
  # "Unknown platform". `--gem-install xcodeproj plist --user-install`
  # in the dev-ios wrapper keeps the gem fresh.
  watch_target = project.new_target(
    :application,
    WATCH_NAME,
    :watchos,
    WATCH_DEPLOY,
    project.products_group,
    :swift
  )

  watch_target.build_configurations.each do |config|
    config.build_settings.merge!(
      "PRODUCT_BUNDLE_IDENTIFIER" => WATCH_BUNDLE_ID,
      "PRODUCT_NAME" => WATCH_NAME,
      "WATCHOS_DEPLOYMENT_TARGET" => WATCH_DEPLOY,
      "SDKROOT" => "watchos",
      "SUPPORTED_PLATFORMS" => "watchsimulator watchos",
      "TARGETED_DEVICE_FAMILY" => "4",
      "INFOPLIST_FILE" => "#{WATCH_NAME}/Info.plist",
      "CODE_SIGN_ENTITLEMENTS" => "#{WATCH_NAME}/#{WATCH_NAME}.entitlements",
      "CODE_SIGN_STYLE" => "Automatic",
      # 5.9 matches the main App target so the same toolchain compiles
      # both. 5.0 was Xcode 13's default; 5.9 ships with Xcode 15.
      "SWIFT_VERSION" => "5.9",
      # Xcode 15+ default -- sandbox build-phase scripts. See the
      # extension-target version of this comment above for context.
      "ENABLE_USER_SCRIPT_SANDBOXING" => "YES",
      "SKIP_INSTALL" => "YES",
      "GENERATE_INFOPLIST_FILE" => "NO",
      "ASSETCATALOG_COMPILER_APPICON_NAME" => "AppIcon",
      "CURRENT_PROJECT_VERSION" => "1",
      "MARKETING_VERSION" => "1.0",
    )
    config.build_settings["DEVELOPMENT_TEAM"] = team_id if team_id
  end

  # Source files (Swift)
  watch_group = project.main_group.find_subpath(WATCH_NAME, true)
  watch_group.set_source_tree("<group>")
  watch_group.path = WATCH_NAME
  Dir.glob(File.join(WATCH_SOURCE_DIR, "*.swift")).sort.each do |file|
    rel = File.basename(file)
    file_ref = watch_group.new_file(rel)
    watch_target.add_file_references([file_ref])
    puts "    + #{WATCH_NAME}/#{rel}"
  end

  # Asset catalog
  assets_path = File.join(WATCH_SOURCE_DIR, "Assets.xcassets")
  if Dir.exist?(assets_path)
    assets_ref = watch_group.new_file("Assets.xcassets")
    watch_target.add_resources([assets_ref])
    puts "    + #{WATCH_NAME}/Assets.xcassets"
  end

  # Info.plist + entitlements get auto-registered via their build
  # settings above; we still want them visible in the project navigator
  # so devs can edit them. Add as file references without adding to
  # the resources/compile phases.
  ["Info.plist", "#{WATCH_NAME}.entitlements"].each do |fname|
    next unless File.exist?(File.join(WATCH_SOURCE_DIR, fname))
    next if watch_group.files.any? { |f| File.basename(f.path.to_s) == fname }
    watch_group.new_file(fname)
  end

  # Embed the watch app inside the iPhone host app target. Without this
  # the .app bundle ships without the watch app and there's nothing for
  # the paired watch to discover. The build phase is "Embed Watch
  # Content" -- Xcode's symbolic dst_subfolder for watch is :wrapper +
  # custom path `$(CONTENTS_FOLDER_PATH)/Watch`.
  embed_phase = main_target.copy_files_build_phases.find { |p| p.name == "Embed Watch Content" }
  unless embed_phase
    embed_phase = main_target.new_copy_files_build_phase("Embed Watch Content")
    embed_phase.dst_subfolder_spec = "16" # wrapper
    embed_phase.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
  end
  unless embed_phase.files.any? { |bf| bf.file_ref == watch_target.product_reference }
    bf = embed_phase.add_file_reference(watch_target.product_reference)
    bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
  end
  main_target.add_dependency(watch_target)

  # Shared scheme -- without this, `xcodebuild -scheme WatchApp`
  # errors "scheme not found" (Xcode only auto-generates user schemes
  # on first open, which CI / dev:apple-watch can't rely on).
  schemes_dir = File.join(PROJECT_PATH, "xcshareddata", "xcschemes")
  FileUtils.mkdir_p(schemes_dir)
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(watch_target)
  scheme.set_launch_target(watch_target)
  scheme.save_as(PROJECT_PATH, WATCH_NAME, true)
  puts "    + xcshareddata/xcschemes/#{WATCH_NAME}.xcscheme"

  # Add App Group entitlement file if it doesn't exist (lets the watch
  # read from the same shared container as the iPhone app).
  watch_entitlements_path = File.join(WATCH_SOURCE_DIR, "#{WATCH_NAME}.entitlements")
  unless File.exist?(watch_entitlements_path)
    File.write(
      watch_entitlements_path,
      Plist::Emit.dump({
        "com.apple.security.application-groups" => [app_group],
      }),
    )
    puts "    + #{WATCH_NAME}/#{WATCH_NAME}.entitlements"
  end

  puts "  ✓ #{WATCH_NAME} added + embedded in App target + shared scheme created"
end

# ──────────────────────────────────────────────────────────────────
# Test targets -- AppTests / AppUITests / WidgetTests / WatchTests.
#
# Added separately from the source-target loop above because:
#   • Their product_type is com.apple.product-type.bundle.unit-test (or
#     .bundle.ui-testing for UI tests) -- different lifecycle than app/
#     widget targets, no Info.plist NSExtension key needed.
#   • Each test target needs a TEST_HOST + BUNDLE_LOADER setting pointing
#     at the host app/widget so XCTest can inject into it.
#   • Test sources land under ui/ios/App/{AppTests,AppUITests,...}/ which
#     this loop creates if missing (with a placeholder .swift file so
#     `xcodebuild test` doesn't error "no source files").
#
# Idempotent -- re-runs are no-ops if every test target already exists.
TEST_TARGETS = [
  {
    name: "AppTests",
    bundle_suffix: "tests",
    type: "com.apple.product-type.bundle.unit-test",
    host: "App",
    deployment_min: "15.0",
    placeholder: <<~SWIFT,
      // AppTests — XCTest unit tests for the App target. The smoke case
      // here just exercises the host-bundle wiring; the real coverage
      // lives in BrandTests.swift, KeychainStoreTests.swift, etc.
      import XCTest
      @testable import App

      final class AppTestsSmoke: XCTestCase {
        func testHostBundleAvailable() {
          XCTAssertNotNil(Bundle.main.bundleIdentifier)
        }
      }
    SWIFT
  },
  {
    name: "AppUITests",
    bundle_suffix: "uitests",
    type: "com.apple.product-type.bundle.ui-testing",
    host: "App",
    deployment_min: "15.0",
    placeholder: <<~SWIFT,
      // AppUITests — XCUITest end-to-end tests. Drives a real simulator
      // running the app. Real cases land in ColdLaunchUITests.swift,
      // SidebarUITests.swift, NotificationsBellUITests.swift, etc.
      import XCTest

      final class AppUITestsSmoke: XCTestCase {
        func testLaunchApp() throws {
          let app = XCUIApplication()
          app.launch()
          XCTAssertTrue(app.state == .runningForeground || app.state == .runningBackground)
        }
      }
    SWIFT
  },
  {
    name: "WidgetTests",
    bundle_suffix: "widgettests",
    type: "com.apple.product-type.bundle.unit-test",
    host: "AppWidget",
    deployment_min: "16.0",
    placeholder: <<~SWIFT,
      // WidgetTests — XCTest unit tests for the AppWidget extension
      // target. Real cases live in WidgetAuthGateTests.swift,
      // NextInterviewWidgetTests.swift, snapshot tests, etc.
      import XCTest

      final class WidgetTestsSmoke: XCTestCase {
        func testHostBundleAvailable() {
          XCTAssertNotNil(Bundle.main.bundleIdentifier)
        }
      }
    SWIFT
  },
  {
    name: "WatchTests",
    bundle_suffix: "watchtests",
    type: "com.apple.product-type.bundle.unit-test",
    host: "WatchApp",
    deployment_min: "15.0",
    sdk: "watchos",
    placeholder: <<~SWIFT,
      // WatchTests — XCTest unit tests for the WatchApp target.
      // Real cases live in WatchModelTests.swift, RootViewTests.swift
      // (ViewInspector), snapshot tests, etc.
      import XCTest

      final class WatchTestsSmoke: XCTestCase {
        func testHostBundleAvailable() {
          XCTAssertNotNil(Bundle.main.bundleIdentifier)
        }
      }
    SWIFT
  },
]

TEST_TARGETS.each do |t|
  source_dir = File.expand_path(t[:name], File.dirname(PROJECT_PATH))
  FileUtils.mkdir_p(source_dir)
  placeholder_path = File.join(source_dir, "#{t[:name]}Smoke.swift")
  unless File.exist?(placeholder_path)
    File.write(placeholder_path, t[:placeholder])
    puts "    + #{t[:name]}/#{File.basename(placeholder_path)} (placeholder)"
  end

  host_target = project.targets.find { |x| x.name == t[:host] }
  unless host_target
    puts "✗ host target #{t[:host]} not found — skipping #{t[:name]}"
    next
  end

  bundle_id = "#{bundle_root}.#{t[:bundle_suffix]}"
  is_watch = t[:sdk] == "watchos"
  platform = is_watch ? :watchos : :ios

  existing = project.targets.find { |x| x.name == t[:name] }
  if existing
    new_target = existing
    puts "= #{t[:name]} target exists — syncing sources"
  else
    new_target = project.new_target(:bundle, t[:name], platform, t[:deployment_min])
    new_target.product_type = t[:type]
    new_target.build_configurations.each do |bc|
      bc.build_settings.merge!(
        "PRODUCT_BUNDLE_IDENTIFIER" => bundle_id,
        "#{is_watch ? "WATCHOS" : "IPHONEOS"}_DEPLOYMENT_TARGET" => t[:deployment_min],
        "SWIFT_VERSION" => "5.0",
        "CODE_SIGN_STYLE" => "Automatic",
        "INFOPLIST_KEY_CFBundleDisplayName" => t[:name],
        "GENERATE_INFOPLIST_FILE" => "YES",
        "TEST_HOST" => "$(BUILT_PRODUCTS_DIR)/#{t[:host]}.app/#{t[:host]}",
        "BUNDLE_LOADER" => "$(TEST_HOST)",
        "TARGETED_DEVICE_FAMILY" => is_watch ? "4" : "1,2",
      )
      bc.build_settings["DEVELOPMENT_TEAM"] = team_id if team_id
    end
    new_target.add_dependency(host_target)
    puts "  ✓ #{t[:name]} created (host=#{t[:host]}, bundle=#{bundle_id}, deploy=#{t[:deployment_min]})"
  end

  # Wire every .swift file in the test target dir into the target.
  # Re-runs are safe: existing references are de-duped by path.
  ref = project.main_group.find_subpath(t[:name], true)
  ref.set_source_tree("<group>")
  # PBX requires `path = <Name>` on the group (not just `name`); without
  # it children with `sourceTree = "<group>"` and just `path = X.swift`
  # resolve to PROJECT_ROOT/X.swift instead of PROJECT_ROOT/<Name>/X.swift,
  # and xcodebuild fails with "Build input files cannot be found". Match
  # the pattern used by App + WatchApp + extension groups above.
  ref.path = t[:name]
  existing_paths = ref.files.map(&:path).to_set

  # Also dedupe against the build phase -- Xcode tracks "Compile Sources"
  # separately from file refs and re-runs could double-add otherwise.
  sources_phase = new_target.source_build_phase
  sources_in_phase = sources_phase.files.map { |bf| bf.file_ref&.path }.compact.to_set

  Dir.glob(File.join(source_dir, "*.swift")).sort.each do |swift_file|
    basename = File.basename(swift_file)
    if existing_paths.include?(basename)
      next if sources_in_phase.include?(basename)
      file_ref = ref.files.find { |f| f.path == basename }
    else
      file_ref = ref.new_reference(basename)
      puts "    + #{t[:name]}/#{basename}"
    end
    new_target.add_file_references([file_ref]) unless sources_in_phase.include?(basename)
  end

  # Shared scheme so `xcodebuild test -scheme <Name>` works in CI.
  schemes_dir = File.join(PROJECT_PATH, "xcshareddata", "xcschemes")
  FileUtils.mkdir_p(schemes_dir)
  scheme_path = File.join(schemes_dir, "#{t[:name]}.xcscheme")
  unless File.exist?(scheme_path)
    scheme = Xcodeproj::XCScheme.new
    scheme.add_build_target(new_target)
    scheme.add_test_target(new_target)
    scheme.save_as(PROJECT_PATH, t[:name], true)
    puts "    + xcshareddata/xcschemes/#{t[:name]}.xcscheme"
  end
end

project.save
puts "\n✓ Xcode targets up-to-date."
puts "  Re-run `pnpm dev:ios` / `pnpm dev:apple-watch` to build with new targets."
puts "  Run `bundle exec fastlane test_ci` to run the iOS test suite."
