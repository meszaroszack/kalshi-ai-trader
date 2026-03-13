import { Link, useLocation } from "wouter";
import { LayoutDashboard, Settings, History, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/history", icon: History, label: "Trade History" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  connected: boolean;
  botEnabled: boolean;
}

export default function Sidebar({ connected, botEnabled }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside className="w-16 md:w-52 flex flex-col bg-card border-r border-border shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Kalshi Trader">
          <rect width="28" height="28" rx="6" fill="hsl(142 76% 45% / 0.15)" />
          <path d="M8 20 L8 8 L8 14 L16 8 M16 14 L20 8 M16 14 L20 20" stroke="hsl(142 76% 45%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="hidden md:block text-sm font-semibold text-foreground tracking-tight">KXBTC Bot</span>
      </div>

      {/* Status */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full pulse-dot", botEnabled ? "bg-green-400" : "bg-zinc-500")} />
        <span className="hidden md:block text-xs text-muted-foreground">
          {botEnabled ? "Bot active" : "Bot paused"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {nav.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}>
            <a
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                location === href
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
            >
              <Icon size={16} />
              <span className="hidden md:block">{label}</span>
            </a>
          </Link>
        ))}
      </nav>

      {/* SSE connection */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-green-400 pulse-dot" : "bg-red-400")} />
        <span className="hidden md:block text-xs text-muted-foreground">
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>
    </aside>
  );
}
