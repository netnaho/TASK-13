/**
 * export-progress.test.ts  (Vitest / frontend suite)
 *
 * Tests for getProgressBarState() and shouldShowProgressBar() covering the
 * two key rendering modes called out in the acceptance criteria:
 *   "real progress" — progressPercent is a number → use it, no animation
 *   "fallback mode" — progressPercent is null/undefined + status=running
 *                      → 60 % indeterminate bar (legacy / pre-progress rows)
 */

import { describe, it, expect } from 'vitest';
import { getProgressBarState, shouldShowProgressBar } from './export-progress';

// ── Real progress (progressPercent is a known number) ─────────────────────────

describe('getProgressBarState — real progress values', () => {
  it('running + 10 → width "10%", not indeterminate', () => {
    const s = getProgressBarState('running', 10);
    expect(s.width).toBe('10%');
    expect(s.indeterminate).toBe(false);
  });

  it('running + 50 → width "50%", not indeterminate', () => {
    const s = getProgressBarState('running', 50);
    expect(s.width).toBe('50%');
    expect(s.indeterminate).toBe(false);
  });

  it('running + 90 → width "90%", not indeterminate', () => {
    const s = getProgressBarState('running', 90);
    expect(s.width).toBe('90%');
    expect(s.indeterminate).toBe(false);
  });

  it('running + 100 → width "100%", not indeterminate', () => {
    const s = getProgressBarState('running', 100);
    expect(s.width).toBe('100%');
    expect(s.indeterminate).toBe(false);
  });

  it('done → always "100%", not indeterminate (ignores any progressPercent)', () => {
    expect(getProgressBarState('done', 42).width).toBe('100%');
    expect(getProgressBarState('done', undefined).width).toBe('100%');
    expect(getProgressBarState('done').indeterminate).toBe(false);
  });

  it('out-of-bound value > 100 is clamped to 100%', () => {
    expect(getProgressBarState('running', 999).width).toBe('100%');
  });

  it('negative value is clamped to 0%', () => {
    expect(getProgressBarState('running', -5).width).toBe('0%');
  });
});

// ── Fallback / indeterminate mode ─────────────────────────────────────────────

describe('getProgressBarState — indeterminate fallback (legacy rows)', () => {
  it('running + null → width "60%", indeterminate=true', () => {
    const s = getProgressBarState('running', null);
    expect(s.width).toBe('60%');
    expect(s.indeterminate).toBe(true);
  });

  it('running + undefined → width "60%", indeterminate=true', () => {
    const s = getProgressBarState('running', undefined);
    expect(s.width).toBe('60%');
    expect(s.indeterminate).toBe(true);
  });

  it('running with no second arg → indeterminate fallback', () => {
    const s = getProgressBarState('running');
    expect(s.indeterminate).toBe(true);
  });
});

// ── Other statuses ────────────────────────────────────────────────────────────

describe('getProgressBarState — non-running statuses', () => {
  it('queued + 0 → 0%, not indeterminate', () => {
    expect(getProgressBarState('queued', 0)).toEqual({ width: '0%', indeterminate: false });
  });

  it('failed + last-known value → preserves that percentage', () => {
    expect(getProgressBarState('failed', 50).width).toBe('50%');
    expect(getProgressBarState('failed', 50).indeterminate).toBe(false);
  });

  it('expired → 0%, not indeterminate', () => {
    expect(getProgressBarState('expired')).toEqual({ width: '0%', indeterminate: false });
  });
});

// ── shouldShowProgressBar ─────────────────────────────────────────────────────

describe('shouldShowProgressBar()', () => {
  it.each(['queued', 'running'] as const)('returns true for %s', (s) => {
    expect(shouldShowProgressBar(s)).toBe(true);
  });

  it.each(['done', 'failed', 'expired'] as const)('returns false for %s', (s) => {
    expect(shouldShowProgressBar(s)).toBe(false);
  });
});
