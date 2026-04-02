describe('CreditScoreEngine', () => {
  function computeScore(
    transactionSuccessRate: number,
    disputeRate: number,
    cancellationRate: number,
  ): number {
    const raw =
      (transactionSuccessRate * 0.5 -
        disputeRate * 0.3 -
        cancellationRate * 0.2) *
      1000;
    return Math.round(Math.min(1000, Math.max(0, raw)));
  }

  it('perfect vendor scores 500 (100% success, 0 dispute, 0 cancel)', () => {
    expect(computeScore(1.0, 0, 0)).toBe(500);
  });

  it('worst case clamps to 0', () => {
    expect(computeScore(0, 1.0, 1.0)).toBe(0);
  });

  it('applies 0.5/0.3/0.2 weights correctly', () => {
    const score = computeScore(0.8, 0.1, 0.05);
    const expected = Math.round((0.8 * 0.5 - 0.1 * 0.3 - 0.05 * 0.2) * 1000);
    expect(score).toBe(expected);
  });

  it('clamps above 1000', () => {
    expect(computeScore(3.0, 0, 0)).toBe(1000);
  });

  it('clamps below 0', () => {
    expect(computeScore(0, 2.0, 2.0)).toBe(0);
  });

  it('default score for no history is 1.0 success rate → 500', () => {
    const defaultSuccessRate = 1.0;
    const defaultDisputeRate = 0;
    const defaultCancelRate = 0;
    expect(computeScore(defaultSuccessRate, defaultDisputeRate, defaultCancelRate)).toBe(500);
  });

  it('mixed rates compute correctly', () => {
    const score = computeScore(0.92, 0.02, 0.06);
    const expected = Math.round((0.92 * 0.5 - 0.02 * 0.3 - 0.06 * 0.2) * 1000);
    expect(score).toBe(expected);
    expect(score).toBe(442);
  });
});
