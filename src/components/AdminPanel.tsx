"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";

type ManagedUser = { id: string; name: string; email: string; role: "admin" | "user"; approved: boolean; createdAt?: string };

export function AdminPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/users").then((response) => response.json()).then((data) => {
      setUsers(data.users ?? []);
      setLoading(false);
    });
  }, []);

  async function setApproval(userId: string, approved: boolean) {
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, approved }) });
    if (response.ok) setUsers((current) => current.map((user) => user.id === userId ? { ...user, approved } : user));
  }

  async function deleteUser(member: ManagedUser) {
    if (!window.confirm(`Permanently delete ${member.name}'s account, messages, connections, and call history? This cannot be undone.`)) return;
    const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.id }) });
    if (response.ok) setUsers((current) => current.filter((user) => user.id !== member.id));
  }

  const pendingCount = users.filter((user) => user.role !== "admin" && !user.approved).length;

  return <section className="portal-page admin-page">
    <div className="portal-title"><div><p className="eyebrow"><ShieldCheck size={15} /> Administration</p><h1>Member access</h1><p>Review accounts before they can connect, message, or start calls.</p></div><div className="admin-stat"><strong>{pendingCount}</strong><span>waiting</span></div></div>
    <div className="admin-table" aria-live="polite">
      {loading ? <p className="empty-copy">Loading members...</p> : users.map((member) => <article className="admin-row" key={member.id}>
        <span className="avatar">{member.name[0]?.toUpperCase()}</span>
        <div className="admin-identity"><strong>{member.name}</strong><span>{member.email}</span></div>
        <span className={`access-state ${member.approved ? "approved" : "pending"}`}>{member.approved ? <><Check size={14} /> Approved</> : "Pending"}</span>
        {member.role === "admin" ? <span className="admin-label">Admin</span> : <div className="admin-actions">{member.approved ? <button className="revoke-button" onClick={() => setApproval(member.id, false)}><UserX size={17} /> Revoke</button> : <button className="approve-button" onClick={() => setApproval(member.id, true)}><UserCheck size={17} /> Approve</button>}<button className="revoke-button" onClick={() => void deleteUser(member)}><Trash2 size={17} /> Delete</button></div>}
      </article>)}
    </div>
  </section>;
}