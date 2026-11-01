// Re-download the Gallery texts (Project Gutenberg ebooks 16182 and 73891, public domain)
// into public/gallery/. They are committed already; this script is their provenance.
//
//   npm run gallery:fetch

import { mkdirSync, writeFileSync } from 'node:fs';
import { GALLERY_TEXT_PATHS } from '../src';

mkdirSync(new URL('../public/gallery/', import.meta.url), { recursive: true });

for (const path of GALLERY_TEXT_PATHS) {
  const id = /pg(\d+)\.txt$/.exec(path)?.[1];
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  const text = await response.text();
  writeFileSync(new URL(`../public/${path}`, import.meta.url), text);
  console.log(`${path}: ${text.length} characters from ${url}`);
}
