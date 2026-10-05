import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATABASE_DIR = import.meta.dir;

async function listFiles(
  directory: string,
  predicate: (filename: string) => boolean
): Promise<string[]> {
  return (await readdir(directory)).filter(predicate).sort();
}

function moduleSpecifier(filename: string): string {
  return `./${filename.replace(/\.ts$/, '')}`;
}

export async function regenerateMigrationRegistry(): Promise<void> {
  const directory = join(DATABASE_DIR, 'migrations');
  const files = await listFiles(
    directory,
    (filename) =>
      filename.endsWith('.ts') &&
      filename !== 'registry.ts' &&
      !filename.startsWith('_')
  );

  const imports = files
    .map((filename, index) => `import * as migration${index} from '${moduleSpecifier(filename)}';`)
    .join('\n');

  const entries = files
    .map(
      (filename, index) =>
        `  { version: '${filename}', up: migration${index}.up, down: migration${index}.down },`
    )
    .join('\n');

  const content = `${imports}

export const migrations = [
${entries}
] as const;
`;

  await Bun.write(join(directory, 'registry.ts'), content);
}

export async function regenerateSeederRegistry(): Promise<void> {
  const directory = join(DATABASE_DIR, 'seeders');
  const files = await listFiles(
    directory,
    (filename) =>
      filename.endsWith('.seeder.ts') &&
      filename !== 'registry.ts' &&
      !filename.startsWith('_')
  );

  const imports = files
    .map((filename, index) => `import * as seeder${index} from '${moduleSpecifier(filename)}';`)
    .join('\n');

  const entries = files
    .map((filename, index) => `  { filename: '${filename}', run: seeder${index}.run },`)
    .join('\n');

  const content = `${imports}

export const seeders = [
${entries}
] as const;
`;

  await Bun.write(join(directory, 'registry.ts'), content);
}
