import { env } from "@/lib/env";
import type { ProviderAdapter, ProviderRequest } from "./types";
import { readEventStream } from "./sse";

export const xaiProvider: ProviderAdapter = {
  async *stream({ model, prompt, system, history = [], signal }: ProviderRequest) {
    const messages = [...(system ? [{ role: "system", content: system }] : []), ...history, { role: "user", content: prompt }];
    const response = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", signal, headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: model.apiModel, stream: true, max_tokens: 2048, messages }) });
    if (!response.ok) throw new Error(`xAI request failed (${response.status}).`);
    for await (const data of readEventStream(response)) {
      try { const chunk = JSON.parse(data); const text = chunk.choices?.[0]?.delta?.content; if (typeof text === "string") yield text; }
      catch { /* Ignore provider metadata frames. */ }
    }
  },
  async generate(request) {
    const started = Date.now(); let content = "";
    try { for await (const part of this.stream(request)) content += part; return { provider: "xAI", model: request.model.name, content, latencyMs: Date.now() - started, status: "complete" }; }
    catch (error) { return { provider: "xAI", model: request.model.name, content, latencyMs: Date.now() - started, status: "error", error: error instanceof Error ? error.message : "Provider request failed." }; }
  },
};
