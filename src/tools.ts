import type { JSONSchema, ToolSpec } from "./types.js";

export interface ToolDefinition<A = any, R = any> {
  name: string;
  description?: string;
  parameters?: JSONSchema;
  fn: (args: A) => R | Promise<R>;
}

export class ToolRegistry {
  private readonly _tools = new Map<string, ToolDefinition>();

  register<A, R>(def: ToolDefinition<A, R>): this {
    if (!def.name) throw new Error("tool requires a name");
    this._tools.set(def.name, def as ToolDefinition);
    return this;
  }

  has(name: string): boolean {
    return this._tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this._tools.get(name);
  }

  get size(): number {
    return this._tools.size;
  }

  specs(): ToolSpec[] {
    return [...this._tools.values()].map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.parameters ?? { type: "object", properties: {} },
      },
    }));
  }

  async dispatch(name: string, argumentsRaw: string | Record<string, unknown>): Promise<string> {
    const tool = this._tools.get(name);
    if (!tool) {
      return JSON.stringify({ error: `unknown tool: ${name}` });
    }
    let args: any;
    try {
      args =
        typeof argumentsRaw === "string"
          ? argumentsRaw.trim()
            ? JSON.parse(argumentsRaw)
            : {}
          : (argumentsRaw ?? {});
    } catch (err) {
      return JSON.stringify({
        error: `invalid tool arguments JSON: ${(err as Error).message}`,
      });
    }
    try {
      const result = await tool.fn(args);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({
        error: `${(err as Error).name}: ${(err as Error).message}`,
      });
    }
  }
}
