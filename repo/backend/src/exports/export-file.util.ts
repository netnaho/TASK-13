import * as fs from 'fs';

export interface FileDeleteResult {
  deleted: boolean;
  /** 'file_not_found' when ENOENT, otherwise the OS error message */
  error?: string;
}

/**
 * Delete a file from disk, returning a structured result instead of throwing.
 *
 * - ENOENT (already gone): treated as a successful no-op — the file is absent
 *   either way, so the caller can safely clear the DB path.
 * - Any other OS error: surfaces the message so callers can log it and still
 *   proceed to clear DB metadata (best-effort strategy).
 */
export function safeDeleteFile(filePath: string): FileDeleteResult {
  try {
    fs.unlinkSync(filePath);
    return { deleted: true };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { deleted: false, error: 'file_not_found' };
    }
    return { deleted: false, error: err.message as string };
  }
}
