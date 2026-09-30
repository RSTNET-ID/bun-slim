import { describe, expect, it } from 'bun:test';
import { createApp } from '@/app';

describe('security headers middleware', () => {
  it('adds the API security baseline', async () => {
    const response = await createApp().request('/health');

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });
});
