import { describe, expect, it } from 'vitest';
import { admitByPriority, remainingBudget, reserveAmount } from './budget.js';

describe('remainingBudget', () => {
  it('never goes negative', () => {
    expect(remainingBudget(100, 150)).toBe(0);
    expect(remainingBudget(100, 40)).toBe(60);
  });
});

describe('reserveAmount', () => {
  it('is a percentage of the allowance', () => {
    expect(reserveAmount(1000, 20)).toBe(200);
  });
});

describe('admitByPriority (doc 03 §8)', () => {
  const allowance = 1000;
  const reservePct = 20; // reserve = 200

  it('priority 0 (SellingAtLoss) is admitted whenever any budget remains, even inside the reserve', () => {
    expect(admitByPriority(0, 150, reservePct, allowance)).toBe(true);
    expect(admitByPriority(0, 1, reservePct, allowance)).toBe(true);
  });

  it('priority 1 is refused once the budget is fully exhausted, unlike priority 0', () => {
    expect(admitByPriority(0, 0, reservePct, allowance)).toBe(true);
    expect(admitByPriority(1, 0, reservePct, allowance)).toBe(false);
  });

  it('priorities 2-4 require remaining budget above the reserve', () => {
    expect(admitByPriority(2, 250, reservePct, allowance)).toBe(true);
    expect(admitByPriority(2, 200, reservePct, allowance)).toBe(false); // at, not above, the reserve
    expect(admitByPriority(3, 150, reservePct, allowance)).toBe(false);
    expect(admitByPriority(4, 150, reservePct, allowance)).toBe(false);
  });

  it('a fully exhausted budget admits priority 0 only (doc 12 Phase 5.6 DoD, literal)', () => {
    const remaining = 0;
    expect(admitByPriority(0, remaining, reservePct, allowance)).toBe(true);
    expect(admitByPriority(1, remaining, reservePct, allowance)).toBe(false);
    expect(admitByPriority(2, remaining, reservePct, allowance)).toBe(false);
    expect(admitByPriority(3, remaining, reservePct, allowance)).toBe(false);
    expect(admitByPriority(4, remaining, reservePct, allowance)).toBe(false);
  });
});
