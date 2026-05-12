#!/usr/bin/env ruby
# add-xcode-targets — programmatically add the 3 iOS extension targets
# to App.xcodeproj using the xcodeproj gem.
#
# Without this script, the user has to do 3 File→New→Target dances in Xcode
# AND manually link the source files in CareerOpsWidget/ etc. With this
# script, one `ruby add-xcode-targets.rb` does it all.
#
# Targets created:
#   • CareerOpsWidget          — Widget Extension (small/medium/circular)
#   • CareerOpsLiveActivity    — Widget Extension w/ ActivityKit
#   • CareerOpsShareExtension  — Share Extension
#
# All three get:
#   • Their Swift source from ui/ios/App/CareerOpsXxx/
#   • Bundle ID: com.resistjs.careerops.{widget,liveactivity,share}
#   • App Group capability: group.com.resistjs.careerops
#   • Deployment target: matches main app
#
# Safe to re-run — checks if a target already exists before adding.

require 'xcodeproj'
require 'fileutils'
require 'plist'

PROJECT_PATH = File.expand_path('App.xcodeproj', Dir.pwd)
unless File.exist?(PROJECT_PATH)
  puts "✗ App.xcodeproj not found in #{Dir.pwd}"
  puts "  Run this from ui/ios/App/"
  exit 1
end

project = Xcodeproj::Project.open(PROJECT_PATH)
main_target = project.targets.find { |t| t.name == 'App' }
unless main_target
  puts "✗ Main 'App' target not found in #{PROJECT_PATH}"
  exit 1
end
puts "✓ opened #{PROJECT_PATH}"

deployment_target = main_target.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '15.0'
team_id = main_target.build_configurations.first.build_settings['DEVELOPMENT_TEAM']
app_group = 'group.com.resistjs.careerops'
bundle_root = 'com.resistjs.careerops'

EXTENSIONS = [
  {
    name: 'CareerOpsWidget',
    bundle_suffix: 'widget',
    type: 'com.apple.product-type.app-extension',
    extension_point: 'com.apple.widgetkit-extension',
    source_dir: 'CareerOpsWidget',
    info_plist_extra: {},
    deployment_min: '16.0', # WidgetKit modern features need 16+
  },
  {
    name: 'CareerOpsLiveActivity',
    bundle_suffix: 'liveactivity',
    type: 'com.apple.product-type.app-extension',
    extension_point: 'com.apple.widgetkit-extension',
    source_dir: 'CareerOpsLiveActivity',
    info_plist_extra: {
      'NSSupportsLiveActivities' => true,
    },
    deployment_min: '16.1',
  },
  {
    name: 'CareerOpsShareExtension',
    bundle_suffix: 'share',
    type: 'com.apple.product-type.app-extension',
    extension_point: 'com.apple.share-services',
    source_dir: 'CareerOpsShareExtension',
    info_plist_extra: {
      'NSExtensionAttributes' => {
        'NSExtensionActivationRule' => {
          'NSExtensionActivationSupportsWebURLWithMaxCount' => 1,
          'NSExtensionActivationSupportsWebPageWithMaxCount' => 1,
        },
      },
    },
    deployment_min: '15.0',
  },
]

# ── App-target Swift sources ────────────────────────────────────────
# `cap add ios` only initializes the App target with AppDelegate.swift.
# Native features we add later (BonjourBrowser, NetworkMonitor, Biometric,
# KeychainStore, BackgroundFetcher, SpotlightIndexer, WatchSessionBridge,
# CareerOpsNativePlugin, ErrorReporter, Brand) live in App/*.swift on disk
# but aren't auto-added to the App target. Without this block xcodebuild
# fails: "cannot find type 'BonjourBrowser' in scope". Walk App/*.swift
# and ensure every file is in the App target's compile-sources phase.
# Safe to re-run — checks for existing refs in both the group and the
# build phase.
app_sources_dir = File.expand_path('App', Dir.pwd)
if Dir.exist?(app_sources_dir)
  # NOTE: do NOT name this `app_group` — the outer scope's `app_group`
  # string ('group.com.resistjs.careerops') is reused in the entitlements
  # block below. Shadowing it with a PBXGroup object corrupts the
  # entitlements file (the plist gem then Marshal-dumps the Ruby object
  # into the <data> element).
  app_files_group = project.main_group.find_subpath('App', true)
  app_files_group.set_source_tree('<group>')
  app_files_group.path = 'App'

  sources_phase = main_target.source_build_phase
  in_sources = sources_phase.files.map { |bf|
    bf.file_ref ? File.basename(bf.file_ref.path.to_s) : nil
  }.compact

  added = 0
  Dir.glob(File.join(app_sources_dir, '*.swift')).sort.each do |file|
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
  if project.targets.any? { |t| t.name == ext[:name] }
    puts "✓ target #{ext[:name]} already exists — skipping"
    next
  end

  source_dir_abs = File.expand_path("../#{ext[:source_dir]}", Dir.pwd)
  unless Dir.exist?(source_dir_abs)
    puts "✗ source dir not found: #{source_dir_abs}"
    next
  end

  puts "▸ adding target #{ext[:name]}"
  target = project.new_target(
    :app_extension,
    ext[:name],
    :ios,
    ext[:deployment_min],
    project.products_group,
    :swift
  )

  # Bundle ID
  target.build_configurations.each do |config|
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{bundle_root}.#{ext[:bundle_suffix]}"
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = ext[:deployment_min]
    config.build_settings['INFOPLIST_FILE'] = "#{ext[:source_dir]}/Info.plist"
    config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
    config.build_settings['DEVELOPMENT_TEAM'] = team_id if team_id
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "#{ext[:source_dir]}/#{ext[:source_dir]}.entitlements"
    config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
    config.build_settings['SKIP_INSTALL'] = 'YES'
  end

  # Add Swift sources from the source dir
  group = project.main_group.find_subpath(ext[:source_dir], true)
  group.set_source_tree('<group>')
  group.path = ext[:source_dir]
  swift_files = Dir.glob(File.join(source_dir_abs, '*.swift'))
  swift_files.each do |file|
    rel = File.basename(file)
    file_ref = group.new_file(rel)
    target.add_file_references([file_ref])
    puts "    + #{rel}"
  end

  # Generate Info.plist for the target
  plist_path = File.join(source_dir_abs, 'Info.plist')
  unless File.exist?(plist_path)
    info_plist = {
      'CFBundleDevelopmentRegion' => '$(DEVELOPMENT_LANGUAGE)',
      'CFBundleDisplayName' => ext[:name],
      'CFBundleExecutable' => '$(EXECUTABLE_NAME)',
      'CFBundleIdentifier' => '$(PRODUCT_BUNDLE_IDENTIFIER)',
      'CFBundleInfoDictionaryVersion' => '6.0',
      'CFBundleName' => '$(PRODUCT_NAME)',
      'CFBundlePackageType' => '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
      'CFBundleShortVersionString' => '$(MARKETING_VERSION)',
      'CFBundleVersion' => '$(CURRENT_PROJECT_VERSION)',
      'NSExtension' => {
        'NSExtensionPointIdentifier' => ext[:extension_point],
      },
    }
    # ShareExtension also needs principal class.
    if ext[:bundle_suffix] == 'share'
      info_plist['NSExtension']['NSExtensionPrincipalClass'] = '$(PRODUCT_MODULE_NAME).ShareViewController'
    end
    # Merge extra fields
    ext[:info_plist_extra].each { |k, v|
      if info_plist['NSExtension'] && k == 'NSExtensionAttributes'
        info_plist['NSExtension']['NSExtensionAttributes'] = v
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
      'com.apple.security.application-groups' => [app_group],
    }
    if ext[:bundle_suffix] == 'liveactivity'
      entitlements['com.apple.developer.live-activities'] = true
    end
    File.write(entitlements_path, Plist::Emit.dump(entitlements))
    puts "    + #{File.basename(entitlements_path)}"
  end

  # Embed the extension in the host app target
  embed_phase = main_target.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
  embed_phase ||= main_target.new_copy_files_build_phase('Embed Foundation Extensions')
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  build_file = embed_phase.add_file_reference(target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  # Add explicit dependency
  main_target.add_dependency(target)
  puts "  ✓ #{ext[:name]} added + linked to App target"
end

# Add App Group entitlement to the main App target too.
# Use the `plist` gem to read (Xcodeproj::Plist.read_from_path silently
# returns nil when the file has unfamiliar features like XML comments
# or $(AppIdentifierPrefix) build-vars, which would cause us to OVERWRITE
# the entitlements with an empty file and lose keychain/aps/background-
# tasks entitlements. Quick + safe shortcut: if the raw text already
# mentions the app_group string, do nothing.
main_entitlements = File.expand_path('App/App.entitlements', Dir.pwd)
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
    existing_entitlements['com.apple.security.application-groups'] ||= []
    unless existing_entitlements['com.apple.security.application-groups'].include?(app_group)
      existing_entitlements['com.apple.security.application-groups'] << app_group
      File.write(main_entitlements, Plist::Emit.dump(existing_entitlements))
      puts "✓ added #{app_group} to App.entitlements"
    end
  elsif !File.exist?(main_entitlements)
    # No file at all — safe to create a fresh one.
    File.write(main_entitlements, Plist::Emit.dump({
      'com.apple.security.application-groups' => [app_group],
    }))
    puts "✓ created App.entitlements with #{app_group}"
  end
end

# Make sure the main target's build settings reference the entitlements file
main_target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] ||= 'App/App.entitlements'
end

# ── Apple Watch (CareerOpsWatch) target ─────────────────────────────
# watchOS 10+ single-target SwiftUI app. The source files live at
# ../CareerOpsWatch/ (CareerOpsWatchApp.swift, RootView.swift,
# WatchModel.swift). Without registering this target, dev:apple-watch
# can't build — and the user has to do the dance of "File → New →
# Target → watchOS → App" through the Xcode UI, which is fragile and
# manual. Idempotent: skips if a CareerOpsWatch target already exists.
WATCH_NAME = 'CareerOpsWatch'
# Source dir lives at ui/ios/App/CareerOpsWatch/ — same level as the
# .xcodeproj (cwd), NOT one level up. The legacy EXTENSIONS loop above
# uses `../#{name}` which resolves to ui/ios/ — those extension dirs
# don't actually exist on disk, so that branch has been silently
# skipped. The Watch target ships real source files so we get the path
# right here.
WATCH_SOURCE_DIR = File.expand_path(WATCH_NAME, Dir.pwd)
WATCH_BUNDLE_ID = "#{bundle_root}.watchkitapp"
WATCH_DEPLOY = '10.0'

if project.targets.any? { |t| t.name == WATCH_NAME }
  puts "✓ target #{WATCH_NAME} already exists — skipping"
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
      'PRODUCT_BUNDLE_IDENTIFIER' => WATCH_BUNDLE_ID,
      'PRODUCT_NAME' => WATCH_NAME,
      'WATCHOS_DEPLOYMENT_TARGET' => WATCH_DEPLOY,
      'SDKROOT' => 'watchos',
      'SUPPORTED_PLATFORMS' => 'watchsimulator watchos',
      'TARGETED_DEVICE_FAMILY' => '4',
      'INFOPLIST_FILE' => "#{WATCH_NAME}/Info.plist",
      'CODE_SIGN_ENTITLEMENTS' => "#{WATCH_NAME}/#{WATCH_NAME}.entitlements",
      'CODE_SIGN_STYLE' => 'Automatic',
      'SWIFT_VERSION' => '5.0',
      'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
      'SKIP_INSTALL' => 'YES',
      'GENERATE_INFOPLIST_FILE' => 'NO',
      'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
      'CURRENT_PROJECT_VERSION' => '1',
      'MARKETING_VERSION' => '1.0',
    )
    config.build_settings['DEVELOPMENT_TEAM'] = team_id if team_id
  end

  # Source files (Swift)
  watch_group = project.main_group.find_subpath(WATCH_NAME, true)
  watch_group.set_source_tree('<group>')
  watch_group.path = WATCH_NAME
  Dir.glob(File.join(WATCH_SOURCE_DIR, '*.swift')).sort.each do |file|
    rel = File.basename(file)
    file_ref = watch_group.new_file(rel)
    watch_target.add_file_references([file_ref])
    puts "    + #{WATCH_NAME}/#{rel}"
  end

  # Asset catalog
  assets_path = File.join(WATCH_SOURCE_DIR, 'Assets.xcassets')
  if Dir.exist?(assets_path)
    assets_ref = watch_group.new_file('Assets.xcassets')
    watch_target.add_resources([assets_ref])
    puts "    + #{WATCH_NAME}/Assets.xcassets"
  end

  # Info.plist + entitlements get auto-registered via their build
  # settings above; we still want them visible in the project navigator
  # so devs can edit them. Add as file references without adding to
  # the resources/compile phases.
  ['Info.plist', "#{WATCH_NAME}.entitlements"].each do |fname|
    next unless File.exist?(File.join(WATCH_SOURCE_DIR, fname))
    next if watch_group.files.any? { |f| File.basename(f.path.to_s) == fname }
    watch_group.new_file(fname)
  end

  # Embed the watch app inside the iPhone host app target. Without this
  # the .app bundle ships without the watch app and there's nothing for
  # the paired watch to discover. The build phase is "Embed Watch
  # Content" — Xcode's symbolic dst_subfolder for watch is :wrapper +
  # custom path `$(CONTENTS_FOLDER_PATH)/Watch`.
  embed_phase = main_target.copy_files_build_phases.find { |p| p.name == 'Embed Watch Content' }
  unless embed_phase
    embed_phase = main_target.new_copy_files_build_phase('Embed Watch Content')
    embed_phase.dst_subfolder_spec = '16' # wrapper
    embed_phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
  end
  unless embed_phase.files.any? { |bf| bf.file_ref == watch_target.product_reference }
    bf = embed_phase.add_file_reference(watch_target.product_reference)
    bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  end
  main_target.add_dependency(watch_target)

  # Shared scheme — without this, `xcodebuild -scheme CareerOpsWatch`
  # errors "scheme not found" (Xcode only auto-generates user schemes
  # on first open, which CI / dev:apple-watch can't rely on).
  schemes_dir = File.join(PROJECT_PATH, 'xcshareddata', 'xcschemes')
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
        'com.apple.security.application-groups' => [app_group],
      }),
    )
    puts "    + #{WATCH_NAME}/#{WATCH_NAME}.entitlements"
  end

  puts "  ✓ #{WATCH_NAME} added + embedded in App target + shared scheme created"
end

project.save
puts "\n✓ Xcode targets up-to-date."
puts "  Re-run `pnpm dev:ios` / `pnpm dev:apple-watch` to build with new targets."
