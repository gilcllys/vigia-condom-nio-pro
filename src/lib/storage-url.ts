const STORAGE_BASE = 'https://rvgrxtzqkygjxlwlmvvn.supabase.co/storage/v1/object/public';

/** Default bucket for fiscal documents */
const DEFAULT_BUCKET = 'nfe-vigia';

/**
 * Builds the full public URL for a file stored in Supabase Storage.
 *
 * Handles two common formats saved in `file_url`:
 *   1. "nf-uploads/condo_id/file.pdf"  → bucket is already in the path
 *   2. "condo_id/file.pdf"             → prepend the default bucket
 */
export function getPublicStorageUrl(fileUrl: string, bucket?: string): string {
  // If the path already starts with a known bucket name, use it as-is
  if (fileUrl.startsWith('nf-uploads/') || fileUrl.startsWith('nfe-vigia/')) {
    return `${STORAGE_BASE}/${fileUrl}`;
  }

  const resolvedBucket = bucket ?? DEFAULT_BUCKET;
  return `${STORAGE_BASE}/${resolvedBucket}/${fileUrl}`;
}
