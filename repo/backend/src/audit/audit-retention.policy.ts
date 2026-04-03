export const RETENTION_YEARS = 7;
export const RETENTION_BATCH_SIZE = 500;
export const ARCHIVE_REASON = '7-year retention policy: PII cleared, hash chain intact';

export function retentionCutoff(now?: Date): Date {
  const d = now ? new Date(now.getTime()) : new Date();
  d.setFullYear(d.getFullYear() - RETENTION_YEARS);
  return d;
}

export function isEligibleForArchival(
  record: { createdAt: Date; archivedAt: Date | null },
  cutoff: Date,
): boolean {
  return record.archivedAt === null && record.createdAt < cutoff;
}
