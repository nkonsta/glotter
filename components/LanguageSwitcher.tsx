'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { locales } from '@/i18n';

const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  zh: '中文',
  el: 'Ελληνικά',
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showMenu, setShowMenu] = useState(false);

  const handleLocaleChange = (newLocale: string) => {
    startTransition(() => {
      // Remove the current locale from the pathname and add the new one
      const segments = pathname.split('/');
      if (locales.includes(segments[1] as any)) {
        segments[1] = newLocale;
      } else {
        segments.splice(1, 0, newLocale);
      }
      const newPathname = segments.join('/');
      router.replace(newPathname);
      setShowMenu(false);
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
        aria-label="Change language"
      >
        <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
        <span className="font-medium">{locale.toUpperCase()}</span>
        <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowMenu(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-48 bg-surface-elevated rounded-lg shadow-lg border border-border z-40 overflow-hidden">
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => handleLocaleChange(loc)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  loc === locale
                    ? 'bg-primary-soft text-foreground font-medium'
                    : 'hover:bg-surface-hover text-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{languageNames[loc]}</span>
                  <span className="text-xs text-muted">{loc.toUpperCase()}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
