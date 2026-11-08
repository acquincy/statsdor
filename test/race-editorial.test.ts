import { describe, it, expect } from 'vitest';

// 1. Headline generation logic test
function generateRaceHeadline(
  leaderName: string,
  leaderScore: number,
  secondName: string | null,
  secondScore: number
): string {
  if (!secondName || leaderScore === secondScore) {
    if (secondName) {
      return `${leaderName} and ${secondName} share the lead on ${leaderScore} contributions`;
    }
    return `${leaderName} leads the continent with ${leaderScore} contributions`;
  }
  const gap = leaderScore - secondScore;
  if (gap === 1) {
    return `${leaderName} edges one clear at the summit`;
  }
  if (gap === 2) {
    return `${leaderName} establishes a two-goal cushion at the top`;
  }
  return `${leaderName} pulls ${gap} clear in the race for the top spot`;
}

// 2. Collision avoidance algorithm test
function resolveLabelCollisions(
  rawYPositions: number[],
  minGap: number = 20,
  minY: number = 20,
  maxY: number = 400
): number[] {
  const labels = rawYPositions.map((y, idx) => ({ id: idx, rawY: y, targetY: y }));
  labels.sort((a, b) => a.rawY - b.rawY);

  // Forward relaxation
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].targetY < labels[i - 1].targetY + minGap) {
      labels[i].targetY = labels[i - 1].targetY + minGap;
    }
  }

  // Backward relaxation
  if (labels.length > 0 && labels[labels.length - 1].targetY > maxY) {
    labels[labels.length - 1].targetY = maxY;
    for (let i = labels.length - 2; i >= 0; i--) {
      if (labels[i].targetY > labels[i + 1].targetY - minGap) {
        labels[i].targetY = labels[i + 1].targetY - minGap;
      }
    }
  }

  // Top clamp
  if (labels.length > 0 && labels[0].targetY < minY) {
    labels[0].targetY = minY;
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].targetY < labels[i - 1].targetY + minGap) {
        labels[i].targetY = labels[i - 1].targetY + minGap;
      }
    }
  }

  // Map back to original order
  const resultMap = new Map(labels.map((l) => [l.id, l.targetY]));
  return rawYPositions.map((_, idx) => resultMap.get(idx)!);
}

// 3. Form strip streaks calculation test
function computeStreaks(matches: { goals: number; assists: number }[]) {
  let maxScoringStreak = 0;
  let currentScoringStreak = 0;
  let maxContributionStreak = 0;
  let currentContributionStreak = 0;
  let matchesWithOutput = 0;

  matches.forEach((m) => {
    const scored = m.goals > 0;
    const hadOutput = m.goals > 0 || m.assists > 0;

    if (hadOutput) {
      matchesWithOutput++;
      currentContributionStreak++;
      if (currentContributionStreak > maxContributionStreak) {
        maxContributionStreak = currentContributionStreak;
      }
    } else {
      currentContributionStreak = 0;
    }

    if (scored) {
      currentScoringStreak++;
      if (currentScoringStreak > maxScoringStreak) {
        maxScoringStreak = currentScoringStreak;
      }
    } else {
      currentScoringStreak = 0;
    }
  });

  return {
    maxScoringStreak,
    maxContributionStreak,
    matchesWithOutput,
    strikeRatePct: matches.length > 0 ? Math.round((matchesWithOutput / matches.length) * 100) : 0,
  };
}

describe('StatsDor Editorial Features', () => {
  describe('Race Headline Generator', () => {
    it('generates pull clear headline when lead is 3 or more', () => {
      const headline = generateRaceHeadline('Raphinha', 18, 'Kylian Mbappé', 15);
      expect(headline).toBe('Raphinha pulls 3 clear in the race for the top spot');
    });

    it('generates one clear headline when lead is 1', () => {
      const headline = generateRaceHeadline('Raphinha', 18, 'Lamine Yamal', 17);
      expect(headline).toBe('Raphinha edges one clear at the summit');
    });

    it('generates shared lead headline when players are tied', () => {
      const headline = generateRaceHeadline('Raphinha', 17, 'Lamine Yamal', 17);
      expect(headline).toBe('Raphinha and Lamine Yamal share the lead on 17 contributions');
    });
  });

  describe('End Label Collision Avoidance', () => {
    it('separates labels when players are tied at identical Y coordinates', () => {
      const tiedPositions = [150, 150, 150]; // 3 players tied on same score
      const resolved = resolveLabelCollisions(tiedPositions, 20);

      // Verify each consecutive pair is at least minGap (20px) apart
      const sorted = [...resolved].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(19.9);
      }
    });

    it('preserves spacing when labels are already well-separated', () => {
      const distinctPositions = [50, 120, 200, 310];
      const resolved = resolveLabelCollisions(distinctPositions, 20);
      expect(resolved).toEqual(distinctPositions);
    });
  });

  describe('Form Strip Streaks', () => {
    it('computes scoring streaks and contribution rates correctly', () => {
      // Sample player log matching Raphinha:
      // Match 1: 2G, 1A
      // Match 2: 1G, 0A
      // Match 3: 2G, 0A
      // Match 4: 1G, 0A
      // Match 5: 0G, 2A
      // Match 6: 3G, 0A
      // Match 7: 3G, 0A
      // Match 8: 0G, 0A
      // Match 9: 1G, 0A
      // Match 10: 2G, 0A
      const matchLog = [
        { goals: 2, assists: 1 },
        { goals: 1, assists: 0 },
        { goals: 2, assists: 0 },
        { goals: 1, assists: 0 },
        { goals: 0, assists: 2 },
        { goals: 3, assists: 0 },
        { goals: 3, assists: 0 },
        { goals: 0, assists: 0 },
        { goals: 1, assists: 0 },
        { goals: 2, assists: 0 },
      ];

      const stats = computeStreaks(matchLog);
      expect(stats.maxScoringStreak).toBe(4); // matches 1-4
      expect(stats.maxContributionStreak).toBe(7); // matches 1-7
      expect(stats.matchesWithOutput).toBe(9); // 9 of 10 matches
      expect(stats.strikeRatePct).toBe(90);
    });
  });
});
