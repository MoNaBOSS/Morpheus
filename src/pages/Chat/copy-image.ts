import { readBinaryFile } from '@/lib/file-preview-client';

export interface ImageCopyTarget {
  filePath?: string;
  preview?: string | null;
  mimeType?: string;
  base64?: string;
}

function blobFromBytes(data: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(data);
  return new Blob([copy], { type: mimeType });
}

async function blobFromDataUrl(dataUrl: string): Promise<Blob | null> {
  try {
    if (!dataUrl.startsWith('data:')) return null;
    const separator = dataUrl.indexOf(',');
    if (separator < 5) return null;

    const metadata = dataUrl.slice(5, separator);
    const payload = dataUrl.slice(separator + 1);
    const segments = metadata.split(';');
    const mimeType = segments[0] || 'application/octet-stream';
    const bytes = segments.includes('base64')
      ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return blobFromBytes(bytes, mimeType);
  } catch {
    return null;
  }
}

async function writeImageBlob(blob: Blob, fallbackMimeType: string): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  const type = blob.type || fallbackMimeType;
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
  return true;
}

export async function copyImageToClipboard(target: ImageCopyTarget): Promise<boolean> {
  const mimeType = target.mimeType?.startsWith('image/') ? target.mimeType : 'image/png';

  if (target.base64) {
    const blob = await blobFromDataUrl(`data:${mimeType};base64,${target.base64}`);
    return blob ? writeImageBlob(blob, mimeType) : false;
  }

  if (target.preview?.startsWith('data:')) {
    const blob = await blobFromDataUrl(target.preview);
    return blob ? writeImageBlob(blob, mimeType) : false;
  }

  if (target.filePath) {
    const result = await readBinaryFile(target.filePath);
    if (!result.ok || !result.data) return false;
    return writeImageBlob(blobFromBytes(result.data, result.mimeType || mimeType), mimeType);
  }

  return false;
}
