Pod::Spec.new do |s|
  s.name           = 'TrailbookNativeLocation'
  s.version        = '0.1.0'
  s.summary        = 'Trailbook native iOS location capture module'
  s.description    = 'Captures iOS background locations natively and persists them until JavaScript drains them.'
  s.author         = 'Trailbook'
  s.homepage       = 'https://trailbook.local'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.0'
  s.source         = { :git => 'https://trailbook.local/trailbook-native-location.git', :tag => s.version.to_s }
  s.source_files   = '**/*.{swift,h,m,mm}'
  s.dependency 'ExpoModulesCore'
end
