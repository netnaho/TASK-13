import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column()
  actorId: string;

  @Column()
  entityType: string;

  @Column({ nullable: true, type: 'varchar' })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ nullable: true, type: 'text' })
  deviceFingerprint: string | null;

  @Column({ nullable: true, type: 'text' })
  ip: string | null;

  @Column({ type: 'text' })
  hash: string;

  @Column({ nullable: true, type: 'text' })
  prevHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
