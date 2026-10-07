"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, ChevronRight, CircleUserRound, Flag, MessageCircle, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { profileFromRow, type QuatreProfile } from "@/lib/profile";
import { ConnectionList } from "@/features/community/ConnectionList";

type Person = { id: string; profile: QuatreProfile; avatar: string | null };
type Thread = { id: string; requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined" | "closed"; created_at: string };
type Message = { id: string; thread_id: string; sender_id: string; content: string; created_at: string };
type Connection = { requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined"; created_at: string };

export function CommunityHub({ userId, ownProfile, initialTab = "discover", focusThreadId, focusMessageId, onEditProfile }: { userId?: string; ownProfile: QuatreProfile; initialTab?: "discover" | "connections" | "messages"; focusThreadId?: string; focusMessageId?: string; onEditProfile: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [connectionRows, setConnectionRows] = useState<Connection[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, "pending" | "accepted" | "declined" | "received">>({});
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"discover" | "connections" | "messages" | "profile">("discover");
  const [compose, setCompose] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const requestMessageRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); setPeople([]); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { setLoading(false); return; }
    setLoading(true);
    try {
      const [profiles, threadRows, blocks, mutes, connectionRows] = await Promise.all([
        client.rpc("search_community_profiles", { search_term: search.trim() || null }),
        client.from("community_threads").select("id,requester_id,recipient_id,status,created_at").or("requester_id.eq." + userId + ",recipient_id.eq." + userId).order("created_at", { ascending: false }).limit(50),
        client.from("profile_blocks").select("blocked_id").eq("blocker_id", userId),
        client.from("profile_mutes").select("muted_id").eq("muter_id", userId),
        client.from("connections").select("requester_id,recipient_id,status").or("requester_id.eq." + userId + ",recipient_id.eq." + userId),
      ]);
      if (profiles.error) throw profiles.error;
      if (threadRows.error) throw threadRows.error;
      if (blocks.error) throw blocks.error;
      if (mutes.error) throw mutes.error;
      if (connectionRows.error) throw connectionRows.error;
      const normalized = await Promise.all(((profiles.data ?? []) as Record<string, unknown>[]).map(async (row) => {
        const profile = profileFromRow(row);
        let avatar = profile.avatarUrl;
        if (profile.avatarStoragePath) {
          const signed = await client.storage.from("quatre-avatars").createSignedUrl(profile.avatarStoragePath, 1800);
          avatar = signed.data?.signedUrl ?? null;
        }
        return { id: row.id as string, profile, avatar };
      }));
      const mutedSet = new Set(((mutes.data ?? []) as { muted_id: string }[]).map((row) => row.muted_id));
      setPeople(normalized.filter((person) => !mutedSet.has(person.id)));
      setThreads((threadRows.data ?? []) as Thread[]);
      setConnectionRows((connectionRows.data ?? []) as Connection[]);
      setBlockedIds(((blocks.data ?? []) as { blocked_id: string }[]).map((row) => row.blocked_id));
      setMutedIds(((mutes.data ?? []) as { muted_id: string }[]).map((row) => row.muted_id));
      const nextStatuses: Record<string, "pending" | "accepted" | "declined" | "received"> = {};
      for (const row of (connectionRows.data ?? []) as { requester_id: string; recipient_id: string; status: string }[]) {
        const otherId = row.requester_id === userId ? row.recipient_id : row.requester_id;
        nextStatuses[otherId] = row.status === "pending" && row.recipient_id === userId ? "received" : row.status as "pending" | "accepted" | "declined";
      }
      setConnectionStatus(nextStatuses);
      setConnectedIds(Object.entries(nextStatuses).filter(([, status]) => status === "accepted").map(([id]) => id));
    } catch {
      setNotice("Community couldnâ€™t load right now. Your workspace is still available.");
    } finally { setLoading(false); }
  }, [userId, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, search.trim() ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, search]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setTab(initialTab); setSelectedThread(null); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTab]);
  const openThread = useCallback(async (thread: Thread) => {
    setSelectedThread(thread);
    setMessages([]);
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data } = await client.from("community_messages").select("id,thread_id,sender_id,content,created_at").eq("thread_id", thread.id).order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function focusThread() {
      if (focusThreadId) {
        const thread = threads.find((item) => item.id === focusThreadId);
        if (thread) { setTab("messages"); if (selectedThread?.id !== thread.id) await openThread(thread); }
        return;
      }
      if (!focusMessageId || !userId) return;
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data } = await client.from("community_messages").select("thread_id").eq("id", focusMessageId).maybeSingle();
      if (cancelled || !data) return;
      const thread = threads.find((item) => item.id === data.thread_id);
      if (thread) { setTab("messages"); if (selectedThread?.id !== thread.id) await openThread(thread); }
    }
    void focusThread();
    return () => { cancelled = true; };
  }, [focusThreadId, focusMessageId, threads, selectedThread?.id, openThread, userId]);

  const filtered = useMemo(() => people, [people]);

  async function connect(person: Person) {
    if (!userId) { setNotice("Sign in to send a connection request."); return; }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("connections").insert({ requester_id: userId, recipient_id: person.id });
    if (result.error) { setNotice("This connection request couldnâ€™t be sent."); return; }
    setConnectionStatus((current) => ({ ...current, [person.id]: "pending" }));
    setNotice("Connection request sent.");
  }

  async function acceptConnection(personId: string) {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("connections").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("requester_id", personId).eq("recipient_id", userId);
    if (result.error) { setNotice("That connection request could not be accepted."); return; }
    setConnectionStatus((current) => ({ ...current, [personId]: "accepted" }));
    setConnectedIds((current) => [...new Set([...current, personId])]);
    setNotice("You’re connected.");
  }

  async function answerConnectionRequest(personId: string, status: "accepted" | "declined") {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("connections").update({ status, updated_at: new Date().toISOString() }).eq("requester_id", personId).eq("recipient_id", userId);
    if (result.error) { setNotice("That connection request could not be updated."); return; }
    setConnectionStatus((current) => ({ ...current, [personId]: status }));
    if (status === "accepted") setConnectedIds((current) => [...new Set([...current, personId])]);
    setConnectionRows((current) => current.map((row) => row.requester_id === personId && row.recipient_id === userId ? { ...row, status } : row));
    setNotice(status === "accepted" ? "You’re connected." : "Connection request declined.");
  }

  async function sendMessageRequest(person: Person) {
    if (!userId || !compose.trim()) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const created = await client.from("community_threads").insert({ requester_id: userId, recipient_id: person.id }).select("id,requester_id,recipient_id,status,created_at").single();
    if (created.error || !created.data) { setNotice("A message request couldnâ€™t be started."); return; }
    const sent = await client.from("community_messages").insert({ thread_id: created.data.id, sender_id: userId, content: compose.trim().slice(0, 4000) });
    if (sent.error) { setNotice("The request was created, but your message could not be sent."); return; }
    setCompose(""); setSelectedPerson(null); setTab("messages"); await refresh();
  }

  async function sendReply() {
    if (!userId || !selectedThread || !compose.trim()) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("community_messages").insert({ thread_id: selectedThread.id, sender_id: userId, content: compose.trim().slice(0, 4000) });
    if (result.error) { setNotice("Your message couldnâ€™t be sent."); return; }
    setCompose("");
    const latest = await client.from("community_messages").select("id,thread_id,sender_id,content,created_at").eq("thread_id", selectedThread.id).order("created_at", { ascending: true });
    setMessages((latest.data ?? []) as Message[]);
  }

  async function answerRequest(thread: Thread, status: "accepted" | "declined") {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("community_threads").update({ status, updated_at: new Date().toISOString() }).eq("id", thread.id);
    if (result.error) { setNotice("That message request couldnâ€™t be updated."); return; }
    await refresh();
    setSelectedThread({ ...thread, status });
  }

  async function block(person: Person) {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("profile_blocks").insert({ blocker_id: userId, blocked_id: person.id });
    if (result.error) { setNotice("This person couldnâ€™t be blocked."); return; }
    setPeople((current) => current.filter((item) => item.id !== person.id));
    setSelectedPerson(null);
    setNotice("This person is blocked and wonâ€™t appear in your Community.");
  }

  async function unblock(id: string) {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("profile_blocks").delete().eq("blocker_id", userId).eq("blocked_id", id);
    if (result.error) { setNotice("That block could not be removed."); return; }
    setBlockedIds((current) => current.filter((item) => item !== id));
    await refresh();
  }

  async function toggleMute(person: Person) {
    if (!userId) { setNotice("Sign in to manage muted profiles."); return; }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const isMuted = mutedIds.includes(person.id);
    const result = isMuted
      ? await client.from("profile_mutes").delete().eq("muter_id", userId).eq("muted_id", person.id)
      : await client.from("profile_mutes").insert({ muter_id: userId, muted_id: person.id });
    if (result.error) { setNotice("This profile’s mute setting could not be changed."); return; }
    setMutedIds((current) => isMuted ? current.filter((id) => id !== person.id) : [...current, person.id]);
    if (!isMuted) { setPeople((current) => current.filter((item) => item.id !== person.id)); setSelectedPerson(null); }
    setNotice(isMuted ? "Profile unmuted." : "Profile muted and hidden from discovery and your message list.");
  }

  async function unmute(id: string) {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("profile_mutes").delete().eq("muter_id", userId).eq("muted_id", id);
    if (result.error) { setNotice("That profile could not be unmuted."); return; }
    setMutedIds((current) => current.filter((item) => item !== id));
    await refresh();
  }

  async function report(person: Person) {
    if (!userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.from("community_reports").insert({ reporter_id: userId, reported_user_id: person.id, category: reportCategory, details: reportDetails.trim() || null });
    if (result.error) { setNotice("Your report couldnâ€™t be submitted."); return; }
    setReportOpen(false); setReportDetails(""); setSelectedPerson(null); setNotice("Thank you. Your report was submitted privately.");
  }

  const visibleThreads = threads.filter((thread) => !mutedIds.includes(thread.requester_id === userId ? thread.recipient_id : thread.requester_id));
  const incomingConnections = connectionRows.filter((row) => row.recipient_id === userId && row.status === "pending");
  const activeConnections = connectionRows.filter((row) => row.status === "accepted");
  const personForThread = (thread: Thread) => people.find((person) => person.id === (thread.requester_id === userId ? thread.recipient_id : thread.requester_id));
  const canMessage = (person: Person) => person.profile.contactPolicy === "requests" || (person.profile.contactPolicy === "connections" && connectedIds.includes(person.id));
  return <div className="community-page">
    <header className="community-header"><div><p className="eyebrow">QUATRE Â· PEOPLE</p><h1>Community<span>.</span></h1><p>Find people who can help, and people you can help.</p></div><button className="community-profile-shortcut" onClick={onEditProfile}><CircleUserRound size={16}/> Your profile <ArrowUpRight size={14}/></button></header>
    <nav className="community-tabs" aria-label="Community sections"><button aria-current={tab === "discover" ? "page" : undefined} onClick={() => { setTab("discover"); setSelectedThread(null); }}><Users size={15}/> Discover</button><button aria-current={tab === "connections" ? "page" : undefined} onClick={() => { setTab("connections"); setSelectedThread(null); }}><UserPlus size={15}/> Connections{incomingConnections.length > 0 && <i>{incomingConnections.length}</i>}</button><button aria-current={tab === "messages" ? "page" : undefined} onClick={() => { setTab("messages"); setSelectedPerson(null); }}><MessageCircle size={15}/> Messages{threads.filter((thread) => thread.status === "pending" && thread.recipient_id === userId).length > 0 && <i>{threads.filter((thread) => thread.status === "pending" && thread.recipient_id === userId).length}</i>}</button><button aria-current={tab === "profile" ? "page" : undefined} onClick={() => setTab("profile")}><CircleUserRound size={15}/> My profile</button></nav>
    {notice && <p className="community-notice" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14}/></button></p>}
    {tab === "discover" && <section className="community-discover"><div className="community-section-title"><div><p className="eyebrow">A PLACE TO FIND YOUR PEOPLE</p><h2>Shared curiosity starts here.</h2><p>Discover people through what they do and care aboutâ€”not where they live.</p></div></div><label className="community-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, interests, or skills" aria-label="Search community profiles"/></label>
      {loading ? <div className="community-loading" role="status"><span/>Finding your communityâ€¦</div> : !userId ? <div className="community-empty"><span className="community-empty-mark"><Users size={24}/></span><h2>Meet people in Quatre.</h2><p>Sign in to discover members who have chosen to share their profile.</p></div> : filtered.length === 0 ? <div className="community-empty"><span className="community-empty-mark"><Users size={24}/></span><h2>{search ? "No one found just yet." : "Your community is still taking shape."}</h2><p>{search ? "Try a different name, interest, or skill." : "Invite people who are building, learning, and creating with you. Only opted-in profiles appear here."}</p><button className="community-empty-action" onClick={onEditProfile}>Set up your profile <ChevronRight size={15}/></button></div> : <div className="people-list">{filtered.map((person) => <article className="person-card" key={person.id} onClick={() => setSelectedPerson(person)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedPerson(person); }}><div className="person-avatar">{person.avatar ? <Image src={person.avatar} alt="" width={48} height={48} unoptimized/> : <span>{person.profile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div><div className="person-copy"><h3>{person.profile.displayName || "Quatre member"}{person.profile.username && <small>@{person.profile.username}</small>}</h3><p>{person.profile.occupation || person.profile.roles[0] || "Community member"}{person.profile.region ? " Â· " + person.profile.region : ""}</p>{person.profile.bio && <blockquote>{person.profile.bio}</blockquote>}<div className="person-tags">{[...person.profile.roles, ...person.profile.interests, ...person.profile.skills].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div></div><button className="person-open" aria-label={"View " + (person.profile.displayName || "member") + " profile"} onClick={(event) => { event.stopPropagation(); setSelectedPerson(person); }}><ChevronRight size={17}/></button></article>)}</div>}
    </section>}
    {tab === "connections" && <section className="community-connections"><div className="community-section-title"><div><p className="eyebrow">YOUR COMMUNITY</p><h2>Connections</h2><p>Requests and people you have chosen to connect with.</p></div></div><ConnectionList incoming={incomingConnections} accepted={activeConnections} people={people} userId={userId ?? ""} onRespond={(id, status) => void answerConnectionRequest(id, status)}/></section>}
    {tab === "messages" && <section className="community-messages"><div className="community-section-title"><div><p className="eyebrow">YOUR CONVERSATIONS</p><h2>Messages</h2><p>Message requests give you control over who can start a conversation.</p></div></div>{selectedThread ? <div className="thread-view"><header><button className="thread-back" onClick={() => setSelectedThread(null)}><ArrowLeft size={15}/> All messages</button><b>{personForThread(selectedThread)?.profile.displayName || "Quatre member"}</b><span>{selectedThread.status === "pending" ? selectedThread.recipient_id === userId ? "Message request" : "Waiting for a reply" : selectedThread.status}</span></header>{selectedThread.status === "pending" && selectedThread.recipient_id === userId && <div className="request-banner"><p>This person would like to message you. Accept to continue the conversation.</p><button onClick={() => void answerRequest(selectedThread, "accepted")}>Accept</button><button onClick={() => void answerRequest(selectedThread, "declined")}>Decline</button></div>}<div className="thread-messages">{messages.map((message) => <p className={message.sender_id === userId ? "thread-message-own" : ""} key={message.id}>{message.content}<small>{new Date(message.created_at).toLocaleString()}</small></p>)}</div>{selectedThread.status === "accepted" && <div className="thread-compose"><textarea value={compose} onChange={(event) => setCompose(event.target.value)} maxLength={4000} rows={2} aria-label="Write a message" placeholder="Write a thoughtful messageâ€¦"/><button disabled={!compose.trim()} aria-label="Send message" onClick={() => void sendReply()}><ArrowUpRight size={17}/></button></div>}</div> : visibleThreads.length === 0 ? <div className="community-empty"><span className="community-empty-mark"><MessageCircle size={23}/></span><h2>No messages yet.</h2><p>When someone sends you a message request, youâ€™ll find it here.</p></div> : <div className="thread-list">{visibleThreads.map((thread) => { const person = personForThread(thread); return <button className="thread-row" key={thread.id} onClick={() => void openThread(thread)}><div className="person-avatar small">{person?.avatar ? <Image src={person.avatar} alt="" width={48} height={48} unoptimized/> : <span>{person?.profile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div><span><b>{person?.profile.displayName || "Quatre member"}</b><small>{thread.status === "pending" && thread.recipient_id === userId ? "Message request" : thread.status}</small></span><ChevronRight size={16}/></button>; })}</div>}</section>}
    {tab === "profile" && <section className="my-profile-view"><div className="my-profile-heading"><p className="eyebrow">YOUR PLACE IN QUATRE</p><h2>Your profile</h2><button className="community-profile-shortcut" onClick={onEditProfile}>Edit profile <ArrowUpRight size={14}/></button></div><div className="own-profile-card"><div className="own-profile-mark">{ownProfile.avatarUrl ? <Image src={ownProfile.avatarUrl} alt="" width={72} height={72} unoptimized/> : <span>{ownProfile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div><div><h3>{ownProfile.displayName || "Your name"} {ownProfile.username && <small>@{ownProfile.username}</small>}</h3><p>{ownProfile.occupation || ownProfile.roles[0] || "Add what you do"}{ownProfile.region && " Â· " + ownProfile.region}</p>{ownProfile.bio && <blockquote>{ownProfile.bio}</blockquote>}<div className="person-tags">{[...ownProfile.roles, ...ownProfile.interests, ...ownProfile.skills].slice(0, 12).map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><div className="profile-privacy-note"><ShieldCheck size={17}/><p><b>{ownProfile.communityVisible ? "Visible in Community" : "Private by default"}</b><small>{ownProfile.communityVisible ? "People can find your profile through shared interests. Your email and exact location are never shown." : "Only you can see this profile until you choose to make it discoverable."}</small></p></div>{mutedIds.length > 0 && <div className="blocked-profiles"><b>Muted profiles</b>{mutedIds.map((id) => <div key={id}><span>Private member</span><button onClick={() => void unmute(id)}>Unmute</button></div>)}</div>}{blockedIds.length > 0 && <div className="blocked-profiles"><b>Blocked profiles</b>{blockedIds.map((id) => <div key={id}><span>Private member</span><button onClick={() => void unblock(id)}>Unblock</button></div>)}</div>}</section>}
    {selectedPerson && <div className="community-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPerson(null); }}><section className="person-detail" role="dialog" aria-modal="true" aria-labelledby="person-detail-name"><button className="detail-close" aria-label="Close profile" onClick={() => setSelectedPerson(null)}><X size={17}/></button><div className="person-avatar detail-avatar">{selectedPerson.avatar ? <Image src={selectedPerson.avatar} alt="" width={56} height={56} unoptimized/> : <span>{selectedPerson.profile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div><p className="eyebrow">QUATRE COMMUNITY</p><h2 id="person-detail-name">{selectedPerson.profile.displayName || "Quatre member"}</h2>{selectedPerson.profile.username && <p className="person-username">@{selectedPerson.profile.username}</p>}<p className="person-role">{selectedPerson.profile.occupation || selectedPerson.profile.roles[0] || "Community member"}{selectedPerson.profile.region && " Â· " + selectedPerson.profile.region}</p>{selectedPerson.profile.bio && <blockquote>{selectedPerson.profile.bio}</blockquote>}<div className="detail-tags">{[...selectedPerson.profile.roles, ...selectedPerson.profile.interests, ...selectedPerson.profile.skills].map((tag) => <span key={tag}>{tag}</span>)}</div><div className="person-actions"><button className="onboarding-primary" disabled={Boolean(connectionStatus[selectedPerson.id])} onClick={() => connectionStatus[selectedPerson.id] === "received" ? void acceptConnection(selectedPerson.id) : void connect(selectedPerson)}><UserPlus size={15}/>{connectionStatus[selectedPerson.id] === "accepted" ? "Connected" : connectionStatus[selectedPerson.id] === "pending" ? "Request sent" : connectionStatus[selectedPerson.id] === "received" ? "Accept request" : connectionStatus[selectedPerson.id] === "declined" ? "Request declined" : "Connect"}</button>{canMessage(selectedPerson) && <button className="secondary-action" onClick={() => requestMessageRef.current?.focus()}><MessageCircle size={15}/> Message</button>}</div>{selectedPerson.profile.contactPolicy === "connections" && !canMessage(selectedPerson) && <p className="connection-required">Connect first to send a message request.</p>}{canMessage(selectedPerson) && <div className="message-request-compose"><label>Start with a message<textarea ref={requestMessageRef} rows={2} maxLength={4000} value={compose} onChange={(event) => setCompose(event.target.value)} placeholder="Say hello and share what you have in common"/></label><button disabled={!compose.trim()} onClick={() => void sendMessageRequest(selectedPerson)}>Send request</button></div>}<div className="detail-safety"><button onClick={() => setReportOpen(true)}><Flag size={14}/> Report</button><button onClick={() => void toggleMute(selectedPerson)}><CircleUserRound size={14}/> {mutedIds.includes(selectedPerson.id) ? "Unmute" : "Mute"}</button><button onClick={() => void block(selectedPerson)}><ShieldCheck size={14}/> Block</button></div></section></div>}
    {reportOpen && selectedPerson && <div className="community-overlay community-report-overlay" role="presentation"><section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-heading"><button className="detail-close" aria-label="Close report" onClick={() => setReportOpen(false)}><X size={17}/></button><p className="eyebrow">COMMUNITY SAFETY</p><h2 id="report-heading">Report this profile</h2><p>Your report is private. The person you report wonâ€™t see who sent it.</p><label>What happened?<select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="harassment">Harassment</option><option value="impersonation">Impersonation</option><option value="private_information">Private information</option><option value="scam">Scam or exploitation</option><option value="other">Something else</option></select></label><label>Anything else? <span>optional</span><textarea maxLength={1200} rows={4} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Share only what helps us understand the concern."/></label><button className="onboarding-primary report-submit" onClick={() => void report(selectedPerson)}>Send private report</button></section></div>}
  </div>;
}







