import type { Mode } from "@/lib/models";

export type ResponseItem = {
  id: string;
  model: string;
  provider: string;
  content: string;
  status: "waiting" | "thinking" | "complete" | "error";
  latencyMs?: number;
  perspective?: string;
  demo: boolean;
  error?: string;
};

const responseStatuses = ["waiting", "thinking", "complete", "error"] as const;

export function normalizeResponseStatus(status: unknown, content: unknown): ResponseItem["status"] {
  if (typeof status === "string" && responseStatuses.includes(status as ResponseItem["status"])) {
    return status as ResponseItem["status"];
  }

  return typeof content === "string" && content.length > 0 ? "complete" : "error";
}

export type Turn = {
  id: string;
  prompt: string;
  requestedMode: Mode;
  mode: string;
  explanation?: string;
  responses: ResponseItem[];
  synthesis: string | null;
  synthesisDemo?: boolean;
  streaming: boolean;
};
export type Conversation = { id: string; title: string; turns: Turn[] };
