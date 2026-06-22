"use client";

import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quem está disponível na segunda-feira?",
  "Analisa a viabilidade dos projetos quentes",
  "Quais consultores sênior têm dias livres?",
  "Tem algum conflito nas alocações confirmadas?",
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "11px 16px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isUser ? "var(--red)" : "var(--surface)",
          color: isUser ? "#fff" : "var(--text)",
          fontSize: 14,
          lineHeight: 1.65,
          border: isUser ? "none" : "1px solid var(--border)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const newHistory: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: newHistory }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setMessages([...newHistory, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      setError(err.message ?? "Erro ao processar sua pergunta");
      // Roll back the optimistic user message on network failure
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function useSuggestion(text: string) {
    setInput(text);
    textareaRef.current?.focus();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Agente de Alocação</div>
          <div className="topbar-sub" style={{ color: "var(--muted)", fontSize: 12 }}>
            Pergunte sobre disponibilidade, conflitos e viabilidade de projetos
          </div>
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setMessages([]); setError(null); }}
          >
            Nova conversa
          </button>
        )}
      </div>

      <div
        className="page-content"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 57px)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 8px" }}>

          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "52px 20px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
                Agente de Alocação
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 460, margin: "0 auto", lineHeight: 1.65 }}>
                Analiso disponibilidade, detecto conflitos e sugiro times para seus projetos.
                Faça perguntas em linguagem natural.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => useSuggestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
              <div
                style={{
                  padding: "11px 16px",
                  borderRadius: "18px 18px 18px 4px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--red)",
                    animation: "pulse 1.2s ease-in-out infinite",
                  }}
                />
                Consultando dados e analisando...
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                margin: "8px 0 14px",
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fff0f0",
                border: "1px solid #f5c6cb",
                fontSize: 13,
                color: "#c0392b",
              }}
            >
              ❌ {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "12px 28px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={textareaRef}
            className="form-input"
            style={{
              flex: 1,
              resize: "none",
              minHeight: 44,
              lineHeight: 1.55,
              paddingTop: 10,
              paddingBottom: 10,
              overflow: "hidden",
            }}
            placeholder="Pergunte sobre alocações, disponibilidade, projetos… (Enter para enviar)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
          />
          <button
            className="btn btn-primary"
            onClick={send}
            disabled={!input.trim() || loading}
            style={{ height: 44, minWidth: 80, flexShrink: 0 }}
          >
            {loading ? "..." : "Enviar"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
