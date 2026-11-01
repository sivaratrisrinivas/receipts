// Handing a finished Card to the Giver, in the browser: render the PNG, save a file, open
// the phone's share sheet, print. The only module of the Card that touches the DOM.

import type { CardContent } from './content';
import { drawCard } from './png';

/** The Card as a PNG. */
export async function renderPng(card: CardContent): Promise<Blob> {
  const canvas = drawCard(card, (width, height) => Object.assign(document.createElement('canvas'), { width, height }));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not make the image.'))), 'image/png');
  });
}

/** `receipts-card-for-elizabeth.png`: a file name that says what it is, safe on any system. */
export function cardFilename(card: Pick<CardContent, 'recipient'>, extension: 'png' | 'html'): string {
  const who = card.recipient
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `receipts-card${who ? `-for-${who}` : ''}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link); // Firefox only follows a link that is in the page
  link.click();
  link.remove();
  // Revoking at once breaks the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether this device can hand a PNG to its share sheet (WhatsApp, Photos, ...). */
export function canSharePng(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'card.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/**
 * Open the share sheet with the PNG. Call it straight from a click, with a PNG that is
 * already made: Safari refuses to share once the tap's user activation has lapsed.
 * Resolves false when the Giver closed the sheet; rejects when sharing was not allowed.
 */
export async function sharePng(blob: Blob, filename: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })] });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

/**
 * Print the HTML Card on its own, through its own print stylesheet. It goes through a
 * hidden frame so the Space around it, and anything private on screen, is never printed.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.title = 'The Card, for printing';
  frame.setAttribute('aria-hidden', 'true');
  // Not display:none, which some browsers print as a blank page.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  const remove = () => frame.remove();
  frame.addEventListener(
    'load',
    () => {
      const view = frame.contentWindow;
      if (!view) return remove();
      view.addEventListener('afterprint', remove);
      view.focus();
      view.print();
      // Some browsers never report afterprint; do not leave the frame behind forever.
      setTimeout(remove, 120_000);
    },
    { once: true },
  );
  frame.srcdoc = html;
  document.body.append(frame);
}
