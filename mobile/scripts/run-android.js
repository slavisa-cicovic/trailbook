const { existsSync, realpathSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const [variant, appId, ...extraArgs] = process.argv.slice(2);

if (!variant || !appId) {
  console.error('Usage: node scripts/run-android.js <variant> <app-id> [...expo args]');
  process.exit(1);
}

function executableOnPath(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return null;
}

function validAndroidSdk(path) {
  return Boolean(path && existsSync(join(path, 'platform-tools', 'adb')));
}

const adb = executableOnPath(process.platform === 'win32' ? 'adb.exe' : 'adb');
const sdkFromAdb = adb ? dirname(dirname(adb)) : null;
const androidSdk = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME, sdkFromAdb]
  .find(validAndroidSdk);

if (androidSdk) {
  process.env.ANDROID_HOME = androidSdk;
  process.env.ANDROID_SDK_ROOT = androidSdk;
}

const java17Candidates = [
  '/usr/lib/jvm/java-17-openjdk',
  '/usr/lib/jvm/java-17-openjdk-amd64',
];
const java17Home = java17Candidates.find((candidate) => existsSync(join(candidate, 'bin', 'java')));
if (java17Home) process.env.JAVA_HOME = java17Home;

if (variant.startsWith('local') && adb) {
  for (const port of [3001, 9000]) {
    const reverseResult = spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], {
      stdio: 'inherit',
    });
    if (reverseResult.status !== 0) {
      console.warn(`Could not forward device port ${port}; a local service may be unreachable.`);
    }
  }
}

const result = spawnSync(
  'npx',
  ['expo', 'run:android', '--variant', variant, '--app-id', appId, ...extraArgs],
  { env: process.env, stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
