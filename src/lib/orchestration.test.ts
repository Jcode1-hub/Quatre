import { describe, expect, it } from "vitest";
import { chooseMode, chooseModel, demoAnswer, demoModels, demoSynthesis, modelRegistry, planCoordination } from "./models";
import { mergeConversations, normalizeConversationHistory } from "./conversations";

describe("Quatre coordination", () => {
  it("chooses a predictable approach for automatic mode", () => {
    expect(chooseMode("Compare the pros and cons of these options")).toBe("compare");
    expect(chooseMode("Help me brainstorm a strategy from different perspectives")).toBe("panel");
    expect(chooseMode("Explain photosynthesis simply")).toBe("solo");
    expect(planCoordination("Which university is better?", "auto", "gpt-5.1", modelRegistry).mode).toBe("compare");
    expect(chooseModel("Write a welcoming lesson plan", modelRegistry).provider).toBe("anthropic");
  });

  it("uses one selected model for Solo and multiple available models for Compare", () => {
    const openAI = modelRegistry.filter((model) => model.provider === "openai");
    expect(planCoordination("hello", "solo", "gpt-5.1", openAI).participants.map((model) => model.id)).toEqual(["gpt-5.1"]);
    expect(planCoordination("hello", "compare", "gpt-4.1", modelRegistry).participants).toHaveLength(4);
  });

  it("keeps the demo response and synthesis separate and explicit", () => {
    const response = demoAnswer("Plan a study routine", demoModels[0]);
    expect(response).toContain("Try this today");
    expect(demoSynthesis("Plan a study routine", [{ model: "Perspective 1", content: response }])).toContain("illustrative responses");
  });

  it("merges guest and cloud histories without dropping either side", () => {
    const guest = { id: "local", title: "A guest conversation", turns: [] };
    const cloud = { id: "cloud", title: "A conversation from another device", turns: [] };
    expect(mergeConversations([guest], [cloud]).map((conversation) => conversation.id)).toEqual(["cloud", "local"]);
  });

  it("repairs legacy local responses with missing statuses when loading conversation history", () => {
    const history = normalizeConversationHistory([{ id: "local", title: "Saved chat", turns: [{ id: "turn", responses: [
      { id: "answered", model: "Demo", provider: "Demo", content: "A saved answer", demo: true },
      { id: "empty", model: "Demo", provider: "Demo", content: "", demo: true },
    ] }] }]);

    expect(history[0].turns[0].responses.map((response) => response.status)).toEqual(["complete", "error"]);
  });
});
