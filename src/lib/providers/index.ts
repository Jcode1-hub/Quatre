import "server-only";
import { env, hasSupabase } from "@/lib/env";
import { isConfigured } from "@/lib/config";
import { modelRegistry, type Model, type ModelProvider } from "@/lib/models";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { openAIProvider } from "./openai";
import { xaiProvider } from "./xai";
import type { ProviderAdapter } from "./types";

export * from "./types";
const adapters: Record<ModelProvider, ProviderAdapter> = { openai: openAIProvider, anthropic: anthropicProvider, google: googleProvider, xai: xaiProvider };

export function availableModels(): Model[] {
  const configured = env as Record<string, unknown>;
  return modelRegistry.filter((model) => {
    const secret = configured[model.envKey];
    return typeof secret === "string" && isConfigured(secret);
  });
}

export function modelsForClient() {
  const available = new Set(availableModels().map((model) => model.id));
  return modelRegistry.map((model) => ({ id: model.id, provider: model.provider, providerName: model.providerName, name: model.name, description: model.description, capabilities: model.capabilities, modalities: model.modalities, supportsReasoning: model.supportsReasoning, freeTierEligible: model.freeTierEligible, freeTierAvailable: model.freeTierAvailable ?? false, freeTierEligibilityNote: model.freeTierEligibilityNote, contextWindow: model.contextWindow, available: hasSupabase && available.has(model.id) }));
}

export function providerFor(model: Model) { return adapters[model.provider]; }
