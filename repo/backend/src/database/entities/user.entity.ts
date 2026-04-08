import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  SHOPPER = 'shopper',
  VENDOR = 'vendor',
  ADMIN = 'admin',
  OPS_REVIEWER = 'ops_reviewer',
  FINANCE_ADMIN = 'finance_admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SHOPPER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, type: 'text' })
  deviceFingerprint: string | null;

  @Column({ nullable: true, type: 'text' })
  lastIp: string | null;

  /**
   * Contact phone number. Stored AES-256 encrypted (same convention as email).
   * NULL when the user has not provided a phone number.
   * Settlement CSV: full value for admin, last-4 masked for other roles, empty
   * string when absent.  Never derived from deviceFingerprint.
   */
  @Column({ nullable: true, type: 'text' })
  phone: string | null;

  // ── Address fields (all nullable; sensitive parts stored encrypted) ─────────

  /** Street address line 1 — encrypted at rest. */
  @Column({ nullable: true, type: 'text' })
  addressLine1: string | null;

  /** Street address line 2 — encrypted at rest (optional). */
  @Column({ nullable: true, type: 'text' })
  addressLine2: string | null;

  /**
   * City component.  Shown as-is to non-admin roles (city+state are the
   * permitted disclosure per data-masking policy).
   */
  @Column({ nullable: true, type: 'text' })
  city: string | null;

  /** State / province / region — shown to non-admin roles alongside city. */
  @Column({ nullable: true, type: 'text' })
  stateRegion: string | null;

  /** Postal / ZIP code — encrypted at rest. */
  @Column({ nullable: true, type: 'text' })
  postalCode: string | null;

  /** Country (ISO-3166 code or free text) — not sensitive, stored plaintext. */
  @Column({ nullable: true, type: 'text' })
  country: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
