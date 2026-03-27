const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string || 'http://localhost:8000';

/**
 * Builds the full public URL for a file stored via the backend.
 *
 * Handles two common formats saved in `file_url`:
 *   1. "/media/bucket/path/file.pdf"  → already a full path, use as-is with API base
 *   2. "bucket/path/file.pdf"         → prepend the API base + /media/
 */
export function getPublicStorageUrl(fileUrl: string, _bucket?: string): string {
  // If already an absolute URL, return as-is
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }

  // If starts with /media/, just prepend API base
  if (fileUrl.startsWith('/media/')) {
    return `${API_BASE_URL}${fileUrl}`;
  }

  // Otherwise, prepend API base + /media/
  return `${API_BASE_URL}/media/${fileUrl}`;
}
