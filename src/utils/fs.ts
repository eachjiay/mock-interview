import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureParentDir(filePath: string) {
  await ensureDir(path.dirname(filePath));
}
