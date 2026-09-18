"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Heart, X } from "lucide-react";

type User = { id: string; name: string; email: string; role: "admin" | "user"; approved: boolean };

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error ?? "The server could not complete this request.");
      onSuccess(data.user);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <span className="auth-mark"><Heart size={17} fill="currentColor" /> Pairly</span>
        <p className="eyebrow">{mode === "register" ? "Begin together" : "Welcome back"}</p>
        <h2 id="auth-title">{mode === "register" ? "Create your space" : "Continue your story"}</h2>
        <p className="modal-copy">Private conversations, thoughtful finds, and face time with your person.</p>
        <form onSubmit={submit}>
          {mode === "register" && <label>Name<input name="name" autoComplete="name" minLength={2} required placeholder="Your name" /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : 1} required placeholder="At least 8 characters" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}<ArrowRight size={17} /></button>
        </form>
        <button className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </section>
    </div>
  );
}