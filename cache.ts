import { Mutex } from "async-mutex";

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { expires: number; value: string }>();
  private mutex = new Mutex();

  constructor(private ttlSeconds: number) {}

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      await this.deleteKey(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.store.set(key, {
        expires: Date.now() + this.ttlSeconds * 1000,
        value,
      });
    } finally {
      release();
    }
  }

  private async deleteKey(key: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.store.delete(key);
    } finally {
      release();
    }
  }
}
