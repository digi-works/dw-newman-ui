"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError("Incorrect password. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const next = searchParams.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="app-wrapper"
      style={{
        height: "100vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        background: "var(--bg-page)",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "380px",
          margin: "auto 0",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <img
          src="/newman-logo.svg"
          alt="Newman University"
          style={{ height: "40px", width: "auto", marginBottom: "12px" }}
        />

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "22px",
            fontWeight: 600,
            color: "var(--text-main)",
            margin: 0,
          }}
        >
          Restricted access
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: "0 0 20px 0" }}>
          Enter the access password to continue to Newman Assistant.
        </p>

        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: "14px",
            borderRadius: "8px",
            border: `1px solid ${error ? "#dc2626" : "var(--border-color)"}`,
            background: "var(--input-bg)",
            color: "var(--text-main)",
            outline: "none",
            marginBottom: "8px",
          }}
        />

        {error && (
          <span style={{ fontSize: "13px", color: "#dc2626", marginBottom: "8px" }}>{error}</span>
        )}

        <button
          type="submit"
          disabled={!password.trim() || isSubmitting}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "8px",
            borderRadius: "8px",
            border: "none",
            background: "var(--navy)",
            opacity: !password.trim() || isSubmitting ? 0.5 : 1,
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "14px",
            cursor: !password.trim() || isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateForm />
    </Suspense>
  );
}
