import { locales } from '@/i18n';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Glotter - Translation Management',
  description: 'Modern translation management tool for your projects',
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
