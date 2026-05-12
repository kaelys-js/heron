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

# Add App Group entitlement to the main App target too
main_entitlements = File.expand_path('App/App.entitlements', Dir.pwd)
existing_entitlements = nil
if File.exist?(main_entitlements)
  existing_entitlements = Xcodeproj::Plist.read_from_path(main_entitlements) rescue nil
end
existing_entitlements ||= {}
existing_entitlements['com.apple.security.application-groups'] ||= []
unless existing_entitlements['com.apple.security.application-groups'].include?(app_group)
  existing_entitlements['com.apple.security.application-groups'] << app_group
  File.write(main_entitlements, Plist::Emit.dump(existing_entitlements))
  puts "✓ added #{app_group} to App.entitlements"
end

# Make sure the main target's build settings reference the entitlements file
main_target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] ||= 'App/App.entitlements'
end

project.save
puts "\n✓ All extension targets added. Re-run pod install in this directory."
puts "  Then open App.xcworkspace in Xcode and verify the targets appear."
