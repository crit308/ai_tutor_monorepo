// Base Agent Framework
// Core infrastructure for AI agents in the Convex backend

import { AgentConfig, AgentContext, AgentResponse, RegisteredAgent, AgentRegistry } from "./types";
import { setOpenAIAPI, setDefaultOpenAIKey, setTracingExportApiKey } from "@openai/agents-openai";

// OpenAI Integration
class OpenAIClient {
  private apiKey: string;
  private baseURL: string = "https://api.openai.com/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable.");
    }
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: "json_object" };
    } = {}
  ): Promise<{ content: string; usage?: any }> {
    const {
      model = "gpt-4-turbo-preview",
      temperature = 0.7,
      max_tokens = 4000,
      response_format
    } = options;

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          ...(response_format && { response_format })
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response choices returned from OpenAI API");
      }

      return {
        content: data.choices[0].message.content,
        usage: data.usage
      };
    } catch (error) {
      console.error("OpenAI API call failed:", error);
      throw error;
    }
  }

  async completions(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
    } = {}
  ): Promise<{ content: string; usage?: any }> {
    const {
      model = "gpt-3.5-turbo-instruct",
      temperature = 0.7,
      max_tokens = 4000
    } = options;

    try {
      const response = await fetch(`${this.baseURL}/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          temperature,
          max_tokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response choices returned from OpenAI API");
      }

      return {
        content: data.choices[0].text,
        usage: data.usage
      };
    } catch (error) {
      console.error("OpenAI API call failed:", error);
      throw error;
    }
  }
}

// Base Agent Class
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected openai: OpenAIClient;

  constructor(config: AgentConfig, apiKey?: string) {
    this.config = config;
    this.openai = new OpenAIClient(apiKey);
  }

  abstract execute(context: AgentContext, input: any): Promise<AgentResponse>;

  protected async measureExecution<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; executionTime: number }> {
    const startTime = Date.now();
    try {
      const result = await operation();
      const executionTime = Date.now() - startTime;
      return { result, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      throw { error, executionTime };
    }
  }

  protected createResponse<T>(
    data: T,
    executionTime?: number,
    tokensUsed?: number
  ): AgentResponse<T> {
    return {
      success: true,
      data,
      execution_time: executionTime,
      tokens_used: tokensUsed
    };
  }

  protected createErrorResponse(
    error: string,
    executionTime?: number
  ): AgentResponse {
    return {
      success: false,
      error,
      execution_time: executionTime
    };
  }

  protected async callOpenAI(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: "json_object" };
    } = {}
  ): Promise<{ content: string; usage?: any }> {
    return await this.openai.chat(messages, {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
      ...options
    });
  }

  protected parseJSONResponse<T>(content: string): T {
    try {
      // Clean up potential markdown code blocks
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      // Find JSON object boundaries
      const start = cleanContent.indexOf("{");
      const end = cleanContent.lastIndexOf("}");
      
      if (start !== -1 && end !== -1 && end > start) {
        const jsonStr = cleanContent.substring(start, end + 1);
        return JSON.parse(jsonStr);
      }

      return JSON.parse(cleanContent);
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error}\nContent: ${content}`);
    }
  }

  protected validateRequiredFields<T extends Record<string, any>>(
    obj: T,
    requiredFields: (keyof T)[]
  ): void {
    const missingFields = requiredFields.filter(field => !(field in obj) || obj[field] === undefined);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
  }

  protected log(level: "info" | "warn" | "error", message: string, data?: any): void {
    const logMessage = `[${this.config.name}] ${message}`;
    switch (level) {
      case "info":
        console.log(logMessage, data || "");
        break;
      case "warn":
        console.warn(logMessage, data || "");
        break;
      case "error":
        console.error(logMessage, data || "");
        break;
    }
  }
}

// Agent Registry for managing agents
export class AgentManager {
  private static instance: AgentManager;
  private registry: AgentRegistry = {};

  private constructor() {}

  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  register(name: string, agent: RegisteredAgent): void {
    this.registry[name] = agent;
    console.log(`Agent registered: ${name}`);
  }

  getAgent(name: string): RegisteredAgent | undefined {
    return this.registry[name];
  }

  async executeAgent(
    name: string,
    context: AgentContext,
    input: any
  ): Promise<AgentResponse> {
    const agent = this.getAgent(name);
    if (!agent) {
      return {
        success: false,
        error: `Agent not found: ${name}`
      };
    }

    try {
      return await agent.handler(context, input);
    } catch (error) {
      console.error(`Agent execution failed: ${name}`, error);
      return {
        success: false,
        error: `Agent execution failed: ${error}`
      };
    }
  }

  listAgents(): string[] {
    return Object.keys(this.registry);
  }

  unregister(name: string): boolean {
    if (this.registry[name]) {
      delete this.registry[name];
      console.log(`Agent unregistered: ${name}`);
      return true;
    }
    return false;
  }
}

// Factory function for creating agent instances
export function createAgentConfig(
  name: string,
  model: string = "gpt-4-turbo-preview",
  options: Partial<AgentConfig> = {}
): AgentConfig {
  return {
    name,
    model,
    temperature: 0.7,
    max_tokens: 4000,
    tools: [],
    ...options
  };
}

// Utility functions for common operations
export class AgentUtils {
  static truncateText(text: string, maxBytes: number): string {
    if (text.length <= maxBytes) {
      return text;
    }

    // Truncate to the last N bytes
    const textBytes = new TextEncoder().encode(text);
    if (textBytes.length <= maxBytes) {
      return text;
    }

    const truncatedBytes = textBytes.slice(-maxBytes);
    const truncatedText = new TextDecoder().decode(truncatedBytes);
    
    return `... (Beginning truncated)\n\n${truncatedText}`;
  }

  static extractTextSection(text: string, sectionName: string): string | null {
    const regex = new RegExp(`${sectionName}:([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|$)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  static parseKeyValuePairs(text: string): Record<string, string> {
    const pairs: Record<string, string> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      const dashIndex = line.indexOf('–') !== -1 ? line.indexOf('–') : line.indexOf('-');
      
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key && value) {
          pairs[key] = value;
        }
      } else if (dashIndex !== -1) {
        const key = line.substring(0, dashIndex).trim();
        const value = line.substring(dashIndex + 1).trim();
        if (key && value) {
          pairs[key] = value;
        }
      }
    }
    
    return pairs;
  }

  static validateSessionContext(context: AgentContext): void {
    if (!context.session_id) {
      throw new Error("Session ID is required in agent context");
    }
    if (!context.user_id) {
      throw new Error("User ID is required in agent context");
    }
  }

  static createDefaultAgentResponse<T>(data: T): AgentResponse<T> {
    return {
      success: true,
      data,
      execution_time: 0,
      tokens_used: 0
    };
  }
}

// Export the singleton instance
export const agentManager = AgentManager.getInstance();

// Ensure the SDK knows our key for both model calls **and** trace export
const __oaKey = process.env.OPENAI_API_KEY;
if (__oaKey) {
  setDefaultOpenAIKey(__oaKey);
  setTracingExportApiKey(__oaKey);
}

// Make sure every OpenAIProvider instance across the backend uses the Responses API
setOpenAIAPI("responses"); 