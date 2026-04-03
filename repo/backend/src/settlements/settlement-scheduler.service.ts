import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { previousMonthPeriod, isFirstDayOfMonthUTC } from './settlement-period';
import { logger } from '../common/logger/winston.logger';

/**
 * Scheduler actor ID written into audit logs when generation is triggered
 * automatically.  Uses a namespaced string rather than a real user UUID so
 * it is distinguishable in audit queries.
 */
export const SCHEDULER_ACTOR_ID = 'system:settlement-scheduler';

/**
 * How often the scheduler wakes up to check whether it should run.
 * Hourly is conservative — the actual generation only fires on the 1st of
 * the month in UTC, and the in-memory `lastGeneratedPeriod` guard ensures
 * it fires at most once per calendar month even with multiple ticks on the 1st.
 *
 * The DB-level unique constraint on (vendorId, month) is the hard idempotency
 * guarantee if, e.g., multiple service replicas are running.
 */
const TICK_INTERVAL_MS = 60 * 60 * 1000; // hourly

const CONTEXT = 'SettlementScheduler';

@Injectable()
export class SettlementSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * In-memory guard: tracks the last period that this instance triggered
   * generation for.  Prevents multiple ticks on the same 1st-of-month day
   * from enqueuing redundant runs.  The DB constraint handles cross-replica
   * deduplication.
   */
  private lastGeneratedPeriod: string | null = null;

  constructor(private readonly settlementsService: SettlementsService) {}

  onModuleInit(): void {
    // Fire immediately on startup — catches the case where the server was
    // restarted on the 1st after the scheduled window was missed.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Called on each interval tick. Runs generation only when:
   *   1. Today is the 1st of the month in UTC.
   *   2. This instance has not already triggered generation for this period.
   *
   * Generation itself is fully idempotent via the DB unique constraint, so
   * a tick that fires after a crash-recovery will safely skip already-created
   * records.
   *
   * @param now Injectable clock value — defaults to `new Date()`. Pass an
   *   explicit value in tests to avoid mocking the global Date object.
   */
  async tick(now: Date = new Date()): Promise<void> {
    if (!isFirstDayOfMonthUTC(now)) return;

    const period = previousMonthPeriod(now);

    if (this.lastGeneratedPeriod === period) {
      // Already triggered by an earlier tick this same day on this instance
      return;
    }

    this.lastGeneratedPeriod = period;

    logger.info('Settlement scheduler triggered', {
      context: CONTEXT,
      period,
      triggeredAt: now.toISOString(),
    });

    try {
      const result = await this.settlementsService.generateMonthly(
        period,
        SCHEDULER_ACTOR_ID,
        'scheduler',
      );
      logger.info('Settlement scheduler run completed', {
        context: CONTEXT,
        period,
        generatedCount: result.generatedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        durationMs: result.durationMs,
      });
    } catch (err: any) {
      logger.error('Settlement scheduler run failed', {
        context: CONTEXT,
        period,
        error: err?.message,
        stack: err?.stack,
      });
    }
  }
}
