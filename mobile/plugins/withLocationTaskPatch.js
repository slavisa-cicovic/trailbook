const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// EXLocationTaskConsumer.m calls both startUpdatingLocation AND
// startMonitoringSignificantLocationChanges. On iOS 26, the SLC mode
// appears to suppress continuous background location delivery, causing the
// task to receive only a handful of callbacks at startup and then go silent.
// This patch removes the SLC call so only startUpdatingLocation is active.

const PATCH_MARKER = 'TRAILBOOK_LOCATION_PATCH_V1';

const PATCH_RUBY_LINES = [
  '',
  `  # [${PATCH_MARKER}] Remove startMonitoringSignificantLocationChanges from ExpoLocation`,
  '  # expo-location 19.x calls both startUpdatingLocation and',
  '  # startMonitoringSignificantLocationChanges inside EXLocationTaskConsumer.',
  '  # On iOS 26 the SLC call suppresses continuous background delivery.',
  '  _consumer_path = File.join(installer.sandbox.root, \'ExpoLocation/ios/TaskConsumers/EXLocationTaskConsumer.m\')',
  '  if File.exist?(_consumer_path)',
  '    _src = File.read(_consumer_path)',
  '    _patched = _src.gsub(/[ \\t]*\\[locationManager startMonitoringSignificantLocationChanges\\];[ \\t]*\\n/, "")',
  '    if _src != _patched',
  '      File.write(_consumer_path, _patched)',
  '      puts "\\e[32m✅ [Trailbook] Patched EXLocationTaskConsumer.m: removed startMonitoringSignificantLocationChanges\\e[0m"',
  '    else',
  '      puts "\\e[33m⚠️  [Trailbook] EXLocationTaskConsumer.m patch: line not found (already patched or layout changed)\\e[0m"',
  '    end',
  '  else',
  '    puts "\\e[31m❌ [Trailbook] EXLocationTaskConsumer.m not found at #{_consumer_path}\\e[0m"',
  '  end',
].join('\n');

module.exports = function withLocationTaskPatch(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (podfile.includes(PATCH_MARKER)) {
        return config; // already applied
      }

      if (podfile.includes('post_install do |installer|')) {
        podfile = podfile.replace(
          'post_install do |installer|',
          `post_install do |installer|\n${PATCH_RUBY_LINES}\n`,
        );
      } else {
        podfile += `\npost_install do |installer|\n${PATCH_RUBY_LINES}\nend\n`;
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
