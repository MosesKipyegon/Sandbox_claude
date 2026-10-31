// Photo processing: resize in the browser and re-encode as JPEG.
// Drawing to a canvas and re-encoding keeps only the pixels, so all EXIF metadata — including GPS
// location — is dropped. Phone photos are rotated upright first (EXIF orientation is applied on decode).

const FULL_EDGE = 1600;   // long edge of the stored photo
const THUMB_EDGE = 480;   // long edge of the feed thumbnail
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.75;

export const MAX_PHOTOS = 5;

export async function processPhoto(file) {
  const { source, cleanup } = await decode(file);
  try {
    const full = await render(source, FULL_EDGE, FULL_QUALITY);
    const thumb = await render(source, THUMB_EDGE, THUMB_QUALITY);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    cleanup();
  }
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, cleanup: () => bmp.close && bmp.close() };
    } catch (e) { /* fall back to <img> (older browsers, unusual formats) */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw new Error('This file could not be read as an image.'); }
  return { source: img, cleanup: () => URL.revokeObjectURL(url) };
}

async function render(source, maxEdge, quality) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.round(w0 * scale), height = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  return { blob, width, height };
}

/** Object URLs for displaying stored blobs; call revokeAll() when the view goes away. */
const liveUrls = new Set();
export function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  liveUrls.add(url);
  return url;
}
export function revokeAll() {
  liveUrls.forEach(u => URL.revokeObjectURL(u));
  liveUrls.clear();
}
