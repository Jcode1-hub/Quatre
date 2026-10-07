"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { normalizeResponseStatus, type Conversation, type Turn } from "@/lib/conversation-types";
import { Activity, ArrowDown, ArrowUp, Check, Command, Copy, Layers2, Menu, MessageSquare, MoreHorizontal, Plus, Search, Settings2, Sparkles, SquarePen, UserRound, Users, X } from "lucide-react";
import { modesDescription, type Mode } from "@/lib/models";
import { mergeConversations, normalizeConversationHistory } from "@/lib/conversations";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { deleteCloudConversation, persistConversations, syncConversations } from "@/lib/supabase/conversations";
import { CommunityHub } from "@/features/community/CommunityHub";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { ProfileEditor } from "@/features/profile/ProfileEditor";
import { NotificationCenter } from "@/features/notifications/NotificationCenter";
import { Composer } from "@/features/composer/Composer";
import { emptyProfile, profileFromRow, profileToRow, type QuatreProfile } from "@/lib/profile";
import type { QuatreNotification } from "@/lib/notifications";

type ModelOption = { id: string; provider: string; providerName: string; name: string; description: string; capabilities: string[]; available: boolean; supportsReasoning?: boolean; modalities?: string[]; freeTierEligible?: boolean; freeTierEligibilityNote?: string };
type UserIdentity = { id: string; email?: string; name?: string; avatar?: string };
type Appearance = "system" | "light" | "dark" | "minimal" | "midnight" | "studio" | "quantum";
type MotionIntensity = "system" | "gentle" | "reduced";
const modes: Mode[] = ["solo", "compare", "panel", "auto"];
const STORAGE_KEY = "quatre-conversations";

function QuatreMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? "mini" : ""}`} aria-hidden="true"><Image src="/icon.svg" alt="" width={small ? 21 : 25} height={small ? 21 : 25} priority/></span>;
}

function applyAppearance(appearance: Appearance) {
  const dark = appearance === "dark" || appearance === "midnight" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = appearance === "system" ? (dark ? "dark" : "light") : appearance;
}

function readLocalConversations(): Conversation[] {
  try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? normalizeConversationHistory(JSON.parse(saved) as unknown) : []; }
  catch { return []; }
}

export default function Home() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState<QuatreProfile>(emptyProfile);
  const [profileReady, setProfileReady] = useState(false);
  const [pageView, setPageView] = useState<"workspace" | "community">("workspace");
  const [communityStartTab, setCommunityStartTab] = useState<"discover" | "connections" | "messages">("discover");
  const [communityFocus, setCommunityFocus] = useState<{ threadId?: string; messageId?: string }>({});
  const [mode, setMode] = useState<Mode>("auto");
  const [selectedModel, setSelectedModel] = useState("");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [think, setThink] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [motionIntensity, setMotionIntensity] = useState<MotionIntensity>("system");
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [cloudStatus, setCloudStatus] = useState<"guest" | "syncing" | "ready" | "error">("guest");
  const [email, setEmail] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<Conversation[]>([]);
  const syncedUserRef = useRef<string | null>(null);
  const profileLoadedForRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === active);
  const configuredModels = modelOptions.filter((item) => item.available);
  const usingDemo = configuredModels.length === 0;

  useEffect(() => {
    try {
      if (sessionStorage.getItem("quatre-entered") === "true") {
        const frame = window.requestAnimationFrame(() => setSplashVisible(false));
        return () => window.cancelAnimationFrame(frame);
      }
      sessionStorage.setItem("quatre-entered", "true");
    } catch { /* Keep the brief first-entry transition when session storage is unavailable. */ }
    const splashTimer = window.setTimeout(() => setSplashVisible(false), 560);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = localStorage.getItem("quatre-profile");
        if (savedProfile) setProfile({ ...emptyProfile, ...(JSON.parse(savedProfile) as Partial<QuatreProfile>) });
        setOnboardingOpen(localStorage.getItem("quatre-onboarding-complete") !== "true");
      } catch { setOnboardingOpen(true); }
      setProfileReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) { profileLoadedForRef.current = null; return; }
    if (!profileReady || profileLoadedForRef.current === user.id) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    profileLoadedForRef.current = user.id;
    let cancelled = false;
    void client.from("profiles").select("*").eq("id", user.id).maybeSingle().then(async (result: { data: Record<string, unknown> | null; error: { message: string } | null }) => {
      const data = result.data as Record<string, unknown> | null;
      const profileError = result.error;
      if (cancelled) return;
      if (profileError || !data) { profileLoadedForRef.current = null; return; }
      const storedProfile = profileFromRow(data);
      const completed = Boolean(data["onboarding_completed_at"]);
      if (completed) {
        const photo = storedProfile.avatarStoragePath ? await client.storage.from("quatre-avatars").createSignedUrl(storedProfile.avatarStoragePath, 1800) : null;
        const cloudProfile = { ...storedProfile, avatarUrl: photo?.data?.signedUrl ?? storedProfile.avatarUrl };
        setProfile(cloudProfile);
        try { localStorage.setItem("quatre-profile", JSON.stringify(cloudProfile)); localStorage.setItem("quatre-onboarding-complete", "true"); } catch { /* Cloud profile remains available. */ }
        setOnboardingOpen(false);
        setUser((current) => current?.id === user.id ? { ...current, name: cloudProfile.displayName || current.name, avatar: cloudProfile.avatarUrl ?? current.avatar } : current);
      } else {
        let locallyComplete = false;
        try { locallyComplete = localStorage.getItem("quatre-onboarding-complete") === "true"; } catch { /* Keep this profile private until onboarding is completed. */ }
        if (locallyComplete) {
          const synced = await client.from("profiles").update(profileToRow(profile)).eq("id", user.id);
          if (!cancelled && !synced.error) setOnboardingOpen(false);
        }
      }
    });
    return () => { cancelled = true; };
  }, [user, profileReady, profile]);

  useEffect(() => {
    if (!profileReady) return;
    try { localStorage.setItem("quatre-profile", JSON.stringify(profile)); } catch { /* Keep profile data in memory for this session. */ }
  }, [profile, profileReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const items = readLocalConversations();
      setConversations(items);
      if (items[0]) setActive(items[0].id);
      try { const savedAppearance = localStorage.getItem("quatre-appearance") as Appearance | null; if (savedAppearance) setAppearance(savedAppearance); }
      catch { /* Use the system appearance when storage is unavailable. */ }
      try { const savedMotion = localStorage.getItem("quatre-motion") as MotionIntensity | null; if (savedMotion) setMotionIntensity(savedMotion); }
      catch { /* Use the system motion preference when storage is unavailable. */ }
      setAppearanceReady(true);
      setHistoryReady(true);
    }, 0);
    void fetch("/api/models").then((response) => response.json()).then((data) => {
      setModelOptions(data.models ?? []);
      const first = data.models?.find((item: ModelOption) => item.available);
      if (first) setSelectedModel(first.id);
    }).catch(() => setModelOptions([]));
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
        const current = data.session?.user;
        if (current) setUser({ id: current.id, email: current.email, name: current.user_metadata?.full_name ?? current.user_metadata?.name, avatar: current.user_metadata?.avatar_url });
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        const current = session?.user;
        setUser(current ? { id: current.id, email: current.email, name: current.user_metadata?.full_name ?? current.user_metadata?.name, avatar: current.user_metadata?.avatar_url } : null);
        if (!current) setCloudStatus("guest");
      });
      return () => { window.clearTimeout(timer); listener.subscription.unsubscribe(); };
    }
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { if (historyReady) localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }, [conversations, historyReady]);
  useEffect(() => { conversationRef.current = conversations; }, [conversations]);
  useEffect(() => {
    if (!historyReady) return;
    if (!user) { syncedUserRef.current = null; workspaceIdRef.current = null; return; }
    if (syncedUserRef.current === user.id) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    syncedUserRef.current = user.id;
    void Promise.resolve().then(() => { setCloudStatus("syncing"); return syncConversations(client, user.id, conversationRef.current); }).then((result) => {
      workspaceIdRef.current = result.workspaceId;
      setConversations((local) => mergeConversations(local, result.conversations));
      setCloudStatus("ready");
    }).catch(() => { syncedUserRef.current = null; setCloudStatus("error"); });
  }, [user, historyReady]);
  useEffect(() => {
    if (!historyReady || !user || cloudStatus !== "ready" || busy || !workspaceIdRef.current) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const timer = window.setTimeout(() => { void persistConversations(client, workspaceIdRef.current!, conversations).catch(() => setCloudStatus("error")); }, 700);
    return () => window.clearTimeout(timer);
  }, [conversations, user, historyReady, cloudStatus, busy]);
  useEffect(() => { if (appearanceReady) { applyAppearance(appearance); localStorage.setItem("quatre-appearance", appearance); document.documentElement.dataset.motion = motionIntensity; localStorage.setItem("quatre-motion", motionIntensity); } }, [appearance, appearanceReady, motionIntensity]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((open) => !open); }
      if (event.key === "Escape") { setPaletteOpen(false); setSettingsOpen(false); setAccountOpen(false); setMenuOpen(false); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const newConversation = useCallback(() => { setPageView("workspace"); setActive(null); setPrompt(""); setError(""); setMenuOpen(false); setPaletteOpen(false); window.setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const submit = useCallback(async (override?: string) => {
    const text = (override ?? prompt).trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setPrompt("");
    const conversationId = active ?? crypto.randomUUID();
    const turnId = crypto.randomUUID();
    const initialTurn: Turn = { id: turnId, prompt: text, requestedMode: mode, mode, responses: [], synthesis: null, streaming: true };
    setActive(conversationId);
    setConversations((items) => {
      const exists = items.some((item) => item.id === conversationId);
      if (exists) return items.map((item) => item.id === conversationId ? { ...item, turns: [...item.turns, initialTurn] } : item);
      return [{ id: conversationId, title: text.slice(0, 56), turns: [initialTurn] }, ...items];
    });
    const updateTurn = (update: (turn: Turn) => Turn) => setConversations((items) => items.map((conversation) => conversation.id !== conversationId ? conversation : { ...conversation, turns: conversation.turns.map((turn) => turn.id === turnId ? update(turn) : turn) }));
    const abortController = new AbortController();
    requestAbortRef.current = abortController;
    try {
      const history = (activeConversation?.turns ?? []).slice(-8).flatMap((turn) => {
        const answer = turn.synthesis || turn.responses.find((item) => item.status === "complete")?.content;
        return [{ role: "user" as const, content: turn.prompt.slice(0, 6000) }, ...(answer ? [{ role: "assistant" as const, content: answer.slice(0, 6000) }] : [])];
      }).slice(-16);
      const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abortController.signal, body: JSON.stringify({ prompt: text, mode, model: selectedModel || "demo", think, history }) });
      if (!response.ok || !response.body) { const data = await response.json().catch(() => null); throw new Error(data?.error ?? "Quatre couldn't start this request."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split(/\r?\n/).find((part) => part.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === "plan") updateTurn((turn) => ({ ...turn, mode: event.mode, explanation: event.explanation, responses: event.participants.map((item: { id: string; model: string; provider: string; demo: boolean; perspective?: string }) => ({ id: item.id, model: item.model, provider: item.provider, content: "", status: "waiting", demo: item.demo, perspective: item.perspective })) }));
          if (event.type === "model") updateTurn((turn) => ({ ...turn, responses: turn.responses.map((item) => item.id === event.id ? { ...item, model: event.model, provider: event.provider, status: normalizeResponseStatus(event.status, item.content), latencyMs: event.latencyMs, error: event.error, demo: event.demo, perspective: event.perspective } : item) }));
          if (event.type === "delta") updateTurn((turn) => ({ ...turn, responses: turn.responses.map((item) => item.id === event.id ? { ...item, status: "thinking", content: item.content + event.content } : item) }));
          if (event.type === "synthesis-delta") updateTurn((turn) => ({ ...turn, synthesis: (turn.synthesis ?? "") + event.content }));
          if (event.type === "synthesis") updateTurn((turn) => ({ ...turn, synthesis: event.content, synthesisDemo: event.demo }));
          if (event.type === "error") throw new Error(event.error);
        }
        if (done) break;
      }
      updateTurn((turn) => ({ ...turn, streaming: false }));
    } catch (cause) {
      updateTurn((turn) => ({ ...turn, streaming: false }));
      if (!abortController.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not reach Quatre. Please try again."); setPrompt(text); }
    } finally { if (requestAbortRef.current === abortController) requestAbortRef.current = null; setBusy(false); }
  }, [active, activeConversation, busy, mode, prompt, selectedModel, think]);

  async function sendMagicLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthNotice("Add your Supabase URL and anon key to enable account sign-in. Guest conversations remain available here."); return; }
    if (!email.trim()) { setAuthNotice("Enter your email address and we’ll send you a sign-in link."); return; }
    setAuthLoading(true); setAuthNotice("");
    const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setAuthNotice(authError ? authError.message : "Check your inbox for a secure sign-in link. Your local conversations are still saved in this browser.");
    setAuthLoading(false);
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthNotice("Add your Supabase URL and anon key to enable sign-in. Guest conversations remain available here."); return; }
    setAuthLoading(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (authError) { setAuthNotice(authError.message); setAuthLoading(false); }
  }

  async function signOut() { const supabase = getSupabaseBrowserClient(); if (supabase) await supabase.auth.signOut(); setAccountOpen(false); }
  async function retryCloudSync() {
    const client = getSupabaseBrowserClient();
    if (!client || !user) return;
    syncedUserRef.current = user.id;
    setCloudStatus("syncing");
    try {
      const result = await syncConversations(client, user.id, conversationRef.current);
      workspaceIdRef.current = result.workspaceId;
      setConversations((local) => mergeConversations(local, result.conversations));
      setCloudStatus("ready");
    } catch { syncedUserRef.current = null; setCloudStatus("error"); }
  }
  async function saveProfile(next: QuatreProfile) {
    const previousAvatar = profile.avatarStoragePath;
    setProfile(next);
    try { localStorage.setItem("quatre-profile", JSON.stringify(next)); localStorage.setItem("quatre-onboarding-complete", "true"); } catch { /* Keep profile data in memory for this session. */ }
    if (!user) return;
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Profile sync is unavailable.");
    const { error: saveError } = await client.from("profiles").update(profileToRow(next)).eq("id", user.id);
    if (saveError) throw saveError;
    if (previousAvatar && previousAvatar !== next.avatarStoragePath) void client.storage.from("quatre-avatars").remove([previousAvatar]);
    const signed = next.avatarStoragePath ? await client.storage.from("quatre-avatars").createSignedUrl(next.avatarStoragePath, 1800) : null;
    setUser((current) => current?.id === user.id ? { ...current, name: next.displayName || current.name, avatar: signed?.data?.signedUrl ?? next.avatarUrl ?? undefined } : current);
  }
  function completeOnboarding(next: QuatreProfile) {
    void saveProfile(next).then(() => setOnboardingOpen(false)).catch(() => setOnboardingOpen(false));
  }
  function skipOnboarding() {
    try { localStorage.setItem("quatre-onboarding-complete", "true"); } catch { /* Skipping applies for this session. */ }
    setOnboardingOpen(false);
    if (user) void saveProfile(profile).catch(() => undefined);
  }
  function chooseAppearance(value: Appearance) { setAppearance(value); setSettingsOpen(false); }
  function chooseMotion(value: MotionIntensity) { setMotionIntensity(value); }
  function openNotification(notification: QuatreNotification) {
    setCommunityStartTab(notification.type === "message_request" || notification.type === "new_message" ? "messages" : "connections");
    setCommunityFocus({
      threadId: notification.type === "message_request" ? notification.source_id ?? undefined : undefined,
      messageId: notification.type === "new_message" ? notification.source_id ?? undefined : undefined,
    });
    setPageView("community");
  }
  async function saveNotificationPreference(key: "notifyCommunity" | "notifyMessages" | "notifyProduct", value: boolean) {
    try { await saveProfile({ ...profile, [key]: value }); }
    catch {
      setProfile(profile);
      try { localStorage.setItem("quatre-profile", JSON.stringify(profile)); } catch { /* The account remains the source of truth when online again. */ }
      setAuthNotice("That notification preference could not be saved. Please try again.");
    }
  }
  function renameConversation(id: string) { if (renameValue.trim()) setConversations((items) => items.map((item) => item.id === id ? { ...item, title: renameValue.trim() } : item)); setRenaming(null); }
  async function copyContent(value: string, id: string) { await navigator.clipboard.writeText(value); setCopied(id); window.setTimeout(() => setCopied(null), 1400); }
  function runCommand(command: string) {
    setPaletteOpen(false);
    if (command === "new") newConversation();
    else if (command === "settings") setSettingsOpen(true);
    else if (command === "account") setAccountOpen(true);
    else if (modes.includes(command as Mode)) setMode(command as Mode);
    else if (command === "model") setSettingsOpen(true);
  }

  const visibleConversations = conversations.filter((conversation) => conversation.title.toLowerCase().includes(search.toLowerCase()));
  return <main className="app-shell">
    {splashVisible && <div className="splash-screen" aria-label="Quatre is opening" role="status"><QuatreMark/><span>quatre</span></div>}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
    <div className="brand-row"><a className="brand" href="#workspace" aria-label="Quatre home"><QuatreMark/><span>quatre</span></a><button className="icon-button mobile-only" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
      <button className="new-chat" onClick={newConversation}><SquarePen size={16}/><span>New conversation</span><kbd>⌘ K</kbd></button>
      <div className="nav-section"><p className="section-label">WORKSPACE</p><button className={`nav-item ${pageView === "workspace" ? "nav-active" : ""}`} onClick={() => { setPageView("workspace"); setMenuOpen(false); }}><Layers2 size={16}/><span>Personal workspace</span>{pageView === "workspace" && <span className="status-dot"/>}</button><button className={`nav-item ${pageView === "community" ? "nav-active" : ""}`} onClick={() => { setCommunityStartTab("discover"); setPageView("community"); setMenuOpen(false); }}><Users size={16}/><span>Community</span>{pageView === "community" && <span className="status-dot"/>}</button></div>
      <div className="history-section"><div className="history-heading"><p className="section-label">RECENT</p><button className="icon-button" aria-label="New conversation" onClick={newConversation}><Plus size={15}/></button></div>
        <label className="history-search"><Search size={13}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a conversation" aria-label="Search conversations"/></label>
        {visibleConversations.length ? visibleConversations.map((conversation) => <div key={conversation.id} className={`history-line ${active === conversation.id ? "history-current" : ""}`}>{renaming === conversation.id ? <input className="rename-input" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameConversation(conversation.id); if (event.key === "Escape") setRenaming(null); }} onBlur={() => renameConversation(conversation.id)} aria-label="Rename conversation"/> : <button className="history-item" onClick={() => { setPageView("workspace"); setActive(conversation.id); setMenuOpen(false); }}><MessageSquare size={15}/><span>{conversation.title}</span></button>}<button className="history-more" aria-label={`More actions for ${conversation.title}`} onClick={() => { setRenameValue(conversation.title); setRenaming(conversation.id); }}><MoreHorizontal size={15}/></button><button className="history-delete" aria-label={`Delete ${conversation.title}`} onClick={() => { setConversations((items) => items.filter((item) => item.id !== conversation.id)); if (active === conversation.id) setActive(null); const client = getSupabaseBrowserClient(); if (user && client) void deleteCloudConversation(client, conversation.id).catch(() => setCloudStatus("error")); }}><X size={13}/></button></div>) : <p className="history-empty">{search ? "No conversations match." : "Your conversations will appear here."}</p>}
      </div>
      <div className="sidebar-bottom"><div className={`demo-chip ${usingDemo ? "" : "live-chip"}`}><span className="pulse-dot"/>{usingDemo ? "PREVIEW RESPONSES" : "MODELS CONNECTED"}</div><button className="profile-button" onClick={() => setAccountOpen(true)}>{user?.avatar ? <Image className="avatar" src={user.avatar} alt="" width={29} height={29} unoptimized/> : <span className="avatar">{user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "Q"}</span>}<span className="profile-copy"><b>{user?.name ?? user?.email?.split("@")[0] ?? "Guest"}</b><small>{user ? "Personal workspace" : "Local workspace"}</small></span><Settings2 size={16}/></button></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <section className="main-panel" id="workspace">
      <header className="topbar"><button className="icon-button mobile-only" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19}/></button><div className="breadcrumb"><span>Personal workspace</span><span className="slash">/</span><b>{pageView === "community" ? "Community" : activeConversation?.title ?? "New conversation"}</b></div><div className="topbar-actions"><span className="secure-label"><span/>{user ? cloudStatus === "ready" ? "Synced" : cloudStatus === "syncing" ? "Syncing" : "Sync paused" : "Saved on this device"}</span><NotificationCenter userId={user?.id} onOpenNotification={openNotification}/><button className="account-control" onClick={() => setAccountOpen(true)} aria-label="Open account menu">{user?.avatar ? <Image src={user.avatar} alt="" width={26} height={26} unoptimized/> : <span>{user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "Q"}</span>}</button><button className="icon-button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17}/></button></div></header>
      <div className="work-area">
        {pageView === "community" ? <CommunityHub userId={user?.id} ownProfile={profile} initialTab={communityStartTab} focusThreadId={communityFocus.threadId} focusMessageId={communityFocus.messageId} onEditProfile={() => setProfileEditorOpen(true)}/> : activeConversation?.turns.length ? <div className="conversation-scroll"><div className="conversation-content">{activeConversation.turns.map((turn) => <article className="turn" key={turn.id}><div className="user-message"><div className="user-avatar">{user?.name?.[0]?.toUpperCase() ?? "Y"}</div><div><div className="message-meta">{user?.name ?? "You"}<span>·</span> {modesDescription[turn.requestedMode]}{turn.requestedMode === "auto" && <span className="auto-choice">· Quatre chose {modesDescription[turn.mode as Mode]?.toLowerCase()}</span>}</div><p>{turn.prompt}</p></div></div>
          {turn.explanation && <p className="coordination-note"><Sparkles size={13}/>{turn.explanation}</p>}
          <div className="response-grid" data-count={turn.responses.length}>{turn.responses.map((answer, index) => { const label = answer.demo ? answer.perspective ? ["Useful facts", "Practical view", "Alternative angle", "Assumptions check"][index % 4] : turn.responses.length === 1 ? "Quatre" : `Perspective ${index + 1}` : answer.model; const state = answer.status === "thinking" ? "Thinking" : answer.status === "waiting" ? "Waiting" : answer.status === "error" ? "Unavailable" : "Ready"; return <section className={`response-card ${answer.status === "thinking" ? "response-thinking" : ""}`} key={answer.id}><div className="response-head"><span className={`model-icon ${answer.status === "thinking" ? "model-icon-active" : ""}`}><Sparkles size={14}/></span><div><b>{label}</b><small>{answer.demo ? "Quatre preview" : answer.provider}{answer.latencyMs ? ` · ${(answer.latencyMs / 1000).toFixed(1)}s` : ""}{answer.perspective && !answer.demo ? ` · ${answer.perspective}` : ""}</small></div><span className={`answer-state state-${answer.status}`}><i/>{state}</span>{answer.demo && <span className="demo-tag">PREVIEW</span>}</div><div className="response-body">{answer.status === "waiting" ? <span className="status-copy">Waiting for its turn…</span> : answer.content ? answer.content.split("\n\n").map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith("*") ? <em key={i}>{part.slice(1, -1)}</em> : part)}</p>) : answer.status === "error" ? <p className="provider-error">{answer.error ?? "Provider unavailable. Check its server configuration and try again."}</p> : <span className="stream-cursor"/>}</div>{answer.content && <button className="copy-button" aria-label="Copy response" onClick={() => void copyContent(answer.content, answer.id)}>{copied === answer.id ? <Check size={13}/> : <Copy size={13}/>}</button>}</section>; })}</div>
          {turn.synthesis && <section className={`synthesis-card ${turn.streaming ? "synthesis-streaming" : ""}`}><div className="synthesis-title"><QuatreMark small/><b>Quatre’s answer</b><span className={turn.synthesisDemo ? "demo-tag" : "coordinated-tag"}>{turn.synthesisDemo ? "PREVIEW" : "SYNTHESIS"}</span><button className="copy-button" aria-label="Copy Quatre’s answer" onClick={() => void copyContent(turn.synthesis ?? "", `${turn.id}-synthesis`)}>{copied === `${turn.id}-synthesis` ? <Check size={13}/> : <Copy size={13}/>}</button></div><div className="synthesis-body">{turn.synthesis.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>}
          {turn.streaming && <div className="thinking"><span className="thinking-icon"><Activity size={16}/></span><div><b>Quatre is coordinating</b><small>{turn.explanation ?? "Choosing a helpful way to approach this…"}</small></div><span className="loader-dots"><i/><i/><i/></span></div>}
          {!turn.streaming && <div className="turn-actions"><button onClick={() => void copyContent(turn.prompt, `${turn.id}-prompt`)}><Copy size={12}/>{copied === `${turn.id}-prompt` ? "Copied" : "Copy question"}</button><button onClick={() => void submit(turn.prompt)}><ArrowUp size={12}/>Ask again</button></div>}
        </article>)}<div className="end-marker"><span>END OF CONVERSATION</span></div></div></div> : <div className="welcome"><div className="welcome-mark"><QuatreMark/><span className="orbit orbit-one"/><span className="orbit orbit-two"/></div><p className="eyebrow"><span/>YOUR AI, IN CONCERT</p><h1>Ask Quatre<br/><span>anything.</span></h1><p className="welcome-copy">Ask naturally. Quatre can bring different perspectives together, then make the useful parts clear.</p><div className="value-row"><div><span className="value-icon"><Layers2 size={16}/></span><b>One simple place</b><small>Your AI models, working together</small></div><span className="value-rule"/><div><span className="value-icon"><Sparkles size={16}/></span><b>Quatre works it out</b><small>Choose a style or let Quatre decide</small></div></div><div className="example-prompts"><span>TRY ASKING</span><button onClick={() => setPrompt("Explain photosynthesis in a simple way I can remember.")}>“Explain photosynthesis in a simple way I can remember.” <ArrowDown size={13}/></button><button onClick={() => setPrompt("Compare a few ways to build a focused morning routine.")}>“Compare a few ways to build a focused morning routine.” <ArrowDown size={13}/></button></div></div>}
      </div>
      {pageView === "workspace" && <Composer prompt={prompt} setPrompt={setPrompt} busy={busy} mode={mode} setMode={setMode} modes={modes} modeLabels={modesDescription} models={modelOptions} selectedModel={selectedModel} setSelectedModel={setSelectedModel} usingDemo={usingDemo} think={think} setThink={setThink} onSubmit={() => void submit()} onStop={() => requestAbortRef.current?.abort()} error={error} retry={() => void submit()} inputRef={inputRef}/>}
    </section>
    {paletteOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Quatre commands"><label className="palette-search"><Command size={15}/><input autoFocus aria-label="Find a command" placeholder="Find a command…" value={search} onChange={(event) => setSearch(event.target.value)}/><kbd>ESC</kbd></label><button onClick={() => runCommand("new")}><SquarePen size={15}/>New conversation<kbd>⌘ Enter</kbd></button><button onClick={() => runCommand("settings")}><Settings2 size={15}/>Settings</button><button onClick={() => runCommand("account")}><UserRound size={15}/>Account</button>{modes.map((item) => <button key={item} onClick={() => runCommand(item)}><Layers2 size={15}/>{modesDescription[item]}</button>)}<p className="palette-foot">Use keyboard shortcuts to move quickly. Press Escape to close.</p></section></div>}
    {settingsOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18}/></button></header><h3>Appearance</h3><p>Choose a comfortable look for your workspace.</p><div className="appearance-grid">{(["system", "light", "dark", "minimal", "midnight", "studio", "quantum"] as Appearance[]).map((item) => <button key={item} className={`appearance-option ${appearance === item ? "appearance-active" : ""}`} onClick={() => chooseAppearance(item)}><span className={`appearance-swatch swatch-${item}`}/><span>{item[0].toUpperCase() + item.slice(1)}</span>{appearance === item && <Check size={13}/>}</button>)}</div><h3>AI models</h3><p>AI access depends on each provider’s API terms and quota. Gemini’s unpaid tier is for professional or business use, not a consumer app. The preferred model applies to Just answer; Compare and Panel use connected providers.</p><div className="provider-list">{modelOptions.map((item) => <div key={item.id}><span className={`provider-dot ${item.available ? "provider-available" : ""}`}/><span><b>{item.providerName}</b><small>{item.name} · {item.available ? "Key configured" : "Not connected"}</small></span><span className={item.available ? "provider-state-ready" : "provider-state"}>{item.available ? "SET" : "OFF"}</span></div>)}</div><h3>Motion</h3><p>Keep movement comfortable. Quatre also respects your device’s accessibility setting.</p><div className="motion-options">{(["system", "gentle", "reduced"] as MotionIntensity[]).map((item) => <button key={item} aria-pressed={motionIntensity === item} className={motionIntensity === item ? "motion-selected" : ""} onClick={() => chooseMotion(item)}>{item === "system" ? "System" : item === "gentle" ? "Gentle" : "Reduced"}</button>)}</div></section></div>}
    {accountOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}><section className="settings-panel account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title"><header><div><p className="eyebrow">YOUR QUATRE</p><h2 id="account-title">{user ? "Your account" : "Welcome to Quatre"}</h2></div><button className="icon-button" onClick={() => setAccountOpen(false)} aria-label="Close account"><X size={18}/></button></header><button className="secondary-action" onClick={() => { setAccountOpen(false); setProfileEditorOpen(true); }}>Edit profile</button>{user ? <><div className="account-identity">{user.avatar ? <Image src={user.avatar} alt="" width={39} height={39} unoptimized/> : <span>{user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase()}</span>}<div><b>{user.name ?? "Personal workspace"}</b><small>{user.email}</small></div></div><div className="account-plan-card"><span>{profile.plan.toUpperCase()} PLAN</span><b>Plan &amp; usage</b><small>Usage limits are currently being finalized.</small><div className="plan-coming"><section><b>QUATRE PLUS</b><small>Coming soon</small><p>More credits, higher limits, more capable models, expanded Compare, Panel, advanced personalization, longer context, faster response priority, and expanded history.</p></section><section><b>QUATRE MAX</b><small>Coming soon</small><p>Substantially more credits, premium models, advanced reasoning, Deep Research, advanced personalization, larger context, advanced tools and agents, priority compute, and early access.</p></section></div></div><div className="account-preferences"><h3>Preferences</h3><p>Choose which Quatre activity can notify you.</p>{([["notifyCommunity", "Community notifications"], ["notifyMessages", "Message notifications"], ["notifyProduct", "Product notifications"]] as const).map(([key, label]) => <button key={key} role="switch" aria-checked={profile[key]} className="preference-toggle" onClick={() => void saveNotificationPreference(key, !profile[key])}><span>{label}</span><i aria-hidden="true"/></button>)}{authNotice && <p className="preference-error" role="status">{authNotice}</p>}</div><div className="account-local-note">{cloudStatus === "ready" ? "Your conversations are synced to your account. This browser keeps a local copy too." : cloudStatus === "syncing" ? "Moving your local conversations into your personal workspace… Your browser copy remains saved." : cloudStatus === "error" ? "Cloud sync could not reach your workspace. Your local conversations are safe on this device." : "Your conversations are still saved on this device."}</div>{cloudStatus === "error" && <button className="secondary-action" onClick={() => void retryCloudSync()}>Try cloud sync again</button>}<button className="secondary-action" onClick={() => void signOut()}>Sign out</button></> : <><p>Sign in to set up your Quatre account. You can keep using your local workspace without an account.</p><button className="secondary-action google-action" disabled={authLoading} onClick={() => void signInWithGoogle()}>Continue with Google</button><div className="email-divider"><span>OR USE EMAIL</span></div><label className="email-label">Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label><button className="primary-action" disabled={authLoading} onClick={() => void sendMagicLink()}>{authLoading ? "Sending link…" : "Email me a sign-in link"}</button><p className="guest-note">Or close this window to keep using Quatre as a guest. Local conversations stay in this browser.</p>{authNotice && <p className="auth-notice" role="status">{authNotice}</p>}</>}</section></div>}
    {profileEditorOpen && <ProfileEditor profile={profile} userId={user?.id} onClose={() => setProfileEditorOpen(false)} onSave={saveProfile}/>}
    {onboardingOpen && profileReady && <Onboarding initialProfile={profile} onComplete={completeOnboarding} onSkip={skipOnboarding}/>}
  </main>;
}





