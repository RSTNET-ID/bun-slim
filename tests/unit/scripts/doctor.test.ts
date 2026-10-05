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

  it('accepts Bun 1.4 and later', () => {
    expect(isSupportedBunVersion('1.4.0')).toBe(true);
    expect(isSupportedBunVersion('1.5.2')).toBe(true);
    expect(isSupportedBunVersion('2.0.0')).toBe(true);
    expect(isSupportedBunVersion('1.3.9')).toBe(false);
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
