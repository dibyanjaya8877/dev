import { Clock3, LogOut, ShieldCheck } from "lucide-react";

export function PendingApproval({ name, onLogout, onRefresh }: { name: string; onLogout: () => void; onRefresh: () => void }) {
  return <section className="pending-page">
    <div className="pending-icon"><Clock3 size={30} /></div>
    <p className="eyebrow">Account under review</p>
    <h1>Hello, {name}</h1>
    <p>Your account is ready. An administrator needs to approve access before products, connections, messages, and video calls become available.</p>
    <div className="pending-note"><ShieldCheck size={19} /><span>You can safely return later. Your login remains active.</span></div>
    <div className="pending-actions"><button className="primary-button" onClick={onRefresh}>Check approval</button><button className="outline-button" onClick={onLogout}><LogOut size={17} /> Sign out</button></div>
  </section>;
}