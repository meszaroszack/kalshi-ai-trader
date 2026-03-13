import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Power, Key, Trash2, Brain, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange, min, max, step, prefix, suffix }: any) {
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <input type="number" min={min} max={max} step={step ?? 1} value={value ?? ""}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-20 px-2 py-1.5 rounded-md text-sm font-mono text-right bg-muted border border-border focus:outline-none focus:border-primary text-foreground"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function SegmentedControl({ options, value, onChange }: any) {
  return (
    <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
      {options.map((o: any) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}>{o.label}</button>
      ))}
    </div>
  );
}

function Section({ title, children, icon }: any) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { data: creds } = useQuery<any>({ queryKey: ["/api/credentials"] });

  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [env, setEnv] = useState("production");
  const [credMsg, setCredMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [pxKey, setPxKey] = useState("");
  const [pxMsg, setPxMsg] = useState("");
  const [showPxKey, setShowPxKey] = useState(false);

  // Draft state for save-button pattern
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);

  const updateSettings = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });
  const toggleBot = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/bot/toggle", { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/settings"] }),
  });
  const deleteCreds = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/credentials"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/credentials"] }); setCredMsg("Cleared."); },
  });

  async function saveCreds(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setCredMsg("");
    try {
      const res = await fetch("/api/credentials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId, privateKeyPem: privateKey, environment: env }),
      });
      const json = await res.json();
      if (json.success) { setCredMsg(`Connected — balance $${json.balance?.toFixed(2)}`); qc.invalidateQueries({ queryKey: ["/api/credentials"] }); setApiKeyId(""); setPrivateKey(""); }
      else setCredMsg("Error: " + (json.error ?? "unknown"));
    } catch (e: any) { setCredMsg("Error: " + e.message); }
    setSaving(false);
  }

  async function savePerplexityKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch("/api/settings/perplexity-key", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: pxKey }),
      });
      setPxMsg("Saved."); setPxKey(""); qc.invalidateQueries({ queryKey: ["/api/settings"] });
    } catch { setPxMsg("Error saving key"); }
  }

  const s = settings ?? {};
  const botOn = s.enabled ?? false;
  const hasKey = s.perplexityApiKey && s.perplexityApiKey !== "null";
  const hasDraft = Object.keys(draft).length > 0;

  // Get display value: draft overrides loaded settings
  function val(key: string) {
    return key in draft ? draft[key] : s[key];
  }
  function setDraftField(key: string, value: any) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function saveAll() {
    updateSettings.mutate(draft);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/"><button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"><ArrowLeft size={16} /></button></Link>
          <span className="text-sm font-semibold">Settings</span>
          <span className="text-xs text-muted-foreground ml-1">v{s.settingsVersion ?? 1}</span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-3">

        {/* Bot toggle */}
        <Section title="Bot">
          <Field label="Status" hint={botOn ? "AI actively trading" : "Stopped"}>
            <button onClick={() => toggleBot.mutate(!botOn)}
              className={cn("flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all",
                botOn ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                      : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
              )}>
              <Power size={13} /> {botOn ? "Stop Bot" : "Start Bot"}
            </button>
          </Field>
        </Section>

        {/* Perplexity API key */}
        <Section title="Perplexity AI" icon={<Brain size={13} className="text-purple-400" />}>
          {hasKey ? (
            <Field label="API Key" hint="sonar-pro · real-time web search enabled">
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-mono">••••••••</span>
                <button onClick={() => { updateSettings.mutate({ perplexityApiKey: null }); qc.invalidateQueries({ queryKey: ["/api/settings"] }); }}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Remove</button>
              </div>
            </Field>
          ) : (
            <form onSubmit={savePerplexityKey} className="py-3 space-y-2">
              <p className="text-xs text-muted-foreground">Enter your Perplexity API key from <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="text-primary underline">perplexity.ai/settings/api</a></p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type={showPxKey ? "text" : "password"} placeholder="pplx-..." value={pxKey} onChange={e => setPxKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-muted border border-border focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground pr-9"
                  />
                  <button type="button" onClick={() => setShowPxKey(!showPxKey)} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                    {showPxKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button type="submit" disabled={!pxKey} className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold disabled:opacity-40 hover:bg-purple-500/30 transition-all">Save</button>
              </div>
              {pxMsg && <p className={cn("text-xs", pxMsg.startsWith("Error") ? "text-red-400" : "text-green-400")}>{pxMsg}</p>}
            </form>
          )}
        </Section>

        {/* Trade settings — only 3 fields */}
        <Section title="Trade Settings">
          <Field label="Risk per trade" hint="% of balance per entry (AI scales by conviction)">
            <NumInput value={val("riskPercent")} onChange={(v: number) => setDraftField("riskPercent", v)} min={1} max={50} suffix="%" />
          </Field>
          <Field label="Target balance" hint="Bot pauses when reached">
            <NumInput value={val("targetBalance")} onChange={(v: number) => setDraftField("targetBalance", v)} min={1} max={10000} prefix="$" />
          </Field>
          <Field label="Poll speed" hint="How often AI checks the market">
            <SegmentedControl
              options={[{label:"10s",value:10},{label:"15s",value:15},{label:"30s",value:30},{label:"60s",value:60}]}
              value={val("pollInterval") ?? 15}
              onChange={(v: number) => setDraftField("pollInterval", v)}
            />
          </Field>
        </Section>

        {/* Save button */}
        {hasDraft && (
          <button
            onClick={saveAll}
            disabled={updateSettings.isPending}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-all"
          >
            {updateSettings.isPending ? "Saving…" : "Save Settings"}
          </button>
        )}
        {saved && !hasDraft && (
          <div className="text-center text-xs text-green-400 py-1">Saved</div>
        )}

        {/* AI info block */}
        <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">AI Autonomy Mode</div>
          <p className="text-xs text-muted-foreground">Entry, exit, and position sizing are fully AI-driven. The AI uses real-time web search on every decision cycle.</p>
          <p className="text-xs text-muted-foreground">Risk % is your base stake — AI scales it 0.5x (cautious), 1.0x (normal), or 1.5x (high conviction) based on how strong the edge is.</p>
          <p className="text-xs text-muted-foreground">No profit targets or stop-losses. The AI decides when to hold and when to exit on every poll cycle.</p>
        </div>

        {/* Kalshi credentials */}
        <Section title="Kalshi API">
          {creds?.connected ? (
            <Field label="Connected" hint={`${creds.environment} · ${creds.apiKeyId}`}>
              <button onClick={() => deleteCreds.mutate()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all">
                <Trash2 size={11} /> Disconnect
              </button>
            </Field>
          ) : (
            <form onSubmit={saveCreds} className="py-3 space-y-3">
              <SegmentedControl options={[{label:"Production",value:"production"},{label:"Demo",value:"demo"}]} value={env} onChange={setEnv} />
              <input className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-muted border border-border focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                placeholder="API Key ID" value={apiKeyId} onChange={e => setApiKeyId(e.target.value)} />
              <textarea className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-muted border border-border focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground h-28 resize-none"
                placeholder="-----BEGIN PRIVATE KEY-----" value={privateKey} onChange={e => setPrivateKey(e.target.value)} />
              <button type="submit" disabled={saving || !apiKeyId || !privateKey}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-all">
                {saving ? "Connecting…" : "Connect"}
              </button>
              {credMsg && <p className={cn("text-xs", credMsg.startsWith("Error") ? "text-red-400" : "text-green-400")}>{credMsg}</p>}
            </form>
          )}
        </Section>

      </main>
    </div>
  );
}
