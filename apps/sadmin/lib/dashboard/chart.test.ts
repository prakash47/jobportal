import { describe, expect, it } from 'vitest';
import {
  allZero,
  barLayout,
  linePoints,
  niceMax,
  toAreaPath,
  toPath,
} from './chart';

describe('niceMax', () => {
  it('never returns 0, so scaling can never divide by zero', () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0, 0])).toBe(1);
  });

  it('rounds up to a 1/2/5 step', () => {
    expect(niceMax([3])).toBe(5);
    expect(niceMax([7])).toBe(10);
    expect(niceMax([12])).toBe(20);
    expect(niceMax([23])).toBe(50);
    expect(niceMax([120])).toBe(200);
  });

  it('returns the peak unchanged when it is already round', () => {
    expect(niceMax([5])).toBe(5);
    expect(niceMax([100])).toBe(100);
  });

  it('ignores non-finite values rather than propagating NaN', () => {
    expect(niceMax([1, Number.NaN, 3])).toBe(5);
    expect(niceMax([Number.POSITIVE_INFINITY])).toBe(1);
  });
});

describe('allZero', () => {
  it('detects a series with no signal', () => {
    expect(allZero([0, 0, 0])).toBe(true);
    expect(allZero([])).toBe(true);
  });

  it('is false as soon as anything is plotted', () => {
    expect(allZero([0, 0, 1])).toBe(false);
  });
});

describe('barLayout', () => {
  it('returns one bar per value', () => {
    expect(barLayout([1, 2, 3], 300, 100)).toHaveLength(3);
  });

  it('scales the tallest bar to the axis ceiling, not the box', () => {
    // peak 3 -> niceMax 5, so the tallest bar is 3/5 of the height.
    const [, , third] = barLayout([1, 2, 3], 300, 100);
    expect(third!.height).toBeCloseTo(60, 5);
  });

  it('gives a zero value zero height', () => {
    const [first] = barLayout([0, 5], 200, 100);
    expect(first!.height).toBe(0);
  });

  // A single application on a 30-day axis must not round away to nothing.
  it('gives any non-zero value at least 1px', () => {
    const bars = barLayout([1, 500], 300, 100);
    expect(bars[0]!.height).toBeGreaterThanOrEqual(1);
  });

  it('never produces a zero or negative bar width on a long dense series', () => {
    for (const w of [120, 200, 320, 640]) {
      for (const bar of barLayout(new Array(30).fill(1), w, 60)) {
        expect(bar.width).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every bar inside the box', () => {
    const width = 300;
    const height = 100;
    for (const bar of barLayout([0, 1, 7, 3, 9], width, height)) {
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(width + 0.001);
      expect(bar.y).toBeGreaterThanOrEqual(0);
      expect(bar.y + bar.height).toBeCloseTo(height, 5);
    }
  });

  it('returns nothing for degenerate inputs instead of throwing', () => {
    expect(barLayout([], 100, 100)).toEqual([]);
    expect(barLayout([1, 2], 0, 100)).toEqual([]);
    expect(barLayout([1, 2], 100, 0)).toEqual([]);
  });
});

describe('linePoints', () => {
  it('spreads points evenly from edge to edge', () => {
    const pts = linePoints([0, 0, 0], 100, 50, 10);
    expect(pts.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it('puts the maximum at the top and zero on the baseline', () => {
    const [zero, peak] = linePoints([0, 10], 100, 50, 10);
    expect(zero!.y).toBe(50);
    expect(peak!.y).toBe(0);
  });

  // n === 1 would divide by (n-1) === 0.
  it('handles a single point without producing NaN', () => {
    const [only] = linePoints([5], 100, 50, 10);
    expect(only!.x).toBe(0);
    expect(Number.isNaN(only!.y)).toBe(false);
  });

  it('treats a zero max as 1 rather than dividing by zero', () => {
    for (const p of linePoints([0, 0], 100, 50, 0)) {
      expect(Number.isNaN(p.y)).toBe(false);
    }
  });

  it('clamps a value above max to the top edge', () => {
    const [p] = linePoints([999], 100, 50, 10);
    expect(p!.y).toBe(0);
  });
});

describe('toPath / toAreaPath', () => {
  it('emits an SVG path starting with a moveto', () => {
    expect(toPath([{ x: 0, y: 10 }, { x: 5, y: 0 }])).toBe('M0,10 L5,0');
  });

  // An empty `d` attribute is invalid; callers render nothing instead.
  it('returns an empty string for an empty series', () => {
    expect(toPath([])).toBe('');
    expect(toAreaPath([], 50)).toBe('');
  });

  it('closes an area back down to the baseline', () => {
    const d = toAreaPath([{ x: 0, y: 10 }, { x: 10, y: 0 }], 50);
    expect(d).toBe('M0,10 L10,0 L10,50 L0,50 Z');
  });

  it('rounds coordinates so the emitted markup stays small', () => {
    expect(toPath([{ x: 1.23456, y: 7.89123 }])).toBe('M1.23,7.89');
  });
});
