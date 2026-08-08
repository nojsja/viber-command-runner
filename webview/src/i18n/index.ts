type Locale = 'en' | 'zh';

let catalog: Record<string, Record<string, string>> = {};
let locale: Locale = 'en';

export function initI18n(nextLocale: Locale, nextCatalog: Record<string, Record<string, string>>): void {
  locale = nextLocale === 'zh' ? 'zh' : 'en';
  catalog = nextCatalog || {};
}

export function t(key: string, params?: Record<string, string | number | undefined>): string {
  const table = catalog[locale] || catalog.en || {};
  let text = table[key] || catalog.en?.[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value === undefined ? '' : String(value));
    }
  }
  return text;
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(nextLocale: Locale): void {
  locale = nextLocale === 'zh' ? 'zh' : 'en';
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

const bootstrap = window.__VIBER_I18N__;
if (bootstrap) {
  initI18n(bootstrap.locale, bootstrap.catalog);
}
