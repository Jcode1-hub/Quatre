import { normalizeResponseStatus, type Conversation, type ResponseItem, type Turn } from "./conversation-types";

export function normalizeConversationHistory(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): Conversation[] => {
    if (!entry || typeof entry !== "object") return [];
    const conversation = entry as Partial<Conversation>;
    if (typeof conversation.id !== "string" || typeof conversation.title !== "string" || !Array.isArray(conversation.turns)) return [];

    const turns = conversation.turns.flatMap((entry): Turn[] => {
      if (!entry || typeof entry !== "object") return [];
      const turn = entry as Turn;
      if (!Array.isArray(turn.responses)) return [{ ...turn, responses: [] }];

      const responses = turn.responses.flatMap((entry): ResponseItem[] => {
        if (!entry || typeof entry !== "object") return [];
        const response = entry as ResponseItem;
        if (typeof response.id !== "string") return [];
        return [{ ...response, status: normalizeResponseStatus(response.status, response.content) }];
      });
      return [{ ...turn, responses }];
    });

    return [{ id: conversation.id, title: conversation.title, turns }];
  });
}

export function mergeConversations(local: Conversation[], cloud: Conversation[]): Conversation[] {
  const merged = new Map(cloud.map((item) => [item.id, item]));
  for (const localConversation of local) {
    const remote = merged.get(localConversation.id);
    if (!remote) { merged.set(localConversation.id, localConversation); continue; }
    const turns = new Map(localConversation.turns.map((turn) => [turn.id, turn]));
    for (const turn of remote.turns) if (!turns.has(turn.id) || !turns.get(turn.id)?.streaming) turns.set(turn.id, turn);
    merged.set(remote.id, { ...remote, title: localConversation.title, turns: [...turns.values()] });
  }
  return [...merged.values()];
}
