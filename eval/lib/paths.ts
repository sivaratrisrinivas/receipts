// Where the eval reads and writes, relative to the repository.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GALLERY_TEXT_PATHS } from '../../src';

/** The dataset folder that gets published; traces live in `traces/` inside it. */
export const DATASET_DIR = fileURLToPath(new URL('../dataset/', import.meta.url));

/** The committed Gutenberg texts of the Gallery. */
export function loadGalleryTexts(): string[] {
  return GALLERY_TEXT_PATHS.map((path) => readFileSync(new URL(`../../public/${path}`, import.meta.url), 'utf8'));
}
