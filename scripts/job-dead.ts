#!/usr/bin/env bun
import { config } from '../src/config';
import { parseDurationMs, summarizeDeadLetter } from '../src/worker/dead-letter';
import { parseJobEnvelope } from '../src/worker/job';
import { jobHandlers } from '../src/worker/registry';
import { RedisStreamQueue } from '../src/worker/queue';
import { closeRedisClient, connectRedisClient } from '../src/worker/client';

interface ParsedArgs {
  positionals: string[];
  options: Map<string, string | true>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--') continue;

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');

    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1);
      options.set(key, value || true);
      continue;
    }

    const next = args[index + 1];
    if (next && next !== '--' && !next.startsWith('--')) {
      options.set(withoutPrefix, next);
      index += 1;
    } else {
      options.set(withoutPrefix, true);
    }
  }

  return { positionals, options };
}

function getOption(args: ParsedArgs, name: string): string | undefined {
  const value = args.options.get(name);
  return typeof value === 'string' ? value : undefined;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  const value = args.options.get(name);
  if (value === true) return true;
  if (typeof value !== 'string') return false;

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string
): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

function requirePosition(args: ParsedArgs, index: number, label: string): string {
  const value = args.positionals[index];
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function assertReplayAllowed(force: boolean): void {
  if (config.APP_ENV === 'production' && !force) {
    throw new Error('Production DLQ replay requires --force');
  }
}

function usage(): never {
  console.error(`Usage:
  bun run job:dead:list -- --limit=20
  bun run job:dead:show -- <stream-id> [--payload]
  bun run job:dead:replay -- <stream-id> [--force]
  bun run job:dead:purge -- --older-than=30d [--limit=100] --force

Notes:
  - list/show never mutate Redis.
  - show hides payload unless --payload is explicitly provided.
  - replay preserves job_id and resets attempt to 1.
  - replay requires a currently registered handler for job_type.
  - purge is bounded and always requires --force.
  - production replay also requires --force.
`);
  process.exit(1);
}

const [command, ...rawArgs] = process.argv.slice(2);
if (!command) usage();

const args = parseArgs(rawArgs);
const redis = await connectRedisClient();
const queue = new RedisStreamQueue(redis);

try {
  switch (command) {
    case 'list': {
      const limit = parseBoundedInteger(getOption(args, 'limit'), 20, 1, 100, '--limit');
      const [total, entries] = await Promise.all([
        queue.countDeadLetters(),
        queue.listDeadLetters(limit),
      ]);

      console.log(
        JSON.stringify(
          {
            dead_letter_key: queue.deadLetterKey,
            total,
            showing: entries.length,
            entries: entries.map(summarizeDeadLetter),
          },
          null,
          2
        )
      );
      break;
    }

    case 'show': {
      const id = requirePosition(args, 0, 'dead-letter stream ID');
      const entry = await queue.getDeadLetter(id);

      if (!entry) {
        console.error(`Dead-letter entry not found: ${id}`);
        process.exitCode = 2;
        break;
      }

      const output: Record<string, unknown> = {
        ...summarizeDeadLetter(entry),
      };

      if (hasFlag(args, 'payload')) {
        if (!entry.rawPayload) {
          output.payload = null;
        } else {
          try {
            output.payload = parseJobEnvelope(entry.rawPayload);
          } catch {
            output.payload = entry.rawPayload;
          }
        }
      } else {
        output.payload = '<hidden; use --payload to display>';
      }

      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case 'replay': {
      const id = requirePosition(args, 0, 'dead-letter stream ID');
      const force = hasFlag(args, 'force');
      assertReplayAllowed(force);

      const entry = await queue.getDeadLetter(id);
      if (!entry) {
        console.error(`Dead-letter entry not found: ${id}`);
        process.exitCode = 2;
        break;
      }

      if (!entry.rawPayload) {
        throw new Error(`Dead-letter entry ${id} has no payload`);
      }

      const job = parseJobEnvelope(entry.rawPayload);
      if (!jobHandlers[job.job_type]) {
        throw new Error(
          `Cannot replay job_type "${job.job_type}" because no handler is currently registered`
        );
      }

      const result = await queue.replayDeadLetter(id);
      if (!result) {
        throw new Error(
          `Dead-letter entry ${id} disappeared before replay; another operator may have handled it`
        );
      }

      console.log(
        JSON.stringify(
          {
            replayed_from_dlq: id,
            new_stream_id: result.streamId,
            job_id: result.job.job_id,
            job_type: result.job.job_type,
            attempt: result.job.attempt,
          },
          null,
          2
        )
      );
      break;
    }

    case 'purge': {
      if (!hasFlag(args, 'force')) {
        throw new Error('DLQ purge is destructive and always requires --force');
      }

      const olderThan = getOption(args, 'older-than');
      if (!olderThan) {
        throw new Error('DLQ purge requires --older-than (example: --older-than=30d)');
      }

      const limit = parseBoundedInteger(getOption(args, 'limit'), 100, 1, 1000, '--limit');
      const cutoff = new Date(Date.now() - parseDurationMs(olderThan));
      const deleted = await queue.purgeDeadLettersBefore(cutoff, limit);

      console.log(
        JSON.stringify(
          {
            dead_letter_key: queue.deadLetterKey,
            older_than: olderThan,
            cutoff: cutoff.toISOString(),
            batch_limit: limit,
            deleted,
          },
          null,
          2
        )
      );
      break;
    }

    default:
      usage();
  }
} finally {
  closeRedisClient();
}
