const STORAGE_BASE = 'https://rvgrxtzqkygjxlwlmvvn.supabase.co/storage/v1/object/public/nfe-vigia';

/**
 * Builds the full public URL for a file stored in the nfe-vigia bucket.
 * `file_url` is expected to contain only the relative path (e.g. "condo_id/file.pdf").
 */
export function getPublicStorageUrl(fileUrl: string): string {
  return `${STORAGE_BASE}/${fileUrl}`;
}
