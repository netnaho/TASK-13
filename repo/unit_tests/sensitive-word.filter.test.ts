describe('SensitiveWordFilter', () => {
  const sensitiveWords = ['scam', 'fraud', 'illegal'];

  function checkSensitiveWords(
    title: string,
    description: string,
    words: string[],
  ): { flagged: boolean; matchedWords: string[] } {
    const combined = `${title} ${description}`.toLowerCase();
    const matched = words.filter((sw) => combined.includes(sw.toLowerCase()));
    return { flagged: matched.length > 0, matchedWords: matched };
  }

  it('detects exact match in title', () => {
    const result = checkSensitiveWords('This is a scam', 'Nice pet', sensitiveWords);
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toContain('scam');
  });

  it('detects exact match in description', () => {
    const result = checkSensitiveWords('Nice pet', 'This is fraud', sensitiveWords);
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toContain('fraud');
  });

  it('is case-insensitive', () => {
    const result = checkSensitiveWords('SCAM ALERT', 'something', sensitiveWords);
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toContain('scam');
  });

  it('detects partial word match (substring)', () => {
    const result = checkSensitiveWords('This is scammy', 'description', sensitiveWords);
    expect(result.flagged).toBe(true);
  });

  it('clean text passes', () => {
    const result = checkSensitiveWords('Beautiful Golden Retriever', 'Healthy puppy', sensitiveWords);
    expect(result.flagged).toBe(false);
    expect(result.matchedWords).toHaveLength(0);
  });

  it('detects multiple prohibited words', () => {
    const result = checkSensitiveWords('scam and fraud', 'illegal activity', sensitiveWords);
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toEqual(expect.arrayContaining(['scam', 'fraud', 'illegal']));
    expect(result.matchedWords).toHaveLength(3);
  });

  it('empty text passes', () => {
    const result = checkSensitiveWords('', '', sensitiveWords);
    expect(result.flagged).toBe(false);
  });

  it('empty word list never flags', () => {
    const result = checkSensitiveWords('scam fraud', 'illegal', []);
    expect(result.flagged).toBe(false);
  });
});
