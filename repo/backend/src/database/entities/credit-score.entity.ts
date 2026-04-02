import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('credit_scores')
export class CreditScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 500 })
  score: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  transactionSuccessRate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  disputeRate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  cancellationRate: number;

  @CreateDateColumn()
  computedAt: Date;
}
