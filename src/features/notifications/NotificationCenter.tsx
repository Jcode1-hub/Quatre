"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, MessageCircle, Users, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { groupNotifications, notificationCategory, type QuatreNotification } from "@/lib/notifications";

export function NotificationCenter({ userId, onOpenNotification }: { userId?: string; onOpenNotification: (notification: QuatreNotification) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuatreNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true);
    const { data, error: queryError } = await client.from("notifications")
      .select("id,actor_id,type,title,body,href,source_id,read_at,created_at")
      .order("created_at", { ascending: false }).limit(60);
    if (queryError) setError("Notifications couldn’t be loaded.");
    else { setError(""); setItems((data ?? []) as QuatreNotification[]); }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { void refresh(); }, 45_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); window.removeEventListener("focus", onFocus); };
  }, [refresh, userId]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const notificationItems = userId ? items : [];
  const unreadCount = notificationItems.filter((item) => !item.read_at).length;

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await client.from("notifications").update({ read_at: readAt }).eq("recipient_id", userId).is("read_at", null);
    if (updateError) { setError("Notifications couldn’t be updated."); return; }
    setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
  }

  async function openNotification(notification: QuatreNotification) {
    if (!notification.read_at && userId) {
      const client = getSupabaseBrowserClient();
      if (client) {
        const readAt = new Date().toISOString();
        const { error: updateError } = await client.from("notifications").update({ read_at: readAt }).eq("id", notification.id).eq("recipient_id", userId);
        if (!updateError) setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
      }
    }
    close();
    onOpenNotification(notification);
  }

  return <div className="notification-root" ref={rootRef}>
    <button ref={triggerRef} className="icon-button notification-trigger" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} aria-controls="quatre-notifications" onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }}>
      <Bell size={17}/>{unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {open && <>
      <button className="notification-mobile-scrim" aria-label="Close notifications" onClick={close}/>
      <section id="quatre-notifications" ref={panelRef} className="notification-panel" role="dialog" aria-modal="false" aria-labelledby="notifications-heading" tabIndex={-1}>
        <header className="notification-panel-header"><div><p className="eyebrow">YOUR QUATRE</p><h2 id="notifications-heading">Notifications</h2></div><div>{unreadCount > 0 && <button className="notification-mark-all" onClick={() => void markAllRead()}><CheckCheck size={14}/> Mark all read</button>}<button className="icon-button notification-close" aria-label="Close notifications" onClick={close}><X size={17}/></button></div></header>
        {!userId ? (
          <div className="notification-empty"><span><Bell size={19}/></span><p>Sign in to keep up with your connections.</p></div>
        ) : loading && notificationItems.length === 0 ? (
          <div className="notification-empty" role="status"><p>Loading notifications...</p></div>
        ) : error && notificationItems.length === 0 ? (
          <div className="notification-empty"><p role="alert">{error}</p><button onClick={() => void refresh()}>Try again</button></div>
        ) : notificationItems.length === 0 ? (
          <div className="notification-empty"><span><CheckCheck size={19}/></span><h3>You&apos;re all caught up.</h3><p>When someone reaches out, you&apos;ll find it here.</p></div>
        ) : (
          <div className="notification-list">
            {groupNotifications(notificationItems).map((group) => <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((notification) => <button key={notification.id} className={`notification-item ${notification.read_at ? "" : "notification-unread"}`} aria-label={`${notification.read_at ? "" : "Unread. "}${notification.title}. ${notification.body}. ${notificationCategory(notification.type)}`} onClick={() => void openNotification(notification)}>
                <span className="notification-item-icon">{notificationCategory(notification.type) === "Messages" ? <MessageCircle size={15}/> : notificationCategory(notification.type) === "Community" ? <Users size={15}/> : <Bell size={15}/>}</span>
                <span className="notification-item-copy"><span className="notification-item-category">{notificationCategory(notification.type)}</span><b>{notification.title}</b><span>{notification.body}</span><time dateTime={notification.created_at}>{new Intl.DateTimeFormat(undefined, group.label === "Earlier" ? { dateStyle: "medium" } : { hour: "numeric", minute: "2-digit" }).format(new Date(notification.created_at))}</time></span>
                {!notification.read_at && <i aria-label="Unread"/>}
              </button>)}
            </section>)}
          </div>
        )}
      </section>
    </>}
  </div>;
}
