export const modes = ["solo", "compare", "panel", "auto"] as const;
export type Mode = (typeof modes)[number];
export type ModelProvider = "openai" | "anthropic" | "google" | "xai";
export type Model = {
  id: string;
  provider: ModelProvider;
  providerName: string;
  name: string;
  description: string;
  capabilities: string[];
  envKey: string;
  apiModel: string;
  supportsReasoning: boolean;
  modalities: ("text" | "image")[];
  freeTierEligible: boolean;
  freeTierAvailable?: boolean;
  freeTierEligibilityNote?: string;
  contextWindow?: number;
};

export const modelRegistry: Model[] = [
  { id: "gpt-5.1", provider: "openai", providerName: "OpenAI", name: "GPT-5.1", description: "A capable general model for writing, reasoning, and coding.", capabilities: ["writing", "reasoning", "coding", "streaming"], envKey: "OPENAI_API_KEY", apiModel: "gpt-5.1", supportsReasoning: true, modalities: ["text"], freeTierEligible: false },
  { id: "claude-sonnet-5", provider: "anthropic", providerName: "Anthropic", name: "Claude Sonnet 5", description: "Thoughtful help with writing and complex ideas.", capabilities: ["writing", "reasoning", "coding", "streaming"], envKey: "ANTHROPIC_API_KEY", apiModel: "claude-sonnet-5", supportsReasoning: false, modalities: ["text"], freeTierEligible: false },
  { id: "gemini-3.8-flash", provider: "google", providerName: "Google", name: "Gemini 3.8 Flash", description: "A fast model for everyday and technical work.", capabilities: ["writing", "reasoning", "coding", "streaming"], envKey: "GOOGLE_AI_API_KEY", apiModel: "gemini-3.8-flash", supportsReasoning: true, modalities: ["text"], freeTierEligible: false, freeTierAvailable: true, freeTierEligibilityNote: "Google's unpaid API terms restrict use to professional or business applications; Quatre is a consumer product.", contextWindow: 1_000_000 },
  { id: "grok-4.7", provider: "xai", providerName: "xAI", name: "Grok 4.7", description: "A strong reasoning and coding perspective.", capabilities: ["reasoning", "coding", "streaming"], envKey: "XAI_API_KEY", apiModel: "grok-4.7", supportsReasoning: false, modalities: ["text"], freeTierEligible: false },
];

export const modesDescription: Record<Mode, string> = {
  solo: "Just answer",
  compare: "Compare answers",
  panel: "Ask several perspectives",
  auto: "Let Quatre decide",
};

export function chooseMode(prompt: string): Exclude<Mode, "auto"> {
  const text = prompt.toLowerCase();
  if (/compare|pros and cons|options|which .* better|evaluate|versus|\bvs\b/.test(text)) return "compare";
  if (/brainstorm|perspectives|panel|debate|complex|strategy|debug|review this code|plan a project/.test(text)) return "panel";
  return "solo";
}

export function chooseModel(prompt: string, availableModels: Model[]) {
  const text = prompt.toLowerCase();
  const preference: ModelProvider = /\b(code|coding|debug|typescript|python|sql|programming)\b/.test(text) ? "openai"
    : /\b(write|writing|story|essay|email|lesson|explain|teach)\b/.test(text) ? "anthropic"
      : /\b(image|photo|picture|diagram|visual)\b/.test(text) ? "google"
        : /\b(reason|strategy|complex|plan|decision|trade.?off)\b/.test(text) ? "xai" : "openai";
  return availableModels.find((model) => model.provider === preference) ?? availableModels[0];
}

export function planCoordination(prompt: string, requestedMode: Mode, selectedModel: string, availableModels: Model[], think = false) {
  const mode = requestedMode === "auto" ? chooseMode(prompt) : requestedMode;
  const available = availableModels.length ? availableModels : modelRegistry;
  const selected = requestedMode === "auto" ? (think ? available.find((item) => item.supportsReasoning) ?? chooseModel(prompt, available) : chooseModel(prompt, available)) : available.find((item) => item.id === selectedModel) ?? available[0];
  const participants = mode === "solo" ? (selected ? [selected] : []) : available.filter((model) => model.id !== "demo-structured");
  const modeExplanation = mode === "solo" ? "This looks like a focused question, so one model can answer directly." : mode === "compare" ? "You asked to weigh alternatives, so each available model will answer independently." : "This task benefits from more than one perspective, so Quatre will coordinate a small panel.";
  const modelExplanation = requestedMode === "auto" && mode === "solo" && selected ? ` Quatre chose ${selected.name} for its fit with this request.` : "";
  return { mode, participants, explanation: `${modeExplanation}${modelExplanation}` };
}

export type DemoModel = { id: string; name: string; providerName: string; tone: string };
export const demoModels: DemoModel[] = [
  { id: "demo-structured", name: "Quatre Demo A", providerName: "Demo provider", tone: "structured" },
  { id: "demo-nuanced", name: "Quatre Demo B", providerName: "Demo provider", tone: "nuanced" },
  { id: "demo-exploratory", name: "Quatre Demo C", providerName: "Demo provider", tone: "exploratory" },
];

export function demoAnswer(prompt: string, model: DemoModel) {
  const subject = prompt.trim().replace(/[?.!]+$/, "");
  const text = prompt.toLowerCase();
  if (/photosynthesis/.test(text)) {
    const lens = model.tone === "structured" ? "Here’s the simple version:" : model.tone === "nuanced" ? "The key idea is:" : "Think of a leaf as a tiny solar-powered kitchen:";
    return `${lens} A plant uses sunlight to turn water from the soil and carbon dioxide from the air into sugar for food. It releases oxygen as part of the process.\n\n**Easy way to remember it:** sunlight + water + carbon dioxide → plant food + oxygen. The plant stores energy in the sugar and uses it to grow.`;
  }
  if (/compare|versus|\bvs\b|pros and cons/.test(text)) {
    const emphasis = model.tone === "structured" ? "Set the options beside each other and compare the same things for each: cost, effort, likely benefit, and what could go wrong." : model.tone === "nuanced" ? "The better option depends on what matters most to you. A lower cost can come with more time or uncertainty, so weigh the trade-off against your real constraints." : "Try scoring each option from 1–5 for cost, ease, and fit. The pattern often makes the strongest choice clearer without pretending there is one perfect answer.";
    return `${emphasis}\n\n**Next step:** tell me the options and what matters most to you, and I can make the comparison specific.`;
  }
  if (/debug|error|bug|code|program/.test(text)) {
    return `Let’s narrow this down. First, reproduce the problem with the smallest input you can. Then check the exact error message and the line where the behavior first differs from what you expected.\n\n**Next step:** share the relevant code and error text, plus what you expected to happen. Remove passwords, tokens, and private data first.`;
  }
  if (/study|exam|revision|learn/.test(text)) {
    return `A simple study plan is to work in short rounds: choose one topic, try to recall it without looking, then check what you missed. Spend more time on the parts you could not explain yet.\n\n**Try this today:** 25 minutes of focused study, a 5-minute break, then explain the main idea in your own words.`;
  }
  const opener = model.tone === "structured" ? "Let’s make this manageable." : model.tone === "nuanced" ? "A helpful place to begin is with what matters most to you." : "Here’s one practical way to look at it.";
  const angle = model.tone === "structured" ? "Break the task into the result you want, what you already know, and the next action." : model.tone === "nuanced" ? "The best answer can depend on your situation, so it helps to name the goal and any limits first." : "Start with a small first step, then adjust once you see what works in your situation.";
  return `${opener} For “${subject}”, ${angle}\n\n**Next step:** tell me a little more about what you are trying to do, and I can make the help more specific.`;
}

export function demoSynthesis(prompt: string, answers: { model: string; content: string }[]) {
  return `Across ${answers.length} preview perspectives, a shared starting point is to make the goal explicit, test the biggest assumption early, and keep the first action small.\n\nFor “${prompt.trim()}”, begin by defining what a useful result looks like. The approaches differ in emphasis, so keep the trade-offs visible before committing. These illustrative responses are not independently verified advice.`;
}
