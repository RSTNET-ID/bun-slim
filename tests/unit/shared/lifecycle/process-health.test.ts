import { describe, expect, it } from 'bun:test';
import { ProcessHealthState } from '@/shared/lifecycle/process-health';

describe('ProcessHealthState', () => {
  it('starts not ready', () => {
    const state = new ProcessHealthState();

    expect(state.isReady()).toBe(false);
    expect(state.isDraining()).toBe(false);
  });

  it('becomes ready after initialization', () => {
    const state = new ProcessHealthState();
    state.markReady();

    expect(state.isReady()).toBe(true);
  });

  it('becomes permanently unready when draining starts', () => {
    const state = new ProcessHealthState();
    state.markReady();
    state.markDraining();
    state.markReady();

    expect(state.isReady()).toBe(false);
    expect(state.isDraining()).toBe(true);
  });
});
