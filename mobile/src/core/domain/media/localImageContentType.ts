import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';

export function localImageContentType(localUri: string): Result<string> {
  const extension = localUri.split('?')[0]?.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return ok('image/jpeg');
    case 'png':
      return ok('image/png');
    case 'webp':
      return ok('image/webp');
    case 'heic':
    case 'heif':
      return err('HEIC/HEIF photo was not normalized to JPEG. Add the photo again.');
    default:
      return err(`Unsupported local image format: ${extension ?? 'unknown'}.`);
  }
}
