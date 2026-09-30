import { afterEach, describe, expect, it } from 'bun:test';
import { createApp } from '@/app';
import { markDraining, resetLifecycleForTests } from '@/shared/lifecycle/state';

describe('/health/ready lifecycle', () => {
  afterEach(() => {
    resetLifecycleForTests();
  });

  it('returns 503 without touching dependencies after drain starts', async () => {
    markDraining();

    const response = await createApp().request('/health/ready');

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error.code).toBe('SERVICE_DRAINING');
  });
});
