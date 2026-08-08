import { getLocale } from '../i18n';

export function formatTime(value: string): string {
  const locale = getLocale() === 'zh' ? 'zh-CN' : 'en-US';
  try {
    return new Date(value).toLocaleString(locale, { hour12: false });
  } catch {
    return value;
  }
}

export function badgeClass(text: string, kind: string): string {
  const normalized = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) {
    return '';
  }
  if (kind === 'platform') {
    return `platform-${normalized}`;
  }
  if (kind === 'type') {
    return `type-${normalized}`;
  }
  if (kind === 'dest') {
    return `dest-${normalized}`;
  }
  if (kind === 'interactive') {
    return 'interactive';
  }
  if (normalized === 'custom' || normalized === 'adhoc') {
    return `type-${normalized}`;
  }
  return `tag-${normalized}`;
}
