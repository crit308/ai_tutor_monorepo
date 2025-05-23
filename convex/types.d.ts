declare module 'redis' {
  export function createClient(options?: any): {
    connect(): Promise<void>;
    getBuffer(key: string): Promise<Buffer | null>;
    quit(): Promise<void>;
  };
}


declare module 'ws' {
  export type RawData = Buffer | ArrayBuffer | Buffer[];
  export class WebSocket {
    static readonly OPEN: number;
    readyState: number;
    send(data: RawData, opts?: any): void;
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): void;
    on(event: 'close', listener: () => void): void;
  }
  export class WebSocketServer {
    constructor(options: any);
    handleUpgrade(
      req: import('http').IncomingMessage,
      socket: any,
      head: Buffer,
      cb: (ws: WebSocket) => void
    ): void;
  }
}
