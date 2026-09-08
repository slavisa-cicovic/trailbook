import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useCallback } from 'react';
import { create } from 'zustand';

import { en, translations, type TranslationKey } from './translations';

export const SUPPORTED_LANGUAGES = ['en', 'sr', 'it', 'es', 'de', 'fr'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = 'system' | AppLanguage;

const STORAGE_KEY = 'trailbook.language_preference';

function isLanguage(value: string | null | undefined): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

function systemLanguage(): AppLanguage {
  const languageCode = getLocales()[0]?.languageCode?.toLowerCase();
  return isLanguage(languageCode) ? languageCode : 'en';
}

interface I18nState {
  preference: LanguagePreference;
  language: AppLanguage;
  init(): Promise<void>;
  setPreference(preference: LanguagePreference): Promise<void>;
}

export const useI18nStore = create<I18nState>((set) => ({
  preference: 'system',
  language: systemLanguage(),
  async init() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const preference: LanguagePreference = stored === 'system' || isLanguage(stored) ? stored : 'system';
    set({ preference, language: preference === 'system' ? systemLanguage() : preference });
  },
  async setPreference(preference) {
    set({ preference, language: preference === 'system' ? systemLanguage() : preference });
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  },
}));

export type TranslationParams = Record<string, string | number>;

export function translate(language: AppLanguage, key: TranslationKey, params?: TranslationParams) {
  const value = translations[language][key] ?? en[key];
  if (!params) return value;
  return Object.entries(params).reduce(
    (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
    value,
  );
}

export function useI18n() {
  const language = useI18nStore((state) => state.language);
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  const localizeError = useCallback((error: string) => {
    const known: Array<[string, TranslationKey]> = [
      ['PREMIUM_ENTITLEMENT_REQUIRED', 'error.premiumRequired'],
      ['LOCAL_TEST_TRIP_ALREADY_USED', 'error.testTripUsed'],
      ['LOCAL_TEST_TRIP_PHOTO_LIMIT', 'error.photoLimit'],
      ['An active Trailbook Premium subscription is required.', 'error.premiumRequired'],
      ['Your local test trip has been used.', 'error.testTripUsed'],
      ['The local test trip supports up to three photos.', 'error.photoLimit'],
      ['Location permission denied.', 'error.locationPermission'],
      ['Background location is unavailable in this build.', 'error.backgroundLocation'],
      ['Always allow location access is required for trip recording.', 'error.alwaysLocation'],
      ['Unable to start location capture:', 'error.unableToStartLocation'],
      ['Title is required', 'error.titleRequired'],
    ];
    const match = known.find(([message]) => error.includes(message));
    return match ? t(match[1]) : error;
  }, [t]);
  return { language, locale: language === 'sr' ? 'sr-Latn' : language, localizeError, t };
}
