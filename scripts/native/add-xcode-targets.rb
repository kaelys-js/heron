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

project.save
puts "\n✓ All extension targets added. Re-run pod install in this directory."
puts "  Then open App.xcworkspace in Xcode and verify the targets appear."
