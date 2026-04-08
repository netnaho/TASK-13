import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Append-only archival manifest.
 *
 * Each row records that a specific audit-log entry has been processed by the
 * 7-year retention job.  Writing here is the ONLY mutation the retention job
 * performs — the original AuditLog rows are never touched after creation,
 * preserving strict append-only semantics for the audit chain.
 *
 * archivedAt / archiveReason on the original AuditLog columns are kept as
 * nullable legacy columns for backward-compatibility but are no longer written.
 */
@Entity('audit_archival_records')
export class AuditArchivalRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to audit_logs.id — unique ensures each record is archived exactly once. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  auditLogId: string;

  @Column({ type: 'timestamp' })
  archivedAt: Date;

  @Column({ type: 'text' })
  archiveReason: string;
}
