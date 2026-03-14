const STORAGE_BASE = 'https://rvgrxtzqkygjxlwlmvvn.supabase.co/storage/v1/object/public';

/**
 * Builds the full public URL for a file stored in a Supabase Storage bucket.
 * `file_url` is expected to contain the bucket name + path (e.g. "nf-uploads/condo/file.pdf").
 */
export function getPublicStorageUrl(fileUrl: string): string {
  return `${STORAGE_BASE}/${fileUrl}`;
}
