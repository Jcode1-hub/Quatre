/** Conversation files remain private and are never sent to a provider before policy checks pass. */
export type AttachmentKind = "image" | "document" | "pdf" | "text" | "code" | "audio" | "video";
export type AttachmentStatus = "selected" | "validated" | "uploading" | "stored" | "attached" | "failed";
export type ConversationAttachment = {
  id: string;
  conversationId: string;
  ownerId: string;
  name: string;
  mediaType: string;
  size: number;
  kind: AttachmentKind;
  privateStorageKey?: string;
  status: AttachmentStatus;
};
export type AttachmentModelCapabilities = { modalities: readonly ("text" | "image" | "document" | "audio" | "video")[]; maxAttachmentBytes?: number };
export type AttachmentStorage = {
  put(input: { ownerId: string; attachmentId: string; file: File }): Promise<{ privateStorageKey: string }>;
  remove(input: { ownerId: string; privateStorageKey: string }): Promise<void>;
};
export type AttachmentProvider = {
  canAccept(attachment: ConversationAttachment, model: AttachmentModelCapabilities): boolean;
  toProviderPart(attachment: ConversationAttachment, storage: AttachmentStorage): Promise<unknown>;
};
