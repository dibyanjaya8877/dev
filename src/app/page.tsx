"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LoaderCircle, LogOut, MessageCircle, RefreshCw, Search, ShieldCheck, ShoppingBag, UserPlus, UserRound } from "lucide-react";
import { AdminPanel } from "@/components/AdminPanel";
import { AuthModal } from "@/components/AuthModal";
import { ChatRoom } from "@/components/ChatRoom";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";
import { PendingApproval } from "@/components/PendingApproval";

type User = { id: string; name: string; email: string; role: "admin" | "user"; approved: boolean; readReceipts?: boolean };
type View = "discover" | "connections" | "messages" | "profile" | "admin";

const catalog = [
  ["Wireless Earbuds", "Electronics", "1599", "photo-1606220945770-b5b6c2c55bf1"], ["Smart Watch", "Electronics", "2499", "photo-1546868871-7041f2a55e12"], ["Portable Speaker", "Electronics", "1299", "photo-1608043152269-423dbba4e7e1"], ["Laptop Backpack", "Accessories", "1799", "photo-1553062407-98eeb64c6a62"], ["Running Shoes", "Fashion", "2199", "photo-1542291026-7eec264c27ff"], ["Cotton T-Shirt", "Fashion", "699", "photo-1521572163474-6864f9cf17ab"], ["Leather Wallet", "Accessories", "999", "photo-1627123424574-724758594e93"], ["Sunglasses", "Accessories", "899", "photo-1511499767150-a48a237f0083"], ["Coffee Maker", "Home", "3499", "photo-1517668808822-9ebb02f2a0e6"], ["Desk Lamp", "Home", "1199", "photo-1507473885765-e6ed057f782c"], ["Ceramic Mug", "Home", "499", "photo-1514228742587-6b1558fcca3d"], ["Yoga Mat", "Fitness", "799", "photo-1601925260368-ae2f83cf8b7f"], ["Dumbbell Set", "Fitness", "1899", "photo-1583454110551-21f2fa2afe61"], ["Skin Care Set", "Beauty", "1399", "photo-1556228720-195a672e8a03"], ["Lipstick Set", "Beauty", "799", "photo-1586495777744-4413f21062fa"], ["Travel Suitcase", "Travel", "2999", "photo-1553531889-56cf51d0895d"], ["Water Bottle", "Lifestyle", "599", "photo-1602143407151-7111542de6e8"], ["Notebook", "Stationery", "349", "photo-1531346878377-a5be20888e57"], ["Gaming Mouse", "Gaming", "1499", "photo-1527814050087-3793815479db"], ["Bluetooth Keyboard", "Electronics", "1999", "photo-1587829741301-dc798b83add3"],
] as const;

const products = Array.from({ length: 120 }, (_, index) => {
  const [name, category, price, imageId] = catalog[index % catalog.length];
  const model = Math.floor(index / catalog.length) + 1;
  const displayName = model === 1 ? name : `${name} ${model}`;
  return { name: displayName, category, price: `₹${Number(price) + model * 100}`, image: `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=900&q=85`, href: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(displayName)}` };
});

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authPending, setAuthPending] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<View>("discover");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error("Session check failed.");
        const data = await response.json();
        if (!active) return;
        setUser(data.user ?? null);
        setSessionError(false);
      } catch {
        if (active) setSessionError(true);
      } finally {
        if (active) setAuthPending(false);
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, []);

  function navigate(next: View) {
    if (authPending || sessionError) return;
    if (next !== "discover" && !user) return setAuthOpen(true);
    setView(next);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSessionError(false);
    setView("discover");
  }

  async function refreshAccount() {
    setAuthPending(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Session check failed.");
      const data = await response.json();
      setUser(data.user ?? null);
      setSessionError(false);
      if (data.user?.approved) setView("discover");
    } catch {
      setSessionError(true);
    } finally {
      setAuthPending(false);
    }
  }

  const visibleProducts = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <header className="site-header">
      <button className="brand" onClick={() => setView("discover")}><ShoppingBag size={19} /><span>Marketly</span></button>
      {(!user || user.approved) && <nav className="desktop-nav" aria-label="Primary"><button className={view === "discover" ? "active" : ""} onClick={() => navigate("discover")}>Shop</button>{user?.approved && <button className={view === "connections" ? "active" : ""} onClick={() => navigate("connections")}>Connections</button>}{user?.approved && <button className={view === "messages" ? "active" : ""} onClick={() => navigate("messages")}>Messages</button>}{user?.role === "admin" && <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}>Admin</button>}</nav>}
      {authPending ? <div className="user-actions" aria-live="polite"><LoaderCircle size={20} aria-label="Restoring session" /></div> : user ? <div className="user-actions"><button className="user-chip" onClick={() => navigate("profile")}><span>{user.name[0].toUpperCase()}</span>{user.name}</button><button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></div> : sessionError ? <button className="primary-button compact" onClick={refreshAccount}><RefreshCw size={17} />Retry session</button> : <button className="primary-button compact" onClick={() => setAuthOpen(true)}>Sign in</button>}
    </header>

    <main>
      {user && !user.approved ? <PendingApproval name={user.name} onLogout={logout} onRefresh={refreshAccount} /> : <>
      {view === "discover" && <>
        <section className="intro-band"><div><p className="eyebrow">NEW SEASON, NEW FINDS</p><h1>Everyday finds.<br /><em>Better prices.</em></h1><p>Explore a wide selection of fashion, tech, home essentials, beauty, and more from across the web.</p></div><div className="featured-image"><Image src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=90" alt="Modern retail store with clothing displays" fill priority sizes="(max-width: 800px) 100vw, 48vw" /></div></section>
        <section className="shop-section">
          <div className="section-head"><div><p className="eyebrow">SHOP 120+ PRODUCTS</p><h2>Popular right now</h2></div><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" /></label></div>
          <div className="product-grid">{visibleProducts.map((product, index) => <a className="product-card" key={product.name} href={product.href} target="_blank" rel="noreferrer"><div className="product-image"><Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 80vw, 33vw" />{index < 3 && <span className="product-badge">Trending</span>}</div><div className="product-meta"><div><p>{product.category}</p><h3>{product.name}</h3></div><strong>{product.price}</strong></div></a>)}</div>
        </section>
      </>}
      {view === "connections" && user && <ConnectionsPanel currentUser={user} />}
      {view === "messages" && user && <ChatRoom currentUser={user} />}
      {view === "admin" && user?.role === "admin" && <AdminPanel />}
      {view === "profile" && user && <section className="profile-page"><span className="avatar profile-avatar">{user.name[0].toUpperCase()}</span><p className="eyebrow">Your Pairly account</p><h1>{user.name}</h1><p>{user.email}</p><button className="outline-button" onClick={logout}><LogOut size={17} /> Sign out</button></section>}
      </>}
    </main>

    {(!user || user.approved) && <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === "discover" ? "active" : ""} onClick={() => navigate("discover")}><ShoppingBag /><span>Discover</span></button>{user?.approved && <button className={view === "connections" ? "active" : ""} onClick={() => navigate("connections")}><UserPlus /><span>Connect</span></button>}{user?.approved && <button className={view === "messages" ? "active" : ""} onClick={() => navigate("messages")}><MessageCircle /><span>Messages</span></button>}{user?.role === "admin" ? <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}><ShieldCheck /><span>Admin</span></button> : user ? <button className={view === "profile" ? "active" : ""} onClick={() => navigate("profile")}><UserRound /><span>Profile</span></button> : null}</nav>}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={(account) => { setUser(account); setAuthPending(false); setSessionError(false); setAuthOpen(false); setView(account.role === "admin" ? "admin" : account.approved ? "connections" : "profile"); }} />}
  </>;
}