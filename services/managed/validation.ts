import { z } from 'zod';

export const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
export const moneySchema = z.number().int().min(0).max(1_000_000_000_000);
export const featuresSchema = z.array(z.enum(['conversation', 'planning', 'transcription', 'speech'])).max(4);
export const requestSchema = z.object({
  requestId: idSchema,
  objectiveId: idSchema.optional(),
  route: idSchema,
  input: z.json(),
}).strict();

export class ManagedError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code);
  }
}

/** Stable fingerprint input; object member order is not request identity. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, limit = 256 * 1024): Promise<unknown> {
  if (!body) throw new ManagedError('invalid_body');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw new ManagedError('body_too_large', 413);
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof ManagedError) throw error;
    throw new ManagedError('invalid_body');
  } finally {
    reader.releaseLock();
  }
}
