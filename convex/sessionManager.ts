export interface SessionContext {
  [key: string]: any;
}

export class SessionManager {
  constructor(private baseUrl: string, private adminKey: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.adminKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createSession(userId: string, folderId?: string, context: SessionContext = {}): Promise<string> {
    const payload = { userId, context, folderId: folderId ?? null };
    const res = await fetch(`${this.baseUrl}/createSession`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }
    const data = await res.json();
    return data.id as string;
  }

  async getSessionContext(sessionId: string, userId: string): Promise<SessionContext | null> {
    const params = new URLSearchParams({ sessionId, userId });
    const res = await fetch(`${this.baseUrl}/getSessionContext?${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.adminKey}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to fetch context: ${res.status}`);
    }
    const data = await res.json();
    return (data.context as SessionContext) ?? null;
  }

  async updateSessionContext(sessionId: string, userId: string, context: SessionContext): Promise<boolean> {
    const payload = { sessionId, userId, context };
    const res = await fetch(`${this.baseUrl}/updateSessionContext`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to update context: ${res.status}`);
    }
    return res.status === 200;
  }
}
