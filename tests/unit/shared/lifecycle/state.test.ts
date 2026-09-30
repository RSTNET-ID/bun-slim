import { beforeEach, describe, expect, it } from 'bun:test';
import {
  isAcceptingTraffic,
  markDraining,
  resetLifecycleForTests,
} from '@/shared/lifecycle/state';

describe('service lifecycle state', () => {
  beforeEach(() => {
    resetLifecycleForTests();
  });

  it('starts as accepting traffic', () => {
    expect(isAcceptingTraffic()).toBe(true);
  });

  it('switches to draining', () => {
    markDraining();
    expect(isAcceptingTraffic()).toBe(false);
  });
});
