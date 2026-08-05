require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'TrailbookMotionActivity'
  s.version = package['version']
  s.summary = 'Trailbook motion activity bridge'
  s.description = 'Provides Core Motion activity hints for Trailbook trip classification.'
  s.license = 'MIT'
  s.author = 'Trailbook'
  s.homepage = 'https://trailbook.rs'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { git: 'https://trailbook.rs/trailbook-motion-activity.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'
end
