import { describe, expect, it } from 'bun:test';
import {
  hasDoctorFailures,
  isSupportedBunVersion,
  parseDoctorArgs,
  type DoctorCheck,
} from '../../../scripts/doctor';

describe('runtime doctor helpers', () => {
  it('parses supported CLI flags', () => {
    expect(parseDoctorArgs(['--offline', '--json'])).toEqual({
      offline: true,
      json: true,
      help: false,
    });
  });

  it('rejects unknown CLI flags', () => {
    expect(() => parseDoctorArgs(['--surprise'])).toThrow('Unknown option');
  });

  it('accepts only the reviewed Bun 1.4.x line from patch 1.4.2', () => {
    expect(isSupportedBunVersion('1.4.2')).toBe(true);
    expect(isSupportedBunVersion('1.4.9')).toBe(true);
    expect(isSupportedBunVersion('1.4.1')).toBe(false);
    expect(isSupportedBunVersion('1.5.0')).toBe(false);
    expect(isSupportedBunVersion('2.0.0')).toBe(false);
    expect(isSupportedBunVersion('1.4.2-canary.1')).toBe(false);
    expect(isSupportedBunVersion('not-a-version')).toBe(false);
  });

  it('fails only when a doctor check has fail status', () => {
    const checks: DoctorCheck[] = [
      { name: 'environment', status: 'pass', detail: 'ok' },
      { name: 'redis', status: 'skip', detail: 'not configured' },
    ];

    expect(hasDoctorFailures(checks)).toBe(false);
    expect(
      hasDoctorFailures([
        ...checks,
        { name: 'database', status: 'fail', detail: 'unreachable' },
      ])
    ).toBe(true);
  });
});
