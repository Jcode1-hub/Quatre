"use client";

import Image from "next/image";
import { UserPlus } from "lucide-react";
import type { QuatreProfile } from "@/lib/profile";

type Person = { id: string; profile: QuatreProfile; avatar: string | null };
type Connection = { requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined"; created_at: string };

export function ConnectionList({ incoming, accepted, people, userId, onRespond }: {
  incoming: Connection[];
  accepted: Connection[];
  people: Person[];
  userId: string;
  onRespond: (personId: string, status: "accepted" | "declined") => void;
}) {
  const personById = new Map(people.map((person) => [person.id, person]));
  if (!incoming.length && !accepted.length) return <div className="community-empty"><span className="community-empty-mark"><UserPlus size={23}/></span><h2>No connection requests yet.</h2><p>When someone asks to connect, you can respond here.</p></div>;
  return <div className="connection-list">
    {incoming.map((row) => {
      const person = personById.get(row.requester_id);
      return <article className="connection-row" key={row.requester_id}>
        <div className="person-avatar small">{person?.avatar ? <Image src={person.avatar} alt="" width={48} height={48} unoptimized/> : <span>{person?.profile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div>
        <div className="connection-row-copy"><b>{person?.profile.displayName || "Quatre member"}</b><small>Sent a connection request</small></div>
        <button className="connection-accept" onClick={() => onRespond(row.requester_id, "accepted")}>Accept</button>
        <button className="connection-decline" onClick={() => onRespond(row.requester_id, "declined")}>Decline</button>
      </article>;
    })}
    {accepted.map((row) => {
      const otherId = row.requester_id === userId ? row.recipient_id : row.requester_id;
      const person = personById.get(otherId);
      return <article className="connection-row connection-established" key={otherId}>
        <div className="person-avatar small">{person?.avatar ? <Image src={person.avatar} alt="" width={48} height={48} unoptimized/> : <span>{person?.profile.displayName.charAt(0).toUpperCase() || "Q"}</span>}</div>
        <div className="connection-row-copy"><b>{person?.profile.displayName || "Quatre member"}</b><small>Connected</small></div>
      </article>;
    })}
  </div>;
}
