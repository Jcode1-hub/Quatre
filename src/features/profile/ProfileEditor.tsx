"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ImagePlus, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { QuatreProfile } from "@/lib/profile";

export function ProfileEditor({ profile, userId, onSave, onClose }: { profile: QuatreProfile; userId?: string; onSave: (profile: QuatreProfile) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(profile);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const set = <K extends keyof QuatreProfile>(key: K, value: QuatreProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function upload(file?: File) {
    if (!file) return;
    if (!userId) { setMessage("Sign in to securely save a profile photo."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG, or WebP image under 4 MB.");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage("Profile photo storage is not configured."); return; }
    setMessage("Uploading your photoâ€¦");
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
    const uploaded = await response.json() as { path?: string; error?: string };
    if (!response.ok || !uploaded.path) { setMessage(uploaded.error || "The photo could not be uploaded. Please try again."); return; }
    const path = uploaded.path;
    const signed = await client.storage.from("quatre-avatars").createSignedUrl(path, 3600);
    if (signed.error || !signed.data) { setMessage("The photo uploaded, but Quatre could not open its preview."); return; }
    setDraft((current) => ({ ...current, avatarStoragePath: path, avatarUrl: signed.data.signedUrl }));
    setPreview(URL.createObjectURL(file));
    setMessage("Photo ready. Save your profile to finish.");
  }

  async function save() {
    setSaving(true); setMessage("");
    try { await onSave(draft); onClose(); }
    catch { setMessage("Your profile could not be saved. Your local conversations are safe."); }
    finally { setSaving(false); }
  }

  return <div className="profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
      <header><div><p className="eyebrow">YOUR PROFILE</p><h2 id="profile-editor-title">Make it yours</h2></div><button className="icon-button" aria-label="Close profile editor" onClick={onClose}><X size={18}/></button></header>
      <div className="profile-photo-row"><div className="profile-photo">{(preview || draft.avatarUrl) ? <Image src={preview || draft.avatarUrl || ""} alt="Profile preview" width={64} height={64} unoptimized/> : <span>{draft.displayName.trim().charAt(0).toUpperCase() || "Q"}</span>}</div><div><b>Your photo</b><small>JPG, PNG or WebP Â· up to 4 MB</small><div className="photo-actions"><button onClick={() => input.current?.click()}><Camera size={14}/>{draft.avatarStoragePath || draft.avatarUrl ? "Replace" : "Upload photo"}</button>{(draft.avatarStoragePath || draft.avatarUrl) && <button onClick={() => { setDraft((current) => ({ ...current, avatarUrl: null, avatarStoragePath: null })); setPreview(null); setMessage("Photo removed. Save your profile to confirm."); }}>Remove</button>}</div></div><input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" onChange={(event) => void upload(event.target.files?.[0])}/></div>
      <div className="profile-editor-fields"><label>Display name<input maxLength={80} value={draft.displayName} onChange={(event) => set("displayName", event.target.value)} placeholder="Your name"/></label><label>Username<input maxLength={24} pattern="[A-Za-z0-9_]{3,24}" value={draft.username} onChange={(event) => set("username", event.target.value.replace(/[^A-Za-z0-9_]/g, ""))} placeholder="yourname"/></label><label>Short bio<textarea maxLength={240} rows={3} value={draft.bio} onChange={(event) => set("bio", event.target.value)} placeholder="A little about what matters to you"/></label><label>What you do <span>optional</span><input maxLength={80} value={draft.occupation} onChange={(event) => set("occupation", event.target.value)} placeholder="Student, maker, parentâ€¦"/></label><label>Region <span>optional Â· broad area only</span><input maxLength={80} value={draft.region} onChange={(event) => set("region", event.target.value)} placeholder="Lagos, West Africa"/></label><label>Skills <span>optional Â· separate with commas</span><input value={draft.skills.join(", ")} onChange={(event) => set("skills", event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20))} placeholder="Writing, Python, teaching"/></label></div>
      <label className="profile-visibility"><span><b>Discoverable in Community</b><small>Only the profile details you choose are shown. Your email stays private.</small></span><input type="checkbox" checked={draft.communityVisible} onChange={(event) => set("communityVisible", event.target.checked)}/></label>
      <label className="profile-contact">Who can send a message request?<select value={draft.contactPolicy} onChange={(event) => set("contactPolicy", event.target.value as QuatreProfile["contactPolicy"])}><option value="requests">Anyone in Community</option><option value="connections">Connections only</option><option value="nobody">No message requests</option></select></label>
      {message && <p className="profile-feedback" role="status">{message}</p>}
      <footer><span>{userId ? <><Check size={13}/> Private by default</> : <><ImagePlus size={13}/> Guest profile saved on this device</>}</span><button className="onboarding-primary" disabled={saving} onClick={() => void save()}>{saving ? "Savingâ€¦" : "Save profile"}</button></footer>
    </section>
  </div>;
}


