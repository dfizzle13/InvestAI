import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Analytics, Portfolio, Position, Trade } from "./types";

const URL_KEY = "investai_api_url";
const TOKEN_KEY = "investai_api_token";
const AUTH_URL_KEY = "investai_auth_url";
const SESSION_KEY = "investai_session_token";
const USER_KEY = "investai_username";
const ROLE_KEY = "investai_role";
const BIOMETRIC_KEY = "investai_biometric_enabled";
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

const PROFILE_INDEX_KEY = "investai_local_profiles";
const ACTIVE_PROFILE_KEY = "investai_active_profile";
const profileKey = (username: string) => encodeURIComponent(username.trim().toLowerCase());
type LocalProfile = { username: string; password: string; role: string };
async function readProfiles(): Promise<LocalProfile[]> {
  let profiles: LocalProfile[] = [];
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_INDEX_KEY);
    const value = raw ? JSON.parse(raw) : [];
    profiles = Array.isArray(value) ? value.filter((p: any) => p && typeof p.username === "string" && typeof p.password === "string") : [];
  } catch {
    profiles = [];
  }

  // Seed/repair the built-in local administrator so it works on fresh installs
  // and upgrades where the profile index already exists but lacks the admin.
  const admin = profiles.find(p => p.username.trim().toLowerCase() === "admin");
  if (admin) {
    admin.username = "admin";
    admin.password = "password";
    admin.role = "admin";
  } else {
    profiles.push({ username: "admin", password: "password", role: "admin" });
  }

  try {
    await SecureStore.setItemAsync(PROFILE_INDEX_KEY, JSON.stringify(profiles));
  } catch {
    // The caller will surface any storage failure when it tries to log in.
  }
  return profiles;
}
export async function createLocalProfile(username: string, password: string) {
  const name = username.trim();
  if (name.length < 3) throw new Error("Username must be at least 3 characters.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const profiles = await readProfiles();
  if (profiles.some(p => p.username.toLowerCase() === name.toLowerCase())) throw new Error("That username already exists on this device.");
  profiles.push({ username:name, password, role:"user" });
  await SecureStore.setItemAsync(PROFILE_INDEX_KEY, JSON.stringify(profiles));
  await SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, name.toLowerCase());
  return { username:name, role:"user" };
}
export async function loginLocalProfile(username: string, password: string) {
  const name = username.trim();
  const profiles = await readProfiles();
  const profile = profiles.find(p => p.username.toLowerCase() === name.toLowerCase());
  if (!profile || profile.password !== password) throw new Error("Invalid username or password for a local InvestAI profile.");
  const key = profileKey(profile.username);
  const url = (await SecureStore.getItemAsync("investai_profile_url_" + key)) || "";
  const token = (await SecureStore.getItemAsync("investai_profile_token_" + key)) || "";
  await SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, profile.username.toLowerCase());
  return { username:profile.username, role:profile.role || "user", url:url.replace(/\/+$/, ""), token };
}
export async function readActiveLocalProfile() {
  try {
    const active = await SecureStore.getItemAsync(ACTIVE_PROFILE_KEY);
    if (!active) return null;
    const profiles = await readProfiles();
    const profile = profiles.find(p => p.username.toLowerCase() === active);
    if (!profile) return null;
    const key = profileKey(profile.username);
    return { username:profile.username, role:profile.role || "user", url:(await SecureStore.getItemAsync("investai_profile_url_" + key)) || "", token:(await SecureStore.getItemAsync("investai_profile_token_" + key)) || "" };
  } catch { return null; }
}
export async function saveLocalProfileConnection(username: string, url: string, token: string) {
  const normalized = url.trim().replace(/\/+$/, "");
  if (normalized && !/^https:\/\//i.test(normalized) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) throw new Error("Use HTTPS for remote connections. HTTP is allowed only for localhost development.");
  const key = profileKey(username);
  await SecureStore.setItemAsync("investai_profile_url_" + key, normalized);
  await SecureStore.setItemAsync("investai_profile_token_" + key, token.trim());
  return { url:normalized, token:token.trim() };
}
export async function readLocalProfileBiometrics(username: string) {
  const key = profileKey(username);
  return (await SecureStore.getItemAsync("investai_profile_biometrics_" + key)) === "true";
}
export async function saveLocalProfileBiometrics(username: string, enabled: boolean) {
  const profiles = await readProfiles();
  if (!profiles.some(p => p.username.toLowerCase() === username.trim().toLowerCase())) {
    throw new Error("Sign in to an existing local profile before enabling biometric sign-in.");
  }
  await SecureStore.setItemAsync("investai_profile_biometrics_" + profileKey(username), enabled ? "true" : "false");
}
export async function readLocalProfilePassword(username: string) {
  const profiles = await readProfiles();
  const profile = profiles.find(p => p.username.toLowerCase() === username.trim().toLowerCase());
  if (!profile) throw new Error("Local profile not found on this device.");
  return profile.password;
}
export async function logoutLocalProfile() { await SecureStore.deleteItemAsync(ACTIVE_PROFILE_KEY); }


export async function readSession() { if (Platform.OS === "web") return { url: "", token: "", username: "", role: "user" }; try { return { url: (await SecureStore.getItemAsync(AUTH_URL_KEY)) || "", token: (await SecureStore.getItemAsync(SESSION_KEY)) || "", username: (await SecureStore.getItemAsync(USER_KEY)) || "", role: (await SecureStore.getItemAsync(ROLE_KEY)) || "user" }; } catch { return { url: "", token: "", username: "", role: "user" }; } }
export async function saveSession(url: string, token: string, username: string, role: string) { if (Platform.OS !== "web") { await SecureStore.setItemAsync(AUTH_URL_KEY, url.trim().replace(/\/+$/, "")); await SecureStore.setItemAsync(SESSION_KEY, token); await SecureStore.setItemAsync(USER_KEY, username); await SecureStore.setItemAsync(ROLE_KEY, role); } }
export async function clearSession() { if (Platform.OS !== "web") { await SecureStore.deleteItemAsync(SESSION_KEY); await SecureStore.deleteItemAsync(USER_KEY); await SecureStore.deleteItemAsync(ROLE_KEY); } }
export async function readBiometricPreference() { if (Platform.OS === "web") return false; try { return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "true"; } catch { return false; } }
export async function saveBiometricPreference(enabled: boolean) { if (Platform.OS !== "web") await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? "true" : "false"); }

export async function readConnection() {
  let url = DEFAULT_URL;
  let token = "";
  if (Platform.OS !== "web") {
    try {
      url = (await SecureStore.getItemAsync(URL_KEY)) || url;
      token = (await SecureStore.getItemAsync(TOKEN_KEY)) || "";
    } catch {}
  }
  return { url: url.replace(/\/+$/, ""), token };
}

export async function saveConnection(url: string, token: string) {
  const normalized = url.trim().replace(/\/+$/, "");
  if (normalized && !/^https:\/\//i.test(normalized) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    throw new Error("Use HTTPS for remote connections. HTTP is allowed only for localhost development.");
  }
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(URL_KEY, normalized);
    await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
  }
  return { url: normalized, token: token.trim() };
}
// Remote HTTPS tunnels and mobile networks can take longer than a desktop request.
const API_TIMEOUT_MS = 25000;
const RETRY_DELAY_MS = 800;
type RequestError = Error & { retryable?: boolean };

async function getJson<T>(base: string, token: string, path: string): Promise<T> {
  const url = base.trim().replace(/\/+$/, "") + path;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, API_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal
      });
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          if (typeof payload?.detail === "string") detail = `: ${payload.detail}`;
        } catch {
          // An HTML proxy error still has a useful HTTP status.
        }
        const hint = response.status === 401 || response.status === 403
          ? " Check the saved bearer token."
          : response.status === 404
            ? " Verify that the configured server exposes this API route."
            : "";
        const error = new Error(`${path}: HTTP ${response.status}${detail}.${hint}`) as RequestError;
        error.retryable = [502, 503, 504].includes(response.status);
        throw error;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new Error(`${path}: server returned non-JSON content (possibly a tunnel login or proxy page).`);
      }
      return await response.json() as T;
    } catch (cause: unknown) {
      clearTimeout(timer);
      const error = cause instanceof Error ? cause : new Error(String(cause));
      const networkFailure = error.name === "AbortError"
        || /aborted|network request failed|failed to fetch|network error|econnreset|etimedout/i.test(error.message);
      const suffix = attempt === 2 ? " (after 2 attempts)" : "";
      const message = timedOut
        ? `${path}: request timed out after ${API_TIMEOUT_MS / 1000} seconds${suffix}. Check the server URL and HTTPS tunnel.`
        : networkFailure
          ? `${path}: network request failed${suffix} (${error.message}). Check your phone's connection and the server's HTTPS address.`
          : error.message;
      if (attempt < 2 && (timedOut || networkFailure || (error as RequestError).retryable)) {
        await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${path}: request unsuccessful.`);
}

function listFrom<T>(value: any, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key] as T[];
  if (Array.isArray(value?.data)) return value.data as T[];
  return [];
}

export async function fetchInvestData(base: string, token: string) {
  if (!base) throw new Error("Add your server HTTPS URL in Settings.");
  const [portfolioRaw, positionsRaw, tradesRaw, analyticsRaw] = await Promise.all([
    getJson<any>(base, token, "/api/v1/portfolio"),
    getJson<any>(base, token, "/api/v1/positions"),
    getJson<any>(base, token, "/api/v1/trades"),
    getJson<any>(base, token, "/api/v1/analytics")
  ]);
  const portfolio: Portfolio = portfolioRaw?.portfolio ?? portfolioRaw?.data ?? portfolioRaw;
  const analytics: Analytics = analyticsRaw?.analytics ?? analyticsRaw?.data ?? analyticsRaw;
  const positions: Position[] = listFrom(positionsRaw, ["positions", "items"]);
  const trades: Trade[] = listFrom(tradesRaw, ["trades", "items"]);
  if (typeof portfolio?.virtual_equity !== "number") throw new Error("Portfolio JSON is missing numeric virtual_equity.");
  return { portfolio, positions, trades, analytics, demo: false, lastSync: new Date().toISOString() };
}

export async function testConnection(base: string, token: string) {
  const health = await getJson<any>(base.replace(/\/+$/, ""), token, "/api/v1/health");
  if (!["ok", "healthy", "up"].includes(String(health?.status).toLowerCase())) {
    throw new Error("Health endpoint responded, but status was not ok.");
  }
  return health;
}