#!/usr/bin/env ruby
# Add the swift-snapshot-testing + ViewInspector SPM deps to the
# WidgetTests + WatchTests + AppLiveActivityTests test bundles. Run
# AFTER add-xcode-targets.rb so the test targets exist.
#
# Idempotent: scans existing package_references + product_dependencies
# and skips if already attached.

require "xcodeproj"
require "pathname"

PROJECT_PATH = File.expand_path("../../ui/ios/App/App.xcodeproj", File.dirname(__FILE__))
project = Xcodeproj::Project.open(PROJECT_PATH)

DEPS = [
  {
    repo_url: "https://github.com/pointfreeco/swift-snapshot-testing",
    min_version: "1.18.0",
    products: ["SnapshotTesting"],
  },
  {
    repo_url: "https://github.com/nalexn/ViewInspector",
    min_version: "0.10.2",
    products: ["ViewInspector"],
  },
].freeze

# Test targets that should link these deps. WatchTests skips
# ViewInspector for now (watchOS-targeted ViewInspector support is
# patchier than iOS, and we focus snapshot/Inspector work on iOS where
# the bulk of SwiftUI surface lives).
TEST_TARGETS_WITH_DEPS = {
  "WidgetTests" => ["SnapshotTesting", "ViewInspector"],
  "AppLiveActivityTests" => ["SnapshotTesting", "ViewInspector"],
  "WatchTests" => ["SnapshotTesting", "ViewInspector"],
}.freeze

# 1. Ensure each remote package reference exists on the root object.
existing_refs = project.root_object.package_references.to_a
puts "▸ existing package references: #{existing_refs.length}"

dep_refs = {}
DEPS.each do |dep|
  match = existing_refs.find do |ref|
    ref.respond_to?(:repositoryURL) && ref.repositoryURL == dep[:repo_url]
  end
  if match
    puts "= already present: #{dep[:repo_url]}"
    dep_refs[dep[:repo_url]] = match
    next
  end

  ref = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  ref.repositoryURL = dep[:repo_url]
  ref.requirement = {
    "kind" => "upToNextMajorVersion",
    "minimumVersion" => dep[:min_version],
  }
  project.root_object.package_references << ref
  dep_refs[dep[:repo_url]] = ref
  puts "  + added package: #{dep[:repo_url]} ≥ #{dep[:min_version]}"
end

# 2. For each test target, attach the requested product dependencies.
TEST_TARGETS_WITH_DEPS.each do |target_name, product_names|
  target = project.targets.find { |t| t.name == target_name }
  unless target
    puts "✗ target #{target_name} not found -- skipping"
    next
  end

  product_names.each do |product_name|
    dep = DEPS.find { |d| d[:products].include?(product_name) }
    ref = dep_refs[dep[:repo_url]]

    existing_product = target.package_product_dependencies.find do |p|
      p.product_name == product_name
    end
    if existing_product
      puts "= #{target_name}: #{product_name} already linked"
      next
    end

    product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    product.package = ref
    product.product_name = product_name
    target.package_product_dependencies << product

    # Also surface in the Frameworks build phase so the linker sees it.
    frameworks_phase = target.frameworks_build_phase
    build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build_file.product_ref = product
    frameworks_phase.files << build_file
    puts "  + #{target_name}: linked #{product_name}"
  end
end

project.save
puts "\n✓ SPM test deps wired."
