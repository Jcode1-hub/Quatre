import { env } from "@/lib/env";
import type { ProviderAdapter, ProviderRequest } from "./types";
import { readEventStream } from "./sse";

export const openAIProvider: ProviderAdapter = {
  async *stream({ model, prompt, system, history = [], signal, think = false }: ProviderRequest) {
    const input = [...history, { role: "user", content: prompt }];
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: model.apiModel, stream: true, max_output_tokens: 2048, instructions: system, input, ...(think && model.supportsReasoning ? { reasoning: { effort: "high" } } : {}) }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    for await (const data of readEventStream(response)) {
      try { const chunk = JSON.parse(data); const text = chunk.type === "response.output_text.delta" ? chunk.delta : chunk.choices?.[0]?.delta?.content; if (typeof text === "string") yield text; }
      catch { /* Ignore provider metadata frames. */ }
    }
  },
  async generate(request) {
    const started = Date.now(); let content = "";
    try { for await (const part of this.stream(request)) content += part; return { provider: "OpenAI", model: request.model.name, content, latencyMs: Date.now() - started, status: "complete" }; }
    catch (error) { return { provider: "OpenAI", model: request.model.name, content, latencyMs: Date.now() - started, status: "error", error: error instanceof Error ? error.message : "Provider request failed." }; }
  },
};
