import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { TranslationRow } from './supabase';
import {
  createLanguagesZip,
  decodeUnicodeEscapes,
  NestedKeyCollisionError,
  serializeLanguageJson,
  setNested,
  toKeyToValueMap,
  type ExportFormat,
} from './importExport';

function rowsFromCatalogs(catalogs: Record<string, Record<string, string | null>>): TranslationRow[] {
  const keys = [...new Set(Object.values(catalogs).flatMap(catalog => Object.keys(catalog)))];
  return keys.map(key => ({
    key,
    key_id: key,
    translations: Object.fromEntries(Object.entries(catalogs).map(([code, catalog]) => [code, {
      value: catalog[key] ?? null,
      translation_id: `${code}:${key}`,
      language_id: code,
    }])),
  }));
}

const parentKey = 'qrPatrol.settings.sosButton';
const childKey = `${parentKey}.back`;
const conflictingCatalog = { [parentKey]: 'Parent label', [childKey]: 'Child label' };

describe('translation JSON export', () => {
  it.each([false, true])('preserves parent and child keys in flat JSON (reverse=%s)', reverse => {
    const rows = rowsFromCatalogs({ en: conflictingCatalog });
    if (reverse) rows.reverse();
    const json = serializeLanguageJson(rows, 'en', 'flat');
    expect(JSON.parse(json)).toEqual(conflictingCatalog);
    expect(toKeyToValueMap(JSON.parse(json))).toEqual(conflictingCatalog);
  });

  it.each([false, true])('rejects nested collisions without overwriting (reverse=%s)', reverse => {
    const entries = Object.entries(conflictingCatalog);
    if (reverse) entries.reverse();
    const nested = {};
    setNested(nested, ...entries[0]);
    const before = JSON.stringify(nested);
    expect(() => setNested(nested, ...entries[1])).toThrow(NestedKeyCollisionError);
    expect(() => setNested(nested, ...entries[1])).toThrow(`both "${parentKey}" and "${childKey}"`);
    expect(() => setNested(nested, ...entries[1])).toThrow('Choose Flat JSON');
    expect(JSON.stringify(nested)).toBe(before);
    const rows = rowsFromCatalogs({ en: Object.fromEntries(entries) });
    expect(() => serializeLanguageJson(rows, 'en', 'nested')).toThrow(NestedKeyCollisionError);
  });

  it('keeps legacy Ionic nested objects and imports them back', () => {
    const catalog = { menu: { title: 'Menu', actions: { back: 'Back', next: 'Next' } }, home: 'Home' };
    const flat = toKeyToValueMap(catalog);
    const rows = rowsFromCatalogs({ en: flat });
    expect(JSON.parse(serializeLanguageJson(rows, 'en', 'nested'))).toEqual(catalog);
    expect(toKeyToValueMap(JSON.parse(serializeLanguageJson(rows, 'en', 'nested')))).toEqual(flat);
  });

  it.each<ExportFormat>(['nested', 'flat'])('round-trips Unicode, placeholders, and line breaks in %s JSON', format => {
    const catalog = {
      'messages.french': 'Équipement déjà connecté — où êtes-vous ?',
      'messages.greek': 'Καλημέρα κόσμε',
      'messages.emoji': '📱 SOS 🚨',
      'messages.placeholders': 'Hello {{name}}, %s, {count} and ${value}',
      'messages.multiline': 'First line\nSecond line\r\n"Quoted" \\ path\tend',
    };
    const imported = toKeyToValueMap(JSON.parse(JSON.stringify(catalog)));
    for (const key of Object.keys(imported)) imported[key] = decodeUnicodeEscapes(imported[key]!);
    const json = serializeLanguageJson(rowsFromCatalogs({ fr: imported }), 'fr', format);
    expect(json).not.toMatch(/[^\x00-\x7F]/);
    const exported = toKeyToValueMap(JSON.parse(json));
    for (const key of Object.keys(exported)) exported[key] = decodeUnicodeEscapes(exported[key]!);
    expect(exported).toEqual(catalog);
  });

  it.each<ExportFormat>(['nested', 'flat'])('uses fallback only for missing values in %s JSON', format => {
    const rows = rowsFromCatalogs({
      fr: { 'test.present': 'Français', 'test.empty': '', 'test.missing': null, 'test.absent': null },
      en: { 'test.present': 'English', 'test.empty': 'Fallback', 'test.missing': 'Missing fallback', 'test.absent': null },
    });
    expect(toKeyToValueMap(JSON.parse(serializeLanguageJson(rows, 'fr', format, 'en')))).toEqual({
      'test.present': 'Français', 'test.empty': '', 'test.missing': 'Missing fallback',
    });
    expect(toKeyToValueMap(JSON.parse(serializeLanguageJson(rows, 'fr', format)))).toEqual({
      'test.present': 'Français', 'test.empty': '',
    });
  });

  it('rejects a collision introduced by fallback', () => {
    const rows = rowsFromCatalogs({ en: { [parentKey]: 'Parent' }, fr: { [childKey]: 'Child' } });
    expect(() => serializeLanguageJson(rows, 'fr', 'nested', 'en')).toThrow(NestedKeyCollisionError);
    expect(JSON.parse(serializeLanguageJson(rows, 'fr', 'flat', 'en'))).toEqual({
      [parentKey]: 'Parent', [childKey]: 'Child',
    });
  });

  it.each<ExportFormat>(['nested', 'flat'])('ZIP entries equal individual %s JSON exports', async format => {
    const rows = rowsFromCatalogs({
      en: { 'messages.title': 'Title', 'messages.body': 'Line one\nLine two', 'messages.empty': '' },
      fr: { 'messages.title': 'Titre 📱', 'messages.body': null, 'messages.empty': '' },
      el: { 'messages.title': 'Τίτλος' },
    });
    const blob = await createLanguagesZip(rows, ['en', 'fr'], format, 'en');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['en.json', 'fr.json']);
    for (const code of ['en', 'fr']) {
      expect(await zip.file(`${code}.json`)!.async('string')).toBe(serializeLanguageJson(rows, code, format, 'en'));
    }
  });

  it('preserves colliding keys in every flat ZIP language', async () => {
    const rows = rowsFromCatalogs({ en: conflictingCatalog, fr: { [parentKey]: 'Parent FR', [childKey]: 'Child FR' } });
    const zip = await JSZip.loadAsync(await (await createLanguagesZip(rows, ['en', 'fr'], 'flat')).arrayBuffer());
    for (const code of ['en', 'fr']) {
      expect(JSON.parse(await zip.file(`${code}.json`)!.async('string'))).toEqual(
        JSON.parse(serializeLanguageJson(rows, code, 'flat'))
      );
    }
  });

  it('rejects the whole nested ZIP when a later selected language collides', async () => {
    const rows = rowsFromCatalogs({ en: { [childKey]: 'Child' }, fr: conflictingCatalog });
    await expect(createLanguagesZip(rows, ['en', 'fr'], 'nested')).rejects.toThrow(NestedKeyCollisionError);
  });
});

// Opt-in full-catalog checks read private local fixtures without copying them into the repo.
const catalogDirectory = process.env.GLOTTER_CATALOG_DIR;
describe.skipIf(!catalogDirectory)('local QR Patrol catalogs', () => {
  it('preserves all 1,774 keys and exact values in individual and ZIP flat exports', async () => {
    const catalogs = Object.fromEntries(['en', 'fr'].map(code => [
      code, JSON.parse(readFileSync(join(catalogDirectory!, `${code}.json`), 'utf8')) as Record<string, string>,
    ]));
    const rows = rowsFromCatalogs(Object.fromEntries(Object.entries(catalogs).map(([code, catalog]) => [
      code, toKeyToValueMap(catalog),
    ])));
    const zip = await JSZip.loadAsync(await (await createLanguagesZip(rows, ['en', 'fr'], 'flat')).arrayBuffer());
    for (const code of ['en', 'fr']) {
      const source = catalogs[code];
      expect(Object.keys(source)).toHaveLength(1774);
      expect(Object.keys(source).filter(key => key.startsWith(`${parentKey}.`))).toHaveLength(20);
      // Boolean comparisons avoid dumping private catalogs if an assertion fails.
      for (const json of [
        serializeLanguageJson(rows, code, 'flat'),
        serializeLanguageJson([...rows].reverse(), code, 'flat'),
        await zip.file(`${code}.json`)!.async('string'),
      ]) {
        const exported = JSON.parse(json) as Record<string, string>;
        expect(Object.keys(exported)).toHaveLength(1774);
        expect(Object.entries(source).every(([key, value]) => exported[key] === value)).toBe(true);
        expect(toKeyToValueMap(exported)[parentKey] === source[parentKey]).toBe(true);
      }
      for (const orderedRows of [rows, [...rows].reverse()]) {
        expect(() => serializeLanguageJson(orderedRows, code, 'nested')).toThrow(NestedKeyCollisionError);
      }
    }
  });
});
