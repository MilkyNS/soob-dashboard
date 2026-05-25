"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong password");
        setPassword("");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="card-static p-8 w-full max-w-sm space-y-6"
      >
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold tracking-tight font-mono">
            SOOB Terminal
          </h1>
          <p className="text-sm text-zinc-500">Enter password to continue</p>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-sm
                       placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40
                       focus:ring-1 focus:ring-violet-500/20 transition-all"
          />

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all
                       bg-violet-600/80 hover:bg-violet-500/80 disabled:opacity-40
                       disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Enter"}
          </button>
        </div>
      </form>
    </div>
  );
}
