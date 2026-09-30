import type { RedisClient } from 'bun';
import { config } from '@/config';
import type { JobEnvelope } from './job';

export interface RedisStreamMessage {
  id: string;
  raw: string;
}

export interface RedisStreamQueueOptions {
  streamKey?: string;
  deadLetterKey?: string;
  groupName?: string;
}

export class RedisStreamQueue {
  readonly streamKey: string;
  readonly deadLetterKey: string;
  readonly groupName: string;

  constructor(
    private readonly redis: RedisClient,
    options: RedisStreamQueueOptions = {}
  ) {
    const base = `${config.WORKER_QUEUE_PREFIX}:${config.SERVICE_NAME}:${config.WORKER_QUEUE_NAME}`;
    this.streamKey = options.streamKey ?? `${base}:stream`;
    this.deadLetterKey = options.deadLetterKey ?? `${base}:dead`;
    this.groupName = options.groupName ?? `${config.SERVICE_NAME}:workers`;
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.send('XGROUP', [
        'CREATE',
        this.streamKey,
        this.groupName,
        '0',
        'MKSTREAM',
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) throw error;
    }
  }

  async enqueue(job: JobEnvelope): Promise<string> {
    const id = await this.redis.send('XADD', [
      this.streamKey,
      '*',
      'job',
      JSON.stringify(job),
    ]);

    return String(id);
  }

  async read(
    consumerName: string,
    blockMs: number
  ): Promise<RedisStreamMessage | null> {
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

  async retry(
    message: RedisStreamMessage,
    job: JobEnvelope
  ): Promise<void> {
    await this.enqueue(job);
    await this.ack(message.id);
  }

  async deadLetter(
    message: RedisStreamMessage,
    reason: string
  ): Promise<void> {
    await this.redis.send('XADD', [
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
    ]);

    await this.ack(message.id);
  }
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
