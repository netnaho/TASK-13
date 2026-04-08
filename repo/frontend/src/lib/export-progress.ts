/**
 * Pure utility for deriving progress-bar display state from an export job.
 * No React or browser dependencies — safe to unit-test in Node.
 */

export interface ProgressBarState {
  /** CSS width string, e.g. "50%" or "100%". */
  width: string;
  /**
   * True when the exact position is unknown and an animation should convey
   * activity rather than a precise value (indeterminate / pulsing bar).
   */
  indeterminate: boolean;
}

/**
 * Derive the visual state for an export-job progress bar.
 *
 * Rules:
 *  - done             → 100 %, not indeterminate
 *  - running + value  → use `progressPercent`, not indeterminate
 *  - running + null   → 60 % fallback, indeterminate (legacy / pre-progress rows)
 *  - queued           → `progressPercent` if set, else 0 %
 *  - failed           → last known `progressPercent`, else 0 % (not indeterminate)
 *  - anything else    → 0 %
 */
export function getProgressBarState(
  status: string,
  progressPercent?: number | null,
): ProgressBarState {
  if (status === 'done') {
    return { width: '100%', indeterminate: false };
  }

  if (status === 'running') {
    if (progressPercent != null) {
      const clamped = Math.min(100, Math.max(0, progressPercent));
      return { width: `${clamped}%`, indeterminate: false };
    }
    // Fallback: no value available → show indeterminate pulse at ~60 %
    return { width: '60%', indeterminate: true };
  }

  // queued, failed, or any other status
  const pct = progressPercent != null ? Math.min(100, Math.max(0, progressPercent)) : 0;
  return { width: `${pct}%`, indeterminate: false };
}

/** Returns true for statuses where we should render the progress bar at all. */
export function shouldShowProgressBar(status: string): boolean {
  return status === 'queued' || status === 'running';
}
