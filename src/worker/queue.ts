import type { RedisClient } from 'bun';
import { config } from '@/config';
import { redisKey } from '@/shared/redis/key';
import { parseJobEnvelope, type JobEnvelope } from './job';

export interface RedisStreamMessage {
  id: string;
  raw: string;
}

export interface DeadLetterEntry {
  id: string;
  originalStreamId: string | null;
  failedAt: string | null;
  reason: string | null;
  rawPayload: string | null;
  jobId: string | null;
  jobType: string | null;
  attempt: number | null;
}

export interface DeadLetterReplayResult {
  streamId: string;
  job: JobEnvelope;
}

export interface RedisStreamQueueOptions {
  streamKey?: string;
  deadLetterKey?: string;
  groupName?: string;
}

export interface RedisQueueNames {
  streamKey: string;
  deadLetterKey: string;
  groupName: string;
}

export function buildRedisQueueNames(
  namespace: string,
  queueName: string
): RedisQueueNames {
  return {
    streamKey: redisKey(namespace, 'queue', queueName, 'stream'),
    deadLetterKey: redisKey(namespace, 'queue', queueName, 'dead'),
    groupName: redisKey(namespace, 'queue', queueName, 'workers'),
  };
}

const MAX_DLQ_LIST = 100;
const MAX_DLQ_PURGE_BATCH = 1000;

const REPLAY_DLQ_SCRIPT = `
local entry = redis.call('XRANGE', KEYS[2], ARGV[1], ARGV[1], 'COUNT', 1)
if #entry == 0 then
  return {false, 0}
end

local stream_id = redis.call(
  'XADD',
  KEYS[1],
  '*',
  'job',
  ARGV[2],
  'replayed_from_dlq',
  ARGV[1],
  'replayed_at',
  ARGV[3]
)

redis.call('XDEL', KEYS[2], ARGV[1])
return {stream_id, 1}
`;

export class RedisStreamQueue {
  readonly streamKey: string;
  readonly deadLetterKey: string;
  readonly groupName: string;

  constructor(
    private readonly redis: RedisClient,
    options: RedisStreamQueueOptions = {}
  ) {
    const defaults = buildRedisQueueNames(
      config.REDIS_NAMESPACE,
      config.WORKER_QUEUE_NAME
    );
    this.streamKey = options.streamKey ?? defaults.streamKey;
    this.deadLetterKey = options.deadLetterKey ?? defaults.deadLetterKey;
    this.groupName = options.groupName ?? defaults.groupName;
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.send('XGROUP', ['CREATE', this.streamKey, this.groupName, '0', 'MKSTREAM']);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) throw error;
    }
  }

  async enqueue(job: JobEnvelope): Promise<string> {
    const id = await this.redis.send('XADD', [this.streamKey, '*', 'job', JSON.stringify(job)]);

    return String(id);
  }

  async read(consumerName: string, blockMs: number): Promise<RedisStreamMessage | null> {
    const response = await this.redis.send('XREADGROUP', [
      'GROUP',
      this.groupName,
      consumerName,
      'COUNT',
      '1',
      'BLOCK',
      String(blockMs),
      'STREAMS',
      this.streamKey,
      '>',
    ]);

    return extractMessages(response)[0] ?? null;
  }

  async claimStale(
    consumerName: string,
    minIdleMs: number,
    count = 10
  ): Promise<RedisStreamMessage[]> {
    const response = await this.redis.send('XAUTOCLAIM', [
      this.streamKey,
      this.groupName,
      consumerName,
      String(minIdleMs),
      '0-0',
      'COUNT',
      String(count),
    ]);

    if (!Array.isArray(response) || response.length < 2) return [];
    return parseMessageList(response[1]);
  }

  async ack(messageId: string): Promise<void> {
    await this.redis.send('XACK', [this.streamKey, this.groupName, messageId]);

    // XACK is the delivery boundary. XDEL is only stream housekeeping and must
    // never turn an already-successful job into a retry if cleanup fails.
    try {
      await this.redis.send('XDEL', [this.streamKey, messageId]);
    } catch {
      // Acknowledged entries can be cleaned by normal Redis maintenance later.
    }
  }

  async retry(message: RedisStreamMessage, job: JobEnvelope): Promise<void> {
    await this.enqueue(job);
    await this.ack(message.id);
  }

  async deadLetter(message: RedisStreamMessage, reason: string): Promise<void> {
    const args = [
      this.deadLetterKey,
      '*',
      'original_stream_id',
      message.id,
      'failed_at',
      new Date().toISOString(),
      'reason',
      reason,
      'payload',
      message.raw,
    ];

    try {
      const job = parseJobEnvelope(message.raw);
      args.push(
        'job_id',
        job.job_id,
        'job_type',
        job.job_type,
        'attempt',
        String(job.attempt)
      );
    } catch {
      // Malformed jobs still belong in DLQ; metadata is optional for those rows.
    }

    await this.redis.send('XADD', args);
    await this.ack(message.id);
  }

  async countDeadLetters(): Promise<number> {
    return Number(await this.redis.send('XLEN', [this.deadLetterKey]));
  }

  async listDeadLetters(limit = 20): Promise<DeadLetterEntry[]> {
    const boundedLimit = normalizeCount(limit, 20, MAX_DLQ_LIST);
    const response = await this.redis.send('XREVRANGE', [
      this.deadLetterKey,
      '+',
      '-',
      'COUNT',
      String(boundedLimit),
    ]);

    return parseDeadLetterEntries(response);
  }

  async getDeadLetter(id: string): Promise<DeadLetterEntry | null> {
    assertRedisStreamId(id);

    const response = await this.redis.send('XRANGE', [
      this.deadLetterKey,
      id,
      id,
      'COUNT',
      '1',
    ]);

    return parseDeadLetterEntries(response)[0] ?? null;
  }

  async replayDeadLetter(id: string): Promise<DeadLetterReplayResult | null> {
    const entry = await this.getDeadLetter(id);
    if (!entry) return null;
    if (!entry.rawPayload) {
      throw new Error(`Dead-letter entry ${id} has no payload`);
    }

    const originalJob = parseJobEnvelope(entry.rawPayload);
    const replayedJob: JobEnvelope = {
      ...originalJob,
      attempt: 1,
    };

    const response = await this.redis.send('EVAL', [
      REPLAY_DLQ_SCRIPT,
      '2',
      this.streamKey,
      this.deadLetterKey,
      id,
      JSON.stringify(replayedJob),
      new Date().toISOString(),
    ]);

    if (!Array.isArray(response) || !response[0]) {
      return null;
    }

    return {
      streamId: String(response[0]),
      job: replayedJob,
    };
  }

  async purgeDeadLettersBefore(cutoff: Date, limit = 100): Promise<number> {
    if (Number.isNaN(cutoff.getTime())) {
      throw new Error('DLQ purge cutoff must be a valid date');
    }

    const boundedLimit = normalizeCount(limit, 100, MAX_DLQ_PURGE_BATCH);
    const cutoffStreamId = `${cutoff.getTime()}-18446744073709551615`;
    const response = await this.redis.send('XRANGE', [
      this.deadLetterKey,
      '-',
      cutoffStreamId,
      'COUNT',
      String(boundedLimit),
    ]);

    const ids = parseDeadLetterEntries(response).map((entry) => entry.id);
    if (ids.length === 0) return 0;

    return Number(await this.redis.send('XDEL', [this.deadLetterKey, ...ids]));
  }
}

export function assertRedisStreamId(id: string): void {
  if (!/^\d+-\d+$/.test(id)) {
    throw new Error(`Invalid Redis stream ID: ${id}`);
  }
}

function normalizeCount(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function extractMessages(response: unknown): RedisStreamMessage[] {
  if (response == null) return [];

  if (response instanceof Map) {
    const messages: RedisStreamMessage[] = [];
    for (const value of response.values()) {
      messages.push(...parseMessageList(value));
    }
    return messages;
  }

  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const messages: RedisStreamMessage[] = [];
    for (const value of Object.values(response as Record<string, unknown>)) {
      messages.push(...parseMessageList(value));
    }
    return messages;
  }

  if (!Array.isArray(response)) return [];

  const messages: RedisStreamMessage[] = [];
  for (const streamEntry of response) {
    if (Array.isArray(streamEntry) && streamEntry.length >= 2) {
      messages.push(...parseMessageList(streamEntry[1]));
    }
  }
  return messages;
}

function parseMessageList(value: unknown): RedisStreamMessage[] {
  if (!Array.isArray(value)) return [];

  const messages: RedisStreamMessage[] = [];

  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;

    const id = String(entry[0]);
    const raw = getFieldValue(entry[1], 'job');
    if (raw !== undefined) {
      messages.push({ id, raw });
    }
  }

  return messages;
}

function parseDeadLetterEntries(value: unknown): DeadLetterEntry[] {
  const rawEntries = normalizeStreamEntries(value);

  return rawEntries.map(({ id, fields }) => {
    const attemptRaw = getFieldValue(fields, 'attempt');
    const attempt = attemptRaw === undefined ? null : Number(attemptRaw);

    return {
      id,
      originalStreamId: getFieldValue(fields, 'original_stream_id') ?? null,
      failedAt: getFieldValue(fields, 'failed_at') ?? null,
      reason: getFieldValue(fields, 'reason') ?? null,
      rawPayload: getFieldValue(fields, 'payload') ?? null,
      jobId: getFieldValue(fields, 'job_id') ?? null,
      jobType: getFieldValue(fields, 'job_type') ?? null,
      attempt: attempt !== null && Number.isInteger(attempt) ? attempt : null,
    };
  });
}

function normalizeStreamEntries(value: unknown): Array<{ id: string; fields: unknown }> {
  if (Array.isArray(value)) {
    const entries: Array<{ id: string; fields: unknown }> = [];

    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      entries.push({ id: String(entry[0]), fields: entry[1] });
    }

    return entries;
  }

  if (value instanceof Map) {
    return [...value.entries()].map(([id, fields]) => ({
      id: String(id),
      fields,
    }));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([id, fields]) => ({
      id,
      fields,
    }));
  }

  return [];
}

function getFieldValue(fields: unknown, key: string): string | undefined {
  if (fields instanceof Map) {
    const value = fields.get(key);
    return value === undefined ? undefined : String(value);
  }

  if (Array.isArray(fields)) {
    for (let index = 0; index < fields.length - 1; index += 2) {
      if (String(fields[index]) === key) {
        return String(fields[index + 1]);
      }
    }
    return undefined;
  }

  if (fields && typeof fields === 'object') {
    const record = fields as Record<string, unknown>;
    return record[key] === undefined ? undefined : String(record[key]);
  }

  return undefined;
}
