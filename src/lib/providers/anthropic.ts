import { env } from "@/lib/env";
import type { ProviderAdapter, ProviderRequest } from "./types";
import { readEventStream } from "./sse";

export const anthropicProvider: ProviderAdapter = {
  async *stream({ model, prompt, system, history = [], signal }: ProviderRequest) {
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: model.apiModel, max_tokens: 2048, stream: true, system, messages: [...history, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
    for await (const data of readEventStream(response)) {
      try { const event = JSON.parse(data); if (event.type === "content_block_delta" && typeof event.delta?.text === "string") yield event.delta.text; }
      catch { /* Ignore provider metadata frames. */ }
    }
  },
  async generate(request) {
    const started = Date.now(); let content = "";
    try { for await (const part of this.stream(request)) content += part; return { provider: "Anthropic", model: request.model.name, content, latencyMs: Date.now() - started, status: "complete" }; }
    catch (error) { return { provider: "Anthropic", model: request.model.name, content, latencyMs: Date.now() - started, status: "error", error: error instanceof Error ? error.message : "Provider request failed." }; }
  },
};
