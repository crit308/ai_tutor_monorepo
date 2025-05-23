export interface RedisClient {
  connect(): Promise<void>;
  getBuffer(key: string): Promise<Buffer | null>;
  quit(): Promise<void>;
}

export interface RedisClientOptions {
  url?: string;
  [key: string]: any;
}

export function createClient(_opts: RedisClientOptions = {}): RedisClient {
  return {
    async connect() {},
    async getBuffer(_key: string) {
      return null;
    },
    async quit() {},
  };
}
