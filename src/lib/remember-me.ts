// Tiny helper to implement "Remember me" on top of supabase-js, which always
// persists its session in localStorage. When remember=false we mark a session
// flag; on tab close we wipe the supabase auth keys from localStorage so the
// next tab open starts signed out. (Current tab keeps the in-memory session
// for the rest of the session — reloads will sign the user out.)

const FLAG_KEY = "museling:no-remember";

function projectId(): string | null {
  return (
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID) ||
    null
  );
}

function sbKeys(): string[] {
  const pid = projectId();
  const keys: string[] = [];
  if (pid) keys.push(`sb-${pid}-auth-token`);
  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token") && !keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function setRemember(remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) sessionStorage.removeItem(FLAG_KEY);
  else sessionStorage.setItem(FLAG_KEY, "1");
}

export function installRememberMe() {
  // Disabled — sessions now persist until the user explicitly signs out.
}
