import { computed, signal } from '@angular/core';

/**
 * Runtime i18n without a library (taken over from files-and-folders-tauri). English is the
 * source; a catalog is a typed object of strings and functions. {@link translatable} returns a
 * proxy that reads the language signal on every access – templates and `computed`s follow a
 * language switch without a reload, and components keep `readonly t = XX_TEXTS`.
 *
 * Never copy a text at module load (`const X = TEXTS.y`): read it in a template, a `computed`
 * or a function.
 */
export type Language = 'en' | 'de';
export const LANGUAGES: readonly Language[] = ['en', 'de'];

/** Same keys and signatures as the English catalog, strings widened. */
export type Translation<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Translation<R>
  : T extends string
    ? string
    : T extends readonly (infer E)[]
      ? readonly Translation<E>[]
      : T extends object
        ? { readonly [K in keyof T]: Translation<T[K]> }
        : T;

const current = signal<Language>('en');

/** The UI language (reactive). */
export const language = current.asReadonly();

export function setLanguage(lang: Language): void {
  current.set(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

function systemLocales(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** The language of the system: German if the first preferred language is German, else English. */
export function systemLanguage(locales: readonly string[] = systemLocales()): Language {
  const first = (locales[0] ?? '').toLowerCase();
  return first === 'de' || first.startsWith('de-') ? 'de' : 'en';
}

/** The `Intl` locale of the current language (reactive). */
export const locale = computed(() => current());

/** All catalogs (completeness test in `catalogs.spec.ts`). */
export const CATALOGS = new Map<
  string,
  { readonly en: object; readonly tr: Readonly<Record<string, object>> }
>();

/**
 * A catalog that follows the language. A key missing in a translation (never with the types,
 * but e.g. in a hot-reloaded partial file) falls back to English.
 */
export function translatable<T extends object>(
  name: string,
  en: T,
  tr: { readonly de: Translation<T> },
): Translation<T> {
  CATALOGS.set(name, { en, tr: tr as Record<string, object> });
  return new Proxy(en, {
    get(target, prop, receiver) {
      const lang = current();
      if (lang !== 'en') {
        const cat = (tr as Record<string, Record<PropertyKey, unknown>>)[lang];
        if (cat && prop in cat) {
          return cat[prop];
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as Translation<T>;
}
