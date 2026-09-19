"use client";

import { useEffect, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";

type User = { id: string; name: string; email: string };
type FriendRequest = { id: string; senderId: string; recipientId: string; status: "pending" | "accepted" | "rejected" };

export function ConnectionsPanel({ currentUser }: { currentUser: User }) {
  const [people, setPeople] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  async function load() {
    const [usersResponse, requestsResponse] = await Promise.all([fetch("/api/users"), fetch("/api/friends")]);
    const [usersData, requestsData] = await Promise.all([usersResponse.json(), requestsResponse.json()]);
    setPeople(usersData.users ?? []);
    setRequests(requestsData.requests ?? []);
  }

  useEffect(() => {
    Promise.all([fetch("/api/users"), fetch("/api/friends")])
      .then(([usersResponse, requestsResponse]) => Promise.all([usersResponse.json(), requestsResponse.json()]))
      .then(([usersData, requestsData]) => {
        setPeople(usersData.users ?? []);
        setRequests(requestsData.requests ?? []);
      });
  }, []);

  async function send(recipientId: string) {
    if (sendingTo) return;
    setSendingTo(recipientId);
    try {
      const response = await fetch("/api/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId }) });
      if (response.ok || response.status === 409) await load();
    } finally {
      setSendingTo(null);
    }
  }

  async function respond(requestId: string, action: "accept" | "reject") {
    const response = await fetch(`/api/friends/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (response.ok) await load();
  }

  function requestFor(userId: string) { return requests.find((request) => request.senderId === userId || request.recipientId === userId); }
  const filteredPeople = people.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase()));

  return <section className="portal-page connections-page">
    <div className="portal-title"><div><p className="eyebrow">Your people</p><h1>Connections</h1><p>Connect first. Once accepted, private chat and video calling are unlocked.</p></div></div>
    <label className="connection-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by name or email" aria-label="Find users" /></label>
    <div className="connections-grid">{filteredPeople.map((person) => {
      const request = requestFor(person.id);
      const incoming = request?.status === "pending" && request.recipientId === currentUser.id;
      return <article className="connection-card" key={person.id}><span className="avatar connection-avatar">{person.name[0].toUpperCase()}</span><div><h2>{person.name}</h2><p>{person.email}</p></div>
        {!request && <button className="primary-button" disabled={sendingTo === person.id} onClick={() => void send(person.id)}><UserPlus size={17} /> {sendingTo === person.id ? "Sending..." : "Connect"}</button>}
        {request?.status === "accepted" && <span className="connected-label"><Check size={16} /> Connected</span>}
        {request?.status === "pending" && !incoming && <span className="waiting-label">Request sent</span>}
        {incoming && <div className="request-actions"><button className="approve-button" onClick={() => respond(request.id, "accept")}><Check size={17} /> Accept</button><button className="revoke-button" onClick={() => respond(request.id, "reject")}><X size={17} /> Decline</button></div>}
        {request?.status === "rejected" && <span className="waiting-label">Request declined</span>}
      </article>;
    })}</div>
    {filteredPeople.length === 0 && <p className="empty-copy">{query ? "No matching approved user found." : "No other approved members yet."}</p>}
  </section>;
}