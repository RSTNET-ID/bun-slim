import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFileBackedSecrets } from '@/config/env';

function withSecretFile(value: string, run: (path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'bun-slim-secret-'));
  const path = join(directory, 'secret');

  try {
    writeFileSync(path, value, { mode: 0o600 });
    run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('file-backed runtime secrets', () => {
  it('loads supported secrets from files and trims the trailing newline', () => {
    withSecretFile('postgres://app:strong-secret@db.internal:5432/service\n', (path) => {
      const resolved = resolveFileBackedSecrets({
        DATABASE_URL_FILE: path,
      });

      expect(resolved.DATABASE_URL).toBe(
        'postgres://app:strong-secret@db.internal:5432/service'
      );
    });
  });

  it('rejects ambiguous direct and file-backed values', () => {
    withSecretFile('from-file', (path) => {
      expect(() =>
        resolveFileBackedSecrets({
          METRICS_TOKEN: 'direct-secret-token-value-123456',
          METRICS_TOKEN_FILE: path,
        })
      ).toThrow('METRICS_TOKEN and METRICS_TOKEN_FILE cannot both be set');
    });
  });

  it('rejects empty secret files', () => {
    withSecretFile('\n', (path) => {
      expect(() =>
        resolveFileBackedSecrets({
          REDIS_URL_FILE: path,
        })
      ).toThrow('REDIS_URL_FILE points to an empty secret file');
    });
  });

  it('does not expose the secret file path in read errors', () => {
    const missingPath = '/definitely-not-present/bun-slim-secret';

    expect(() =>
      resolveFileBackedSecrets({
        DATABASE_URL_FILE: missingPath,
      })
    ).toThrow('Failed to read secret file for DATABASE_URL');
  });
});
