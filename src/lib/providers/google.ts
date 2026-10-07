import { env } from "@/lib/env";
import type { ProviderAdapter, ProviderRequest } from "./types";
import { readEventStream } from "./sse";

export const googleProvider: ProviderAdapter = {
  async *stream({ model, prompt, system, history = [], signal, think = false }: ProviderRequest) {
    const contents = [...history, { role: "user" as const, content: prompt }].map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.apiModel}:streamGenerateContent?alt=sse`, { method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": env.GOOGLE_AI_API_KEY! }, body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { maxOutputTokens: 2048, ...(think && model.supportsReasoning ? { thinkingConfig: { thinkingLevel: "high" } } : {}) } }) });
    if (!response.ok) throw new Error(`Google AI request failed (${response.status}).`);
    for await (const data of readEventStream(response)) {
      try { const event = JSON.parse(data); const text = event.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join(""); if (text) yield text; }
      catch { /* Ignore provider metadata frames. */ }
    }
  },
  async generate(request) {
    const started = Date.now(); let content = "";
    try { for await (const part of this.stream(request)) content += part; return { provider: "Google", model: request.model.name, content, latencyMs: Date.now() - started, status: "complete" }; }
    catch (error) { return { provider: "Google", model: request.model.name, content, latencyMs: Date.now() - started, status: "error", error: error instanceof Error ? error.message : "Provider request failed." }; }
  },
};
