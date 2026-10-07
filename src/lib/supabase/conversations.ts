import "client-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Turn } from "@/lib/conversation-types";
import { mergeConversations } from "@/lib/conversations";

type CloudMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  coordination: { turnId?: string; kind?: string; requestedMode?: Turn["requestedMode"]; demo?: boolean; latencyMs?: number; explanation?: string; displayModel?: string; perspective?: string } | null;
};
type CloudConversation = { id: string; title: string; mode: Turn["requestedMode"] };
const persistedSnapshots = new Map<string, string>();

function relatedId(turnId: string, sequence: number) {
  const raw = turnId.replaceAll("-", "");
  const value = (BigInt(`0x${raw}`) + BigInt(sequence)).toString(16).padStart(32, "0").slice(-32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20)}`;
}

function toRows(conversation: Conversation) {
  return conversation.turns.flatMap((turn) => {
    const common = { turnId: turn.id, requestedMode: turn.requestedMode, explanation: turn.explanation };
    const rows: { id: string; conversation_id: string; role: string; content: string; provider: string | null; model: string | null; coordination: CloudMessage["coordination"] }[] = [{ id: relatedId(turn.id, 0), conversation_id: conversation.id, role: "user", content: turn.prompt, provider: null, model: null, coordination: { ...common, kind: "prompt" } }];
    turn.responses.forEach((response, index) => rows.push({ id: relatedId(turn.id, index + 1), conversation_id: conversation.id, role: "assistant", content: response.content, provider: response.provider, model: response.id, coordination: { ...common, kind: "response", demo: response.demo, latencyMs: response.latencyMs, displayModel: response.model, perspective: response.perspective } }));
    if (turn.synthesis) rows.push({ id: relatedId(turn.id, 10), conversation_id: conversation.id, role: "assistant", content: turn.synthesis, provider: "Quatre", model: "Synthesis", coordination: { ...common, kind: "synthesis", demo: turn.synthesisDemo } });
    return rows;
  });
}

function fromRows(conversation: CloudConversation, messages: CloudMessage[]): Conversation {
  const turns = new Map<string, Turn>();
  for (const message of messages) {
    const coordination = message.coordination ?? {};
    const turnId = coordination.turnId ?? message.id;
    let turn = turns.get(turnId);
    if (!turn) {
      turn = { id: turnId, prompt: "", requestedMode: coordination.requestedMode ?? conversation.mode ?? "auto", mode: conversation.mode ?? "auto", explanation: coordination.explanation, responses: [], synthesis: null, streaming: false };
      turns.set(turnId, turn);
    }
    if (coordination.kind === "prompt" || message.role === "user") turn.prompt = message.content;
    else if (coordination.kind === "synthesis") { turn.synthesis = message.content; turn.synthesisDemo = coordination.demo; }
    else if (message.role === "assistant") turn.responses.push({ id: message.model ?? message.id, model: coordination.displayModel ?? message.model ?? "AI model", provider: message.provider ?? "AI provider", content: message.content, status: "complete", latencyMs: coordination.latencyMs, perspective: coordination.perspective, demo: coordination.demo ?? false });
  }
  return { id: conversation.id, title: conversation.title, turns: [...turns.values()] };
}

export async function syncConversations(client: SupabaseClient, userId: string, local: Conversation[]) {
  const initial = await client.from("workspaces").select("id").eq("owner_id", userId).limit(1).maybeSingle();
  let workspace = initial.data;
  if (initial.error) throw initial.error;
  if (!workspace) {
    const created = await client.from("workspaces").insert({ owner_id: userId, name: "Personal workspace" }).select("id").single();
    if (created.error) throw created.error;
    workspace = created.data;
  }

  await persistConversations(client, workspace.id, local);

  const cloudConversations: CloudConversation[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from("conversations").select("id,title,mode").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }).range(offset, offset + 999);
    if (page.error) throw page.error;
    cloudConversations.push(...(page.data as CloudConversation[]));
    if (page.data.length < 1000) break;
  }
  const ids = cloudConversations.map((item) => item.id);
  const cloudMessages: CloudMessage[] = [];
  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      const page = await client.from("messages").select("id,conversation_id,role,content,provider,model,coordination").in("conversation_id", ids).order("created_at", { ascending: true }).range(offset, offset + 999);
      if (page.error) throw page.error;
      cloudMessages.push(...(page.data as CloudMessage[]));
      if (page.data.length < 1000) break;
    }
  }
  const remote = cloudConversations.map((item) => fromRows(item, cloudMessages.filter((message) => message.conversation_id === item.id)));
  return { conversations: mergeConversations(local, remote), workspaceId: workspace.id as string };
}

export async function persistConversations(client: SupabaseClient, workspaceId: string, local: Conversation[]) {
  const changed = local.filter((item) => persistedSnapshots.get(`${workspaceId}:${item.id}`) !== JSON.stringify(item));
  if (!changed.length) return;
  const conversations = changed.map((item) => ({ id: item.id, workspace_id: workspaceId, title: item.title, mode: item.turns.at(-1)?.requestedMode ?? "auto", model_config: { modelIds: [...new Set(item.turns.flatMap((turn) => turn.responses.map((response) => response.id)))] }, updated_at: new Date().toISOString() }));
  const savedConversations = await client.from("conversations").upsert(conversations, { onConflict: "id" });
  if (savedConversations.error) throw savedConversations.error;
  const rows = changed.flatMap(toRows);
  if (rows.length) {
    const savedMessages = await client.from("messages").upsert(rows, { onConflict: "id" });
    if (savedMessages.error) throw savedMessages.error;
  }
  for (const item of changed) persistedSnapshots.set(`${workspaceId}:${item.id}`, JSON.stringify(item));
}

export async function deleteCloudConversation(client: SupabaseClient, conversationId: string) {
  const { error } = await client.from("conversations").delete().eq("id", conversationId);
  if (error) throw error;
}
