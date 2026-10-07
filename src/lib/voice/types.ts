/** Contract for a future bidirectional voice session; no realtime provider is wired yet. */
export type VoiceSessionState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
export type VoiceSessionEvent =
  | { type: "state"; state: VoiceSessionState }
  | { type: "transcript"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "audio"; data: ArrayBuffer; mimeType: string }
  | { type: "error"; message: string };
export type VoiceSessionAdapter = {
  connect(input: { modelId: string; onEvent: (event: VoiceSessionEvent) => void; signal: AbortSignal }): Promise<void>;
  sendAudio(data: ArrayBuffer): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
};
