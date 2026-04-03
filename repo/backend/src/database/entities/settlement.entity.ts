import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum SettlementStatus {
  PENDING = 'pending',
  REVIEWER_APPROVED = 'reviewer_approved',
  FINANCE_APPROVED = 'finance_approved',
  REJECTED = 'rejected',
}

/**
 * The (vendorId, month) pair must be unique — a vendor has exactly one
 * settlement statement per billing period.  This constraint is the primary
 * idempotency guard: a DB-level unique violation (PG code 23505) is caught
 * in the generation service and treated as "already generated" rather than
 * an error, making concurrent or retried runs safe.
 */
@Entity('settlements')
@Index(['vendorId', 'month'], { unique: true })
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vendorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendorId' })
  vendor: User;

  @Column()
  month: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalCharges: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  taxAmount: number;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.PENDING,
  })
  status: SettlementStatus;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, unknown>;

  @Column({ nullable: true, type: 'varchar' })
  reviewerApprovedBy: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  reviewerApprovedAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  financeApprovedBy: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  financeApprovedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
