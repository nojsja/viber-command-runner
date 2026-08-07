(function (global) {
  /** @type {Record<string, Record<string, string>>} */
  let catalog = {};
  /** @type {'en' | 'zh'} */
  let locale = 'en';

  /**
   * @param {'en' | 'zh'} nextLocale
   * @param {Record<string, Record<string, string>>} nextCatalog
   */
  function initI18n(nextLocale, nextCatalog) {
    locale = nextLocale === 'zh' ? 'zh' : 'en';
    catalog = nextCatalog || {};
  }

  /**
   * @param {string} key
   * @param {Record<string, string | number | undefined>} [params]
   */
  function t(key, params) {
    const table = catalog[locale] || catalog.en || {};
    let text = table[key] || (catalog.en && catalog.en[key]) || key;
    if (params) {
      Object.entries(params).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, value === undefined ? '' : String(value));
      });
    }
    return text;
  }

  function applyStaticI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      node.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (!key || !('placeholder' in node)) {
        return;
      }
      /** @type {HTMLInputElement} */ (node).placeholder = t(key);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((node) => {
      const key = node.getAttribute('data-i18n-title');
      if (!key) {
        return;
      }
      node.setAttribute('title', t(key));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((node) => {
      const key = node.getAttribute('data-i18n-aria');
      if (!key) {
        return;
      }
      node.setAttribute('aria-label', t(key));
    });
  }

  function getLocale() {
    return locale;
  }

  /**
   * @param {'en' | 'zh'} nextLocale
   */
  function setLocale(nextLocale) {
    locale = nextLocale === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    applyStaticI18n(document);
  }

  global.ViberI18n = {
    initI18n,
    t,
    applyStaticI18n,
    getLocale,
    setLocale,
  };
})(window);
