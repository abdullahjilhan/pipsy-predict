import { useEffect, useRef, useState } from "react";

const BUY_FREQS = [523.25, 659.25, 783.99]; // C5 E5 G5
const SELL_FREQS = [392.0, 311.13, 233.08]; // G4 Eb4 Bb3

function playTone(freqs: number[]) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new Ctx();
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const start = now + i * 0.12;
      const end = start + 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => ctx.close(), (freqs.length * 120) + 400);
  } catch (e) {
    console.warn("Audio failed", e);
  }
}

export type AlertAction = "BUY" | "SELL";

export function useSignalAlerts(opts: {
  action: "BUY" | "SELL" | "HOLD" | undefined;
  symbol: string;
  price: number;
  confidence: number;
}) {
  const { action, symbol, price, confidence } = opts;
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const prevActionRef = useRef<string | undefined>(undefined);
  const [history, setHistory] = useState<{ action: AlertAction; symbol: string; price: number; confidence: number; at: Date }[]>([]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPermission(p);
  };

  useEffect(() => {
    if (!action) return;
    const prev = prevActionRef.current;
    prevActionRef.current = action;
    if (prev === undefined) return; // skip first
    if (action === prev) return;
    if (action !== "BUY" && action !== "SELL") return;

    // History
    setHistory((h) => [{ action, symbol, price, confidence, at: new Date() }, ...h].slice(0, 20));

    // Sound
    if (soundEnabled) playTone(action === "BUY" ? BUY_FREQS : SELL_FREQS);

    // Notification
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(`${action} signal · ${symbol}`, {
          body: `Price $${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} · Confidence ${confidence}%`,
          icon: "/favicon.ico",
          tag: `signal-${symbol}`,
        });
      } catch (e) {
        console.warn("Notification failed", e);
      }
    }
  }, [action, symbol, price, confidence, soundEnabled]);

  return { soundEnabled, setSoundEnabled, notifPermission, requestPermission, history };
}
