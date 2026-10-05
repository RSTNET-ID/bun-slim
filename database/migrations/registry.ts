import * as migration0 from './20240101000000_create_categories_and_examples';
import * as migration1 from './20260930161000_add_examples_status_id_index';

export const migrations = [
  { version: '20240101000000_create_categories_and_examples.ts', up: migration0.up, down: migration0.down },
  { version: '20260930161000_add_examples_status_id_index.ts', up: migration1.up, down: migration1.down },
] as const;
