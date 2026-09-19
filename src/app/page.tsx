"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Heart, LoaderCircle, LogOut, MessageCircle, RefreshCw, Search, ShieldCheck, ShoppingBag, Sparkles, UserPlus, UserRound } from "lucide-react";
import { AdminPanel } from "@/components/AdminPanel";
import { AuthModal } from "@/components/AuthModal";
import { ChatRoom } from "@/components/ChatRoom";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";
import { PendingApproval } from "@/components/PendingApproval";

type User = { id: string; name: string; email: string; role: "admin" | "user"; approved: boolean };
type View = "discover" | "connections" | "messages" | "profile" | "admin";

const products = [
  { name: "Our Story Journal", category: "Keepsakes", price: "₹899", image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=85" },
  { name: "Rose Glow Makeup Kit", category: "Makeup", price: "₹1,299", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85" },
  { name: "Velvet Lip Trio", category: "Makeup", price: "₹799", image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=900&q=85" },
  { name: "Everyday Eyeshadow Palette", category: "Makeup", price: "₹999", image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=85" },
  { name: "Glass Skin Ritual", category: "Skincare", price: "₹1,599", image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=85" },
  { name: "Blush & Highlight Duo", category: "Makeup", price: "₹649", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=85" },
  { name: "Floral Eau de Parfum", category: "Fragrance", price: "₹1,899", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=85" },
  { name: "Satin Scrunchie Set", category: "Accessories", price: "₹399", image: "https://images.unsplash.com/photo-1590159983013-d4ff5fc71c1d?auto=format&fit=crop&w=900&q=85" },
  { name: "Mini Jewellery Box", category: "Accessories", price: "₹849", image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=85" },
  { name: "Two of Us Mugs", category: "Home", price: "₹749", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85" },
  { name: "Date Night Cards", category: "Experiences", price: "₹599", image: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=85" },
  { name: "Minimal Pair Bands", category: "Jewellery", price: "₹1,499", image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=85" },
  { name: "Pearl Drop Earrings", category: "Jewellery", price: "₹1,099", image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85" },
  { name: "Everyday Shoulder Bag", category: "Fashion", price: "₹1,799", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85" },
  { name: "Cozy Self-Care Hamper", category: "Wellness", price: "₹1,499", image: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85" },
  { name: "Vanity Mirror with Lights", category: "Beauty", price: "₹2,299", image: "https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=900&q=85" },
  { name: "Pocket Photo Printer", category: "Gadgets", price: "₹3,299", image: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=900&q=85" },
  { name: "Sunday Picnic Set", category: "Experiences", price: "₹1,199", image: "https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=900&q=85" },
];

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
      <button className="brand" onClick={() => setView("discover")}><Heart size={19} fill="currentColor" /><span>Pairly</span></button>
      {(!user || user.approved) && <nav className="desktop-nav" aria-label="Primary"><button className={view === "discover" ? "active" : ""} onClick={() => navigate("discover")}>Discover</button>{user?.approved && <button className={view === "connections" ? "active" : ""} onClick={() => navigate("connections")}>Connections</button>}{user?.approved && <button className={view === "messages" ? "active" : ""} onClick={() => navigate("messages")}>Messages</button>}{user?.role === "admin" && <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}>Admin</button>}</nav>}
      {authPending ? <div className="user-actions" aria-live="polite"><LoaderCircle size={20} aria-label="Restoring session" /></div> : user ? <div className="user-actions"><button className="user-chip" onClick={() => navigate("profile")}><span>{user.name[0].toUpperCase()}</span>{user.name}</button><button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></div> : sessionError ? <button className="primary-button compact" onClick={refreshAccount}><RefreshCw size={17} />Retry session</button> : <button className="primary-button compact" onClick={() => setAuthOpen(true)}>Join Pairly</button>}
    </header>

    <main>
      {user && !user.approved ? <PendingApproval name={user.name} onLogout={logout} onRefresh={refreshAccount} /> : <>
      {view === "discover" && <>
        <section className="intro-band"><div><p className="eyebrow"><Sparkles size={14} /> Made for two</p><h1>Little things that<br /><em>feel like us.</em></h1><p>Discover thoughtful finds for ordinary days, big milestones, and every inside joke in between.</p></div><div className="featured-image"><Image src="https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1400&q=90" alt="A couple sharing a quiet moment outdoors" fill priority sizes="(max-width: 800px) 100vw, 48vw" /></div></section>
        <section className="shop-section">
          <div className="section-head"><div><p className="eyebrow">The couple edit</p><h2>Picked for your story</h2></div><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gifts & moments" aria-label="Search products" /></label></div>
          <div className="product-grid">{visibleProducts.map((product, index) => <article className="product-card" key={product.name}><div className="product-image"><Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 80vw, 33vw" /><button className="save-button" aria-label={`Save ${product.name}`}><Heart size={17} /></button>{index === 0 && <span className="product-badge">Most loved</span>}</div><div className="product-meta"><div><p>{product.category}</p><h3>{product.name}</h3></div><strong>{product.price}</strong></div></article>)}</div>
        </section>
        {!user && <section className="connection-band"><div><p className="eyebrow">Closer, wherever you are</p><h2>Your private corner,<br />made for two.</h2></div><p>Create an account to message and video call your person from one calm, private place.</p><button className="light-button" onClick={() => setAuthOpen(true)}>Create your space</button></section>}
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