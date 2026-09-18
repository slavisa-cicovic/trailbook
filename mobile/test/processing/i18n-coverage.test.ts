import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

import { en, translations } from '../../src/i18n/translations';

const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LANGUAGES = ['en', 'sr', 'it', 'es', 'de', 'fr'] as const;

function placeholders(value: string) {
  return [...value.matchAll(/{{([^}]+)}}/g)].map((match) => match[1]).sort();
}

test('runtime translations cover every key and interpolation parameter', () => {
  const englishKeys = Object.keys(en).sort();

  assert.deepEqual(Object.keys(translations).sort(), [...LANGUAGES].sort());

  for (const [language, copy] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(copy).sort(), englishKeys, `${language} keys differ from English`);

    for (const key of englishKeys) {
      const translated = copy[key as keyof typeof copy];
      const english = en[key as keyof typeof en];
      assert.ok(translated.trim(), `${language}.${key} is empty`);
      assert.deepEqual(
        placeholders(translated),
        placeholders(english),
        `${language}.${key} placeholders differ from English`,
      );
    }
  }
});

function flattenStringValues(value: unknown, prefix = ''): Map<string, string> {
  const flattened = new Map<string, string>();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected an object at ${prefix || '<root>'}`);
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      flattened.set(path, child);
      continue;
    }
    for (const [nestedPath, nestedValue] of flattenStringValues(child, path)) {
      flattened.set(nestedPath, nestedValue);
    }
  }

  return flattened;
}

test('native locale files cover the same non-empty keys', () => {
  const localeDirectory = join(MOBILE_ROOT, 'locales');
  const localeFiles = readdirSync(localeDirectory).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(localeFiles, LANGUAGES.map((language) => `${language}.json`).sort());

  const english = flattenStringValues(
    JSON.parse(readFileSync(join(localeDirectory, 'en.json'), 'utf8')),
  );
  const englishKeys = [...english.keys()].sort();

  for (const language of LANGUAGES) {
    const copy = flattenStringValues(
      JSON.parse(readFileSync(join(localeDirectory, `${language}.json`), 'utf8')),
    );
    assert.deepEqual([...copy.keys()].sort(), englishKeys, `${language}.json keys differ from English`);
    for (const [key, translated] of copy) {
      assert.ok(translated.trim(), `${language}.json ${key} is empty`);
      assert.deepEqual(
        placeholders(translated),
        placeholders(english.get(key) ?? ''),
        `${language}.json ${key} placeholders differ from English`,
      );
    }
  }
});

const USER_FACING_ATTRIBUTES = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'title',
]);

// Temporary ratchet for the audited debt in PLAN_78. Remove an entry in the
// same change that replaces its literal with a translation key. The final list
// for production screens must be empty.
const AUDITED_HARDCODED_UI_COPY = [
  'app/_layout.tsx|message|Trailbook encountered an unexpected error.',
  'app/_layout.tsx|text|Attempt:',
  'app/_layout.tsx|text|Diagnostic code:',
  'app/_layout.tsx|text|Something went wrong',
  'app/_layout.tsx|text|Time:',
  'app/_layout.tsx|text|Try again',
  'app/auth/callback.tsx|message|OAuth callback is incomplete.',
  'app/auth/callback.tsx|text|Completing sign in...',
  'app/auth/callback.tsx|title|Sign in failed',
  'app/auth/callback.tsx|title|Sign in failed',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Buy lifetime',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Buy monthly',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Buy yearly',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Cancel subscription',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Decline',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Environment',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Expire',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Pending',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Period end',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Plan',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Provider',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Refund',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Renew current',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Revoke',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|label|Status',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|subtitle|Development tooling. No Apple or Google billing service is invoked.',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|text|Entitlements',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|text|Refresh access',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|title|Fake purchase provider',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|title|Products',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|title|Purchases simulation',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|title|Scenarios',
  'src/feature/purchases/PurchasesSimulationScreen.tsx|title|Trailbook',
  'src/feature/recording/RecordingScreen.tsx|title|Trailbook Premium',
  'src/feature/recording/RecordingScreen.tsx|title|Trailbook',
  'src/feature/settings/SettingsScreen.tsx|label|Auto',
  'src/feature/settings/SettingsScreen.tsx|label|Day',
  'src/feature/settings/SettingsScreen.tsx|label|Night',
  'src/feature/settings/SettingsScreen.tsx|title|Trailbook',
  'src/feature/trips/TripDetailScreen.tsx|accessibilityLabel|Open first waypoint for automated test',
  'src/feature/trips/TripDetailScreen.tsx|placeholder|user@example.com',
  'src/feature/trips/TripDetailScreen.tsx|text|E2E',
  'src/feature/trips/components/TotalCard.tsx|text|KM',
  'src/feature/waypoint/WaypointDetailScreen.tsx|text|Add photo(s)',
  'src/feature/waypoint/WaypointDetailScreen.tsx|text|Go back',
  'src/feature/waypoint/WaypointDetailScreen.tsx|text|No photos yet',
  'src/feature/waypoint/WaypointDetailScreen.tsx|text|Photos',
  'src/feature/waypoint/WaypointDetailScreen.tsx|text|Tap a photo to open full screen.',
  'src/feature/waypoint/WaypointDetailScreen.tsx|title|Waypoint',
  'src/feature/waypoint/WaypointDetailScreen.tsx|title|Trailbook Premium',
  'src/feature/waypoint/WaypointPhotoViewerScreen.tsx|message|This removes the photo from this waypoint.',
  'src/feature/waypoint/WaypointPhotoViewerScreen.tsx|title|Remove failed',
  'src/feature/waypoint/WaypointPhotoViewerScreen.tsx|title|Remove photo?',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|accessibilityLabel|Clear waypoint title',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|accessibilityLabel|Waypoint title',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|placeholder|What should this waypoint be called?',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|placeholder|Waypoint note',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|CATEGORY',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|Cancel',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|Edit waypoint',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|NOTE',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|Save',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|Suggested:',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|TITLE (REQUIRED)',
  'src/feature/waypoint/components/EditWaypointSheet.tsx|text|Use',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Back to photo',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Back to photo',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Back to waypoint',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Open route preview',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Remove current photo',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|accessibilityLabel|Retry photo',
  'src/feature/waypoint/components/WaypointPhotoViewer.tsx|text|Photo unavailable · Retry',
].sort();

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function hardcodedUiCopy() {
  const findings: string[] = [];
  const files = [...tsxFiles(join(MOBILE_ROOT, 'app')), ...tsxFiles(join(MOBILE_ROOT, 'src'))];

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const sourcePath = relative(MOBILE_ROOT, file).replaceAll('\\', '/');

    function visit(node: ts.Node) {
      if (ts.isJsxText(node)) {
        const value = node.getText(source).replace(/\s+/g, ' ').trim();
        if (/[A-Za-zÀ-ÿ]/.test(value)) findings.push(`${sourcePath}|text|${value}`);
      }

      if (
        ts.isJsxAttribute(node) &&
        USER_FACING_ATTRIBUTES.has(node.name.getText(source)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        const value = node.initializer.text.trim();
        if (/[A-Za-zÀ-ÿ]/.test(value)) {
          findings.push(`${sourcePath}|${node.name.getText(source)}|${value}`);
        }
      }

      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
        const propertyName = node.name.getText(source).replace(/["']/g, '');
        const value = node.initializer.text.trim();
        const looksLikeTranslationKey = /^[a-z][a-zA-Z]+(?:\.[a-zA-Z]+)+$/.test(value);
        if (
          USER_FACING_ATTRIBUTES.has(propertyName) &&
          /[A-Za-zÀ-ÿ]/.test(value) &&
          !looksLikeTranslationKey
        ) {
          findings.push(`${sourcePath}|${propertyName}|${value}`);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  return findings.sort();
}

test('does not add hard-coded mobile UI copy beyond the PLAN_78 baseline', () => {
  assert.deepEqual(hardcodedUiCopy(), AUDITED_HARDCODED_UI_COPY);
});
