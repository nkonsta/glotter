import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Never redirect to a locale prefix for the default locale
  localePrefix: 'always'
});

export const config = {
  // Match all pathnames except for
  // - API routes (/api/*)
  // - Static files (/_next/*, /favicon.ico, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)']
};
