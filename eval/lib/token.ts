// Reads the Hugging Face token for the inference calls. The return value is a secret:
// it goes into an Authorization header and nowhere else. Never print or store it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface TokenSources {
  env?: Record<string, string | undefined>;
  /** The Hugging Face cache directory that holds the `token` file. */
  cacheDir?: string;
}

/** `HF_TOKEN` from the environment, else the file written by `hf auth login`. */
export function readHfToken({ env = process.env, cacheDir = defaultCacheDir(env) }: TokenSources = {}): string {
  const fromEnv = env['HF_TOKEN']?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = readFileSync(join(cacheDir, 'token'), 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    // Fall through to the message below.
  }
  throw new Error('No Hugging Face token found. Set HF_TOKEN, or run `hf auth login` to create ~/.cache/huggingface/token.');
}

function defaultCacheDir(env: Record<string, string | undefined>): string {
  return env['HF_HOME'] ?? join(env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'huggingface');
}
