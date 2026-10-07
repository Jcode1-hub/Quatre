import type { Model } from "@/lib/models";

export type Usage = { inputTokens?: number; outputTokens?: number };
export type ProviderResult = {
  provider: string;
  model: string;
  content: string;
  latencyMs: number;
  usage?: Usage;
  status: "complete" | "error";
  error?: string;
};
export type ConversationMessage = { role: "user" | "assistant"; content: string };
export type ProviderRequest = { model: Model; prompt: string; system?: string; history?: ConversationMessage[]; signal?: AbortSignal; think?: boolean };
export type ProviderAdapter = { stream(request: ProviderRequest): AsyncGenerator<string>; generate(request: ProviderRequest): Promise<ProviderResult> };
