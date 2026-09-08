import assert from "node:assert/strict";
import test from "node:test";

import { purchaseTranslations } from "../../src/i18n/purchaseTranslations";

const placeholders = (value: string) =>
  [...value.matchAll(/{{([^}]+)}}/g)].map((match) => match[1]).sort();

test("purchase translations cover every key and interpolation parameter", () => {
  const englishKeys = Object.keys(purchaseTranslations.en).sort();

  for (const [language, copy] of Object.entries(purchaseTranslations)) {
    assert.deepEqual(
      Object.keys(copy).sort(),
      englishKeys,
      `${language} keys differ`,
    );
    for (const key of englishKeys) {
      assert.deepEqual(
        placeholders(copy[key as keyof typeof copy]),
        placeholders(
          purchaseTranslations.en[key as keyof typeof purchaseTranslations.en],
        ),
        `${language}.${key} placeholders differ`,
      );
    }
  }
});
