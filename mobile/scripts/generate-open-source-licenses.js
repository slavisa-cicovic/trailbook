const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const workspaceKey = 'mobile';

function dependencyKey(parentKey, name) {
  let current = parentKey;
  while (true) {
    const candidate = current ? `${current}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    const marker = current.lastIndexOf('/node_modules/');
    if (marker < 0) break;
    current = current.slice(0, marker);
  }
  const rootCandidate = `node_modules/${name}`;
  if (packages[rootCandidate]) return rootCandidate;
  const workspaceCandidate = `${workspaceKey}/node_modules/${name}`;
  return packages[workspaceCandidate] ? workspaceCandidate : null;
}

const visited = new Set();
const queue = Object.keys(packages[workspaceKey].dependencies ?? {})
  .map((name) => dependencyKey(workspaceKey, name))
  .filter(Boolean);

while (queue.length) {
  const key = queue.shift();
  if (!key || visited.has(key)) continue;
  visited.add(key);
  const entry = packages[key];
  for (const name of Object.keys(entry.dependencies ?? {})) {
    const child = dependencyKey(key, name);
    if (child && !visited.has(child)) queue.push(child);
  }
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    const child = dependencyKey(key, name);
    if (child && !visited.has(child)) queue.push(child);
  }
}

function readPackage(key) {
  const directory = path.join(root, key);
  const manifestPath = path.join(directory, 'package.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name || !manifest.version || manifest.private) return null;
  const files = fs.readdirSync(directory);
  const legalFiles = files
    .filter((file) => /^(licen[sc]e|copying|notice)(\..*)?$/i.test(file))
    .sort();
  const licenseText = legalFiles
    .map((file) => fs.readFileSync(path.join(directory, file), 'utf8').trim())
    .filter(Boolean)
    .join('\n\n');
  const repository = typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository?.url;
  const legacyLicenses = Array.isArray(manifest.licenses)
    ? manifest.licenses.map((item) => typeof item === 'string' ? item : item.type).filter(Boolean).join(' OR ')
    : typeof manifest.licenses === 'string'
      ? manifest.licenses
      : manifest.licenses?.type;
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? legacyLicenses ?? 'Unknown',
    repository: repository?.replace(/^git\+/, '').replace(/\.git$/, '') ?? manifest.homepage ?? null,
    licenseText: licenseText || null,
  };
}

const unique = new Map();
for (const item of [...visited].map(readPackage).filter(Boolean)) {
  const key = `${item.name}@${item.version}`;
  const existing = unique.get(key);
  if (!existing || (!existing.licenseText && item.licenseText)) unique.set(key, item);
}
const result = [...unique.values()]
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const destination = path.join(root, 'mobile/src/generated/openSourceLicenses.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(result)}\n`);
console.log(`Generated ${result.length} open-source license entries.`);
