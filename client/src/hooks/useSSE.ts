import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveState {
  btcPrice: number;
  balance: number;
  openPositions: any[];
  lastSignal: {
    direction: string;
    confidence: number;
    reasoning: string;
    rsi: number;
    macd: number;
    macdSignal: number;
  } | null;
  currentMarket: any | null;
  error: string | null;
  lastRun: string | null;
  priceHistory: Array<{ time: number; price: number }>;
}

export function useSSE() {
  const [state, setState] = useState<LiveState>({
    btcPrice: 0,
    balance: 0,
    openPositions: [],
    lastSignal: null,
    currentMarket: null,
    error: null,
    lastRun: null,
    priceHistory: [],
  });
  const [connected, setConnected] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const apiBase = (window as any).__API_BASE__ ?? "";
    const es = new EventSource(`${apiBase}/api/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener("state", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, ...data }));
      } catch {}
    });

    es.addEventListener("trade", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setNotification(data.message ?? "Trade executed");
        setTimeout(() => setNotification(null), 5000);
      } catch {}
    });

    es.addEventListener("info", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setNotification(data.message ?? "");
        setTimeout(() => setNotification(null), 6000);
      } catch {}
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setNotification("⚠️ " + data.message);
        setTimeout(() => setNotification(null), 5000);
      } catch {}
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { state, connected, notification };
}
