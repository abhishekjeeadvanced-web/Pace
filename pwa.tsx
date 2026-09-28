"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setHelp(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    setReady(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) {
      setHelp((h) => !h);
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        disabled={installed}
        className={`btn ${installed ? "btn-ghost cursor-default opacity-70" : "btn-primary"}`}
        aria-live="polite"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
          {installed ? (
            <>
              <path d="M20 6L9 17l-5-5" />
            </>
          ) : (
            <>
              <path d="M12 3v12" />
              <path d="M7 11l5 5 5-5" />
              <path d="M4 20h16" />
            </>
          )}
        </svg>
        {installed ? "Installed" : "Install app"}
      </button>

      {help && !installed && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[268px] rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-4 text-[12px] leading-relaxed text-[var(--muted)] shadow-[var(--shadow)] fade-up">
          <p className="micro-label mb-2 text-[var(--ink)]">Install on ChromeOS Flex</p>
          <p>
            Open the Chrome menu <span className="text-[var(--ink)]">⋮</span> →{" "}
            <span className="text-[var(--ink)]">Cast, save and share</span> →{" "}
            <span className="text-[var(--ink)]">Install page as app</span>. Pace Register then opens in its own
            window and works offline.
          </p>
          <p className="mt-2">The button lights up automatically once Chrome offers the install prompt.</p>
        </div>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pace-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost"
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
        {mounted && dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
          </>
        ) : (
          <path d="M20 14.2A8.2 8.2 0 019.8 4a8.4 8.4 0 1010.2 10.2z" />
        )}
      </svg>
      <span className="hidden sm:inline">{dark ? "Day" : "Night"}</span>
    </button>
  );
}
