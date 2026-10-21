import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle } from "react-native-svg";
import { Activity, ArrowDownLeft, ArrowUpRight, BrainCircuit, BriefcaseBusiness, ChartNoAxesCombined, ChevronRight, CircleHelp, Clock3, Cloud, CloudOff, Eye, EyeOff, RefreshCw, Settings2, ShieldCheck, Wallet } from "lucide-react-native";
import { fetchInvestData, readConnection, readSession, saveSession, clearSession, saveConnection, testConnection, readBiometricPreference, saveBiometricPreference, createLocalProfile, loginLocalProfile, readActiveLocalProfile, saveLocalProfileConnection, logoutLocalProfile } from "./src/api";
import * as LocalAuthentication from "expo-local-authentication";
import { AppData, EMPTY_DATA, Position, Trade } from "./src/types";

const C = { bg: "#090E1B", panel: "#111A2B", panel2: "#172238", border: "#25334A", text: "#F4F7FC", muted: "#91A0B8", green: "#B8F36B", red: "#FF858E", blue: "#86A9FF", white: "#FFFFFF" };
type Tab = "Overview" | "Positions" | "Activity" | "Analytics" | "Search" | "Settings";
type SortKey = "symbol" | "pnl" | "value" | "date";
type Horizon = "Today" | "MTD" | "YTD" | "Forever";
const money = (n?: number) => (n == null || !Number.isFinite(n) ? "N/A" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const signedMoney = (n?: number) => n == null || !Number.isFinite(n) ? "N/A" : `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const pct = (n?: number) => n == null || !Number.isFinite(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const stamp = (s?: string) => { if (!s) return "Not synced yet"; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };

function Label({ children, style }: any) { return <Text style={[styles.label, style]}>{children}</Text>; }
function Card({ children, style }: any) { return <View style={[styles.card, style]}>{children}</View>; }
function Section({ title, action, onAction }: any) { return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={styles.action}>{action}  ›</Text></Pressable> : null}</View>; }
function Metric({ title, value, sub, positive }: any) { return <Card style={styles.metric}><Label>{title}</Label><Text numberOfLines={1} style={styles.metricValue}>{value}</Text>{sub ? <Text style={[styles.metricSub, { color: positive == null ? C.muted : positive ? C.green : C.red }]}>{sub}</Text> : null}</Card>; }
function SymbolMark({ symbol }: {symbol:string}) { return <View style={styles.symbolMark}><Text style={styles.symbolText}>{symbol.slice(0,4)}</Text></View>; }
function PerformanceChart({ values, height = 116 }: { values: number[]; height?: number }) {
  const width = 310, pad = 6;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => ({ x: pad + i * (width - pad * 2) / Math.max(1, values.length - 1), y: height - pad - ((v - min) / range) * (height - pad * 2) }));
  const path = pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const fill = `${path} L ${width-pad} ${height} L ${pad} ${height} Z`;
  return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    <Defs><LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.green} stopOpacity="0.24"/><Stop offset="1" stopColor={C.green} stopOpacity="0"/></LinearGradient></Defs>
    {[0.25,0.5,0.75].map(n => <Line key={n} x1="0" x2={width} y1={height*n} y2={height*n} stroke={C.border} strokeDasharray="4 5" />)}
    <Path d={fill} fill="url(#chartFill)"/><Path d={path} fill="none" stroke={C.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    {pts.length ? <Circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="4" fill={C.green} stroke={C.panel} strokeWidth="2"/> : null}
  </Svg>;
}
function PositionRow({ p }: { p: Position }) {
  const value = p.unrealized_pnl, good = (value ?? 0) >= 0;
  return <View style={styles.rowItem}><SymbolMark symbol={p.symbol}/><View style={styles.rowMain}><Text style={styles.rowTitle}>{p.symbol}</Text><Text style={styles.rowSubtitle}>{p.name || `${p.quantity} shares · ${p.side || "position"}`}</Text></View><View style={styles.rowRight}><Text style={styles.rowTitle}>{money(p.market_value ?? (p.current_price != null && p.quantity != null ? p.current_price * p.quantity : undefined))}</Text><Text style={[styles.rowSubtitle, { color: good ? C.green : C.red }]}>{signedMoney(value)} ({pct(p.unrealized_pnl_percent)})</Text></View></View>;
}
function TradeRow({ t }: { t: Trade }) {
  const pnl = t.realized_pnl, good = (pnl ?? 0) >= 0;
  return <View style={styles.rowItem}><View style={[styles.tradeIcon, { backgroundColor: good ? "#203326" : "#38252F" }]}>{good ? <ArrowUpRight size={18} color={C.green}/> : <ArrowDownLeft size={18} color={C.red}/>}</View><View style={styles.rowMain}><Text style={styles.rowTitle}>{t.symbol} <Text style={styles.rowSubtitle}>· {t.status || "trade"}</Text></Text><Text style={styles.rowSubtitle}>{t.strategy || t.side || "Webull"} · {stamp(t.closed_at || t.opened_at)}</Text></View><View style={styles.rowRight}><Text style={[styles.rowTitle, { color: good ? C.green : C.red }]}>{signedMoney(pnl)}</Text><Text style={styles.rowSubtitle}>{t.quantity ?? "N/A"} shares</Text></View></View>;
}
function TopBar({ connected }: { connected: boolean }) { return <View style={styles.topBar}><View style={styles.brand}><View style={styles.logo}><ChartNoAxesCombined size={21} color={C.bg}/></View><View><Text style={styles.brandName}>InvestAI</Text><Text style={styles.brandSub}>YOUR CAPITAL, IN FOCUS</Text></View></View><View style={styles.statusPill}><View style={[styles.dot, { backgroundColor: connected ? C.green : "#F2C879" }]}/><Text style={styles.statusText}>{connected ? "LIVE DATA" : "NOT CONNECTED"}</Text></View></View>; }

export default function App() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [baseUrl, setBaseUrl] = useState("");
  const [authServerUrl, setAuthServerUrl] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showLoginServerSetup, setShowLoginServerSetup] = useState(false);\n  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [enableBiometrics, setEnableBiometrics] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [accountRole, setAccountRole] = useState("user");
  const [loggedIn, setLoggedIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("Connect to your PC server to load live data.");
  const [lastSync, setLastSync] = useState("");
  const [lastError, setLastError] = useState("");
  const [filter, setFilter] = useState<"All" | "Closed" | "Open">("All");
  const [positionSort, setPositionSort] = useState<SortKey>("symbol");
  const [tradeSort, setTradeSort] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("Forever");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([readConnection(), readSession(), readBiometricPreference(), readActiveLocalProfile()]).then(([c, _session, biometricSaved, profile]) => {
      if (cancelled) return;
      setEnableBiometrics(biometricSaved);
      if (profile) { setLoginName(profile.username); setBaseUrl(profile.url || ""); setToken(profile.token || ""); setAccountRole(profile.role || "user"); setConnectionMessage(profile.url && profile.token ? "Saved connection found. Sign in to validate it." : "Sign in or create a local profile. Server settings are optional."); }
      else { setBaseUrl(""); setToken(""); setConnectionMessage("Create a local profile or sign in. Server settings are optional."); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const sync = useCallback(async (quiet = false) => {
    if (!baseUrl.trim()) { setTab("Settings"); setConnectionMessage("Enter the HTTPS server URL first."); return; }
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      if (!baseUrl.trim() || !token.trim()) throw new Error("Both the server URL and bearer token are required to validate and refresh the connection.");
      const c = await saveLocalProfileConnection(loginName, baseUrl, token);
      await testConnection(c.url, c.token);
      const next = await fetchInvestData(c.url, c.token);
      setData(next); setLastSync(next.lastSync || new Date().toISOString()); setConnectionMessage("Connected securely. Live data loaded.");
    } catch (e: any) {
      const detail = `[${new Date().toISOString()}] Refresh data failed\n${e?.stack || e?.message || String(e)}`;
      setLastError(detail);
      setConnectionMessage(e?.message || "Could not connect. Check the URL, server, and token.");
      if (!quiet) Alert.alert("Connection unsuccessful", e?.message || "Check server settings.", [{text:"Close",style:"cancel"}]);
    } finally { setLoading(false); setRefreshing(false); }
  }, [baseUrl, token, loginName]);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      if (!loginName.trim()) throw new Error("Sign in to a local profile before saving server settings.");
      const c = await saveLocalProfileConnection(loginName, baseUrl, token);
      setBaseUrl(c.url); setToken(c.token); setLastError("");
      if (!c.url || !c.token) {
        setData(EMPTY_DATA);
        setConnectionMessage("Settings saved to this local profile. A connection check will run only after both the server URL and bearer token are saved.");
        Alert.alert("Settings saved", "Your server settings are stored with this local profile. Add both URL and token to validate the connection.");
        return;
      }
      await testConnection(c.url, c.token);
      setConnectionMessage("Health check passed. Loading account data…");
      const next = await fetchInvestData(c.url, c.token);
      setData(next); setLastSync(next.lastSync || new Date().toISOString()); setConnectionMessage("Connected securely. Live data loaded.");
      Alert.alert("Connected", "InvestAI received portfolio data from your server.");
    } catch (e: any) {
      const detail = `[${new Date().toISOString()}] Connect & sync failed\n${e?.stack || e?.message || String(e)}`;
      setLastError(detail); setConnectionMessage(e?.message || "Connection failed."); setTab("Settings");
      Alert.alert("Connection unsuccessful", e?.message || "Check the server URL and token.", [{text:"Close",style:"cancel"}]);
    } finally { setLoading(false); }
  }, [baseUrl, token, loginName]);

    const signIn = useCallback(async () => {
    setLoading(true); setAuthError("");
    try {
      const profile = isCreatingAccount ? await createLocalProfile(loginName, loginPassword) : await loginLocalProfile(loginName, loginPassword);
      setLoginName(profile.username); setAccountRole(profile.role); setLoginPassword("");
      await saveSession("", "", profile.username, profile.role);
      setSessionToken(""); setLoggedIn(true); setAuthServerUrl("");
      const saved = await readActiveLocalProfile();
      const dataUrl = saved?.url || "", dataToken = saved?.token || "";
      setBaseUrl(dataUrl); setToken(dataToken); setLastError("");
      if (enableBiometrics) {
        try { const available = await LocalAuthentication.hasHardwareAsync(); const enrolled = available && await LocalAuthentication.isEnrolledAsync(); if (available && enrolled) await saveBiometricPreference(true); else { await saveBiometricPreference(false); setEnableBiometrics(false); } }
        catch { await saveBiometricPreference(false); setEnableBiometrics(false); }
      } else await saveBiometricPreference(false);
      if (dataUrl && dataToken) {
        try {
          await testConnection(dataUrl, dataToken);
          const next = await fetchInvestData(dataUrl, dataToken);
          setData(next); setLastSync(next.lastSync || new Date().toISOString()); setConnectionMessage("Signed in and connected. Live data loaded."); setTab("Overview");
        } catch (err: any) {
          const message = err?.message || String(err);
          setData(EMPTY_DATA); setConnectionMessage("Server connection failed: " + message);
          setLastError("Automatic connection validation failed: " + (err?.stack || message)); setTab("Settings");
        }
      } else {
        setData(EMPTY_DATA); setConnectionMessage("Signed in. No complete server URL and bearer-token pair is saved for this profile."); setTab("Settings");
      }
    } catch (err: any) { setAuthError(err?.message || String(err)); }
    finally { setLoading(false); }
  }, [loginName, loginPassword, isCreatingAccount, enableBiometrics]);

  const signOut = useCallback(async () => {
    await logoutLocalProfile();
    setLoggedIn(false); setSessionToken(""); setAccountRole("user"); setLoginPassword("");
    setData(EMPTY_DATA); setTab("Overview"); setAuthError("");
  }, []);

    const loadAdminUsers = useCallback(async () => {
    try { const r=await fetch(authServerUrl.replace(/\/+$/,"")+"/api/v1/admin/users",{headers:{Authorization:"Bearer "+sessionToken,Accept:"application/json"}});const j=await r.json();if(!r.ok)throw new Error(j.detail||"Could not load users");setAdminUsers(j.users||[]); } catch(e:any){Alert.alert("Admin error",e?.message||String(e),[{text:"Close",style:"cancel"}]);}
  },[authServerUrl,sessionToken]);

  const createAccount = useCallback(async () => {
    try { const r=await fetch(authServerUrl.replace(/\/+$/,"")+"/api/v1/admin/users",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken},body:JSON.stringify({username:newUsername.trim(),password:newPassword,role:"user"})});const j=await r.json();if(!r.ok)throw new Error(j.detail||"Could not create account");setNewUsername("");setNewPassword("");await loadAdminUsers();Alert.alert("Account created","The new account is ready.",[{text:"Close"}]); } catch(e:any){Alert.alert("Account creation failed",e?.message||String(e),[{text:"Close",style:"cancel"}]);}
  },[authServerUrl,sessionToken,newUsername,newPassword,loadAdminUsers]);

  const total = data.portfolio.virtual_equity;
  const chartValues = useMemo(() => data.analytics.daily?.length ? data.analytics.daily.map(d => d.pnl).reduce((a, v, i) => { a.push((a[i - 1] || 0) + v); return a; }, [] as number[]) : [0], [data.analytics.daily]);
  const shownTrades = useMemo(() => {
    const rows = data.trades.filter(t => filter === "All" || (filter === "Closed" ? t.status?.toLowerCase() === "closed" : t.status?.toLowerCase() !== "closed"));
    return [...rows].sort((a,b) => {
      const av: any = tradeSort === "symbol" ? a.symbol : tradeSort === "pnl" ? (a.realized_pnl ?? 0) : tradeSort === "value" ? (a.quantity ?? 0) * (a.exit_price ?? a.entry_price ?? 0) : new Date(a.closed_at || a.opened_at || 0).getTime();
      const bv: any = tradeSort === "symbol" ? b.symbol : tradeSort === "pnl" ? (b.realized_pnl ?? 0) : tradeSort === "value" ? (b.quantity ?? 0) * (b.exit_price ?? b.entry_price ?? 0) : new Date(b.closed_at || b.opened_at || 0).getTime();
      const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av)-Number(bv);
      return sortAsc ? cmp : -cmp;
    });
  }, [data.trades, filter, tradeSort, sortAsc]);
  const sortedPositions = useMemo(() => [...data.positions].sort((a,b) => {
    const av: any = positionSort === "symbol" ? a.symbol : positionSort === "pnl" ? (a.unrealized_pnl ?? 0) : (a.market_value ?? (a.current_price ?? 0) * (a.quantity ?? 0));
    const bv: any = positionSort === "symbol" ? b.symbol : positionSort === "pnl" ? (b.unrealized_pnl ?? 0) : (b.market_value ?? (b.current_price ?? 0) * (b.quantity ?? 0));
    const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av)-Number(bv);
    return sortAsc ? cmp : -cmp;
  }), [data.positions, positionSort, sortAsc]);
  const periodTrades = useMemo(() => {
    const now = new Date(), start = new Date(now);
    if (horizon === "Today") start.setHours(0,0,0,0);
    if (horizon === "MTD") { start.setDate(1); start.setHours(0,0,0,0); }
    if (horizon === "YTD") { start.setMonth(0,1); start.setHours(0,0,0,0); }
    return data.trades.filter(t => {
      if ((t.status || "").toLowerCase() !== "closed" || t.realized_pnl == null) return false;
      if (horizon === "Forever") return true;
      const raw = t.closed_at || t.opened_at; if (!raw) return false;
      const d = new Date(raw); return !Number.isNaN(d.getTime()) && d >= start && d <= now;
    });
  }, [data.trades, horizon]);
  const periodPnl = horizon === "Forever" ? data.portfolio.realized_pnl : periodTrades.reduce((sum,t) => sum + (t.realized_pnl || 0), 0);
  const periodChartValues = useMemo(() => {
    if (horizon === "Forever" && data.analytics.daily?.length) return data.analytics.daily.map(d=>d.pnl).reduce((a,v,i)=>{a.push((a[i-1]||0)+v);return a;},[] as number[]);
    const sorted = [...periodTrades].sort((a,b)=>new Date(a.closed_at || a.opened_at || 0).getTime()-new Date(b.closed_at || b.opened_at || 0).getTime());
    let running = 0; return sorted.map(t => (running += t.realized_pnl || 0));
  }, [horizon, periodTrades, data.analytics.daily]);
  const searchable = useMemo(() => {
    const q = searchQuery.trim().toLowerCase(); if (!q) return [];
    const positions = data.positions.filter(p => [p.symbol,p.name,p.side].some(v => String(v||"").toLowerCase().includes(q))).map(p=>({kind:"Position",title:p.symbol,detail:p.name||String(p.quantity)+" shares",tab:"Positions" as Tab}));
    const trades = data.trades.filter(t => [t.symbol,t.status,t.strategy,t.side,t.id].some(v => String(v||"").toLowerCase().includes(q))).map(t=>({kind:"Trade",title:t.symbol,detail:String(t.status||"trade")+" · "+signedMoney(t.realized_pnl),tab:"Activity" as Tab}));
    const pages = (["Overview","Positions","Activity","Analytics","Settings"] as Tab[]).filter(p=>p.toLowerCase().includes(q)).map(p=>({kind:"Page",title:p,detail:"Open page",tab:p}));
    return [...pages,...positions,...trades].slice(0,60);
  }, [searchQuery, data.positions, data.trades]);

  const header = (title: string, subtitle: string) => <View style={styles.pageHeading}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>;

  const overview = () => <><Card style={styles.hero}><View style={styles.heroTop}><Label style={{ color: "#C4D0E4" }}>TOTAL VIRTUAL EQUITY</Label><View style={styles.heroIcon}><Wallet size={18} color={C.green}/></View></View><Text style={styles.heroValue}>{money(total)}</Text><View style={styles.heroChange}><ArrowUpRight size={15} color={C.green}/><Text style={styles.heroChangeText}>{signedMoney(data.portfolio.daily_pnl)} today · {pct(data.portfolio.daily_pnl_percent)}</Text></View><View style={styles.chartLabels}><Text style={styles.chartCaption}>Portfolio trend</Text><Text style={styles.chartCaption}>Last 5 sessions</Text></View><PerformanceChart values={chartValues}/><View style={styles.chartFoot}><Text style={styles.chartCaption}>REALIZED + UNREALIZED P/L</Text><Text style={[styles.chartFootValue, { color: data.portfolio.realized_pnl + data.portfolio.unrealized_pnl >= 0 ? C.green : C.red }]}>{signedMoney(data.portfolio.realized_pnl + data.portfolio.unrealized_pnl)}</Text></View></Card><View style={styles.metricsGrid}><Metric title="Realized P/L" value={signedMoney(data.portfolio.realized_pnl)} positive={data.portfolio.realized_pnl >= 0} sub="Closed positions"/><Metric title="Unrealized P/L" value={signedMoney(data.portfolio.unrealized_pnl)} positive={data.portfolio.unrealized_pnl >= 0} sub="Open positions"/></View><Section title="Open positions" action="See all" onAction={() => setTab("Positions")}/><Card>{data.positions.slice(0,4).map((p,i)=><React.Fragment key={p.symbol}>{i>0 && <View style={styles.rowDivider}/>}<PositionRow p={p}/></React.Fragment>)}{data.positions.length===0 && <Text style={styles.emptyText}>No open positions returned by the server.</Text>}</Card><Section title="Recent activity" action="View history" onAction={() => setTab("Activity")}/><Card>{data.trades.slice(0,3).map((t,i)=><React.Fragment key={t.id || `${t.symbol}-${i}`}>{i>0 && <View style={styles.rowDivider}/>}<TradeRow t={t}/></React.Fragment>)}{data.trades.length===0 && <Text style={styles.emptyText}>No trades returned by the server.</Text>}</Card></>;

  const positionsPage = () => <>{header("Positions", "A closer look at your open exposure.")}<View style={styles.sortRow}>{(["symbol","pnl","value"] as SortKey[]).map(k=><Pressable key={k} onPress={()=>{if(positionSort===k)setSortAsc(!sortAsc);else {setPositionSort(k);setSortAsc(false);}}} style={[styles.filterChip,positionSort===k&&styles.filterActive]}><Text style={[styles.filterText,positionSort===k&&styles.filterTextActive]}>{k==="pnl"?"P/L":k==="value"?"Market value":"Symbol"} {positionSort===k?(sortAsc?"↑":"↓"):""}</Text></Pressable>)}</View><View style={styles.metricsGrid}><Metric title="Open positions" value={String(data.positions.length)} sub="Current snapshot"/><Metric title="Unrealized P/L" value={signedMoney(data.portfolio.unrealized_pnl)} positive={data.portfolio.unrealized_pnl >= 0} sub="Mark-to-market"/></View><Card>{sortedPositions.map((p,i)=><React.Fragment key={p.symbol}>{i>0 && <View style={styles.rowDivider}/>}<PositionRow p={p}/><View style={styles.positionDetails}><Text style={styles.detailText}>Qty <Text style={styles.detailStrong}>{p.quantity}</Text></Text><Text style={styles.detailText}>Avg. entry <Text style={styles.detailStrong}>{money(p.average_entry_price)}</Text></Text><Text style={styles.detailText}>Last <Text style={styles.detailStrong}>{money(p.current_price)}</Text></Text></View></React.Fragment>)}{!data.positions.length && <Text style={styles.emptyText}>No positions available.</Text>}</Card></>;

  const activityPage = () => <>{header("Activity", "Your trade history, from confirmed fills.")}<View style={styles.sortRow}>{(["date","symbol","pnl","value"] as SortKey[]).map(k=><Pressable key={k} onPress={()=>{if(tradeSort===k)setSortAsc(!sortAsc);else {setTradeSort(k);setSortAsc(false);}}} style={[styles.filterChip,tradeSort===k&&styles.filterActive]}><Text style={[styles.filterText,tradeSort===k&&styles.filterTextActive]}>{k==="pnl"?"P/L":k==="value"?"Value":k==="date"?"Date":"Symbol"} {tradeSort===k?(sortAsc?"↑":"↓"):""}</Text></Pressable>)}</View><View style={styles.filterRow}>{(["All","Closed","Open"] as const).map(f=><Pressable key={f} onPress={()=>setFilter(f)} style={[styles.filterChip, filter===f && styles.filterActive]}><Text style={[styles.filterText,filter===f && styles.filterTextActive]}>{f}</Text></Pressable>)}</View><Card>{shownTrades.map((t,i)=><React.Fragment key={t.id || `${t.symbol}-${i}`}>{i>0 && <View style={styles.rowDivider}/>}<TradeRow t={t}/>{t.entry_price != null && <View style={styles.tradeDetails}><Text style={styles.detailText}>Entry <Text style={styles.detailStrong}>{money(t.entry_price)}</Text></Text><Text style={styles.detailText}>Exit <Text style={styles.detailStrong}>{money(t.exit_price)}</Text></Text></View>}</React.Fragment>)}{!shownTrades.length && <Text style={styles.emptyText}>No trades match this filter.</Text>}</Card></>;

  const analyticsPage = () => <>{header("Analytics", "Measure consistency, not just outcomes.")}<Card><Label>REALIZED PROFIT & LOSS</Label><View style={styles.horizonRow}>{(["Today","MTD","YTD","Forever"] as Horizon[]).map(h=><Pressable key={h} onPress={()=>setHorizon(h)} style={[styles.filterChip,horizon===h&&styles.filterActive]}><Text style={[styles.filterText,horizon===h&&styles.filterTextActive]}>{h}</Text></Pressable>)}</View><Text style={[styles.heroValue,{color:periodPnl>=0?C.green:C.red}]}>{signedMoney(periodPnl)}</Text><Text style={styles.muted}>{horizon==="Forever"?"All-time realized result supplied by your server":"Closed-trade P/L · "+periodTrades.length+" matching trades"+(data.trades.length===0?" · no trade history available":"")}</Text><View style={{ marginTop: 20 }}><PerformanceChart values={periodChartValues.length ? periodChartValues : [0]} height={142}/></View><View style={styles.chartFoot}><Text style={styles.chartCaption}>CLOSED TRADES</Text><Text style={styles.chartFootValue}>{data.analytics.closed_trades ?? "N/A"}</Text></View></Card><View style={styles.metricsGrid}><Metric title="Win rate" value={data.analytics.win_rate == null ? "—" : `${data.analytics.win_rate.toFixed(1)}%`} sub="Closed trades"/><Metric title="Max drawdown" value={pct(data.analytics.max_drawdown_percent == null ? undefined : -data.analytics.max_drawdown_percent)} positive={false} sub="Peak-to-trough"/></View><View style={styles.metricsGrid}><Metric title="Average win" value={money(data.analytics.average_win)} positive sub="Per winning trade"/><Metric title="Average loss" value={money(data.analytics.average_loss)} positive={false} sub="Per losing trade"/></View><Card style={styles.noteCard}><BrainCircuit color={C.green} size={20}/><View style={{ flex:1 }}><Text style={styles.rowTitle}>AI analytics · {data.demo?"Unavailable":"Live portfolio analysis"}</Text><Text style={styles.noteText}>{data.demo?"No server data available yet. Connect a server in Settings to analyze your own trade history.":(() => { const closed=data.trades.filter(t=>(t.status||"").toLowerCase()==="closed"&&t.realized_pnl!=null); if(!closed.length)return "Server connected, but no closed trades are available to analyze yet."; const wins=closed.filter(t=>(t.realized_pnl||0)>0), losses=closed.filter(t=>(t.realized_pnl||0)<0), total=closed.reduce((s,t)=>s+(t.realized_pnl||0),0), best=[...closed].sort((a,b)=>(b.realized_pnl||0)-(a.realized_pnl||0))[0], worst=[...closed].sort((a,b)=>(a.realized_pnl||0)-(b.realized_pnl||0))[0]; return "Reviewed "+closed.length+" closed trades: "+wins.length+" winners and "+losses.length+" losers ("+(wins.length/closed.length*100).toFixed(1)+"% win rate from available trade records). Net recorded P/L is "+money(total)+". Best trade: "+best.symbol+" ("+signedMoney(best.realized_pnl)+"). Largest loss: "+worst.symbol+" ("+signedMoney(worst.realized_pnl)+"). "+(wins.length/closed.length<0.5?"Consider reviewing entry filters and loss control.":"Compare average win with average loss to ensure wins compensate for losses."); })()}</Text></View></Card></>;

  const searchPage = () => <>{header("Search", "Find pages, positions, and trade history.")}<Card><Text style={styles.fieldLabel}>SEARCH INVESTAI</Text><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search symbols, strategies, trades, pages…" placeholderTextColor="#687790" style={styles.input} autoCapitalize="none" autoCorrect={false}/></Card>{searchQuery.trim()?<Card>{searchable.map((r,i)=><Pressable key={r.kind+"-"+r.title+"-"+i} onPress={()=>setTab(r.tab)} style={styles.searchResult}><View style={styles.rowMain}><Text style={styles.rowTitle}>{r.title}</Text><Text style={styles.rowSubtitle}>{r.kind} · {r.detail}</Text></View><ChevronRight size={17} color={C.muted}/></Pressable>)}{!searchable.length&&<Text style={styles.emptyText}>No matching pages, positions, or trades.</Text>}</Card>:<Card><Text style={styles.noteText}>Search matches page names, position symbols and names, and available trade fields such as strategy, status, and trade ID.</Text></Card>}</>;
  const settingsPage = () => <>{header("Connection", "Signed in as "+loginName+". Manage your personal server link.")}<Card style={styles.connectionCard}><View style={styles.connectionIcon}>{data.demo ? <CloudOff size={21} color="#F2C879"/> : <Cloud size={21} color={C.green}/>}</View><View style={{flex:1}}><Text style={styles.rowTitle}>{data.demo ? "Not connected" : "Server connected"}</Text><Text selectable style={styles.rowSubtitle}>{connectionMessage}</Text></View></Card>{lastError ? <Card style={styles.errorCard}><View style={styles.infoHeading}><CircleHelp size={18} color={C.red}/><Text style={styles.rowTitle}>Last error · tap and hold to select</Text></View><Text selectable style={styles.errorText}>{lastError}</Text><Pressable onPress={async()=>{await Clipboard.setStringAsync(lastError);Alert.alert("Copied","Error details copied to clipboard.");}} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Copy error details</Text></Pressable></Card> : null}<Card><Text style={styles.fieldLabel}>SERVER HTTPS URL</Text><TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://invest.yourdomain.com" placeholderTextColor="#687790" style={styles.input}/><Text style={styles.fieldHint}>Use your public HTTPS hostname or private-network URL. Avoid raw IP/port exposure without a secure gateway.</Text><Text style={[styles.fieldLabel,{marginTop:20}]}>BEARER TOKEN (OPTIONAL IF SERVER USES ANOTHER AUTH METHOD)</Text><TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Paste your read-only API token" placeholderTextColor="#687790" style={styles.input}/><Pressable onPress={connect} disabled={loading} style={[styles.primaryButton,loading&&{opacity:0.6}]}>{loading?<ActivityIndicator color={C.bg}/>:<ShieldCheck color={C.bg} size={18}/>}<Text style={styles.primaryButtonText}>{loading?"Connecting…":"Connect & sync"}</Text></Pressable><Pressable onPress={()=>sync(false)} disabled={loading} style={styles.secondaryButton}><RefreshCw size={16} color={C.text}/><Text style={styles.secondaryButtonText}>Refresh data</Text></Pressable></Card><Card><View style={styles.infoHeading}><ShieldCheck size={18} color={C.green}/><Text style={styles.rowTitle}>Account</Text></View><Text style={styles.noteText}>Signed in as {loginName} · {accountRole}</Text><Pressable onPress={signOut} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable></Card>{accountRole==="admin"?<Card><View style={styles.infoHeading}><ShieldCheck size={18} color={C.green}/><Text style={styles.rowTitle}>Administrator · account database</Text></View><Text style={styles.fieldLabel}>NEW USERNAME</Text><TextInput value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" placeholder="Username (3+ characters)" placeholderTextColor="#687790" style={styles.input}/><Text style={[styles.fieldLabel,{marginTop:12}]}>TEMPORARY PASSWORD</Text><TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 10 characters" placeholderTextColor="#687790" style={styles.input}/><Pressable onPress={createAccount} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create user account</Text></Pressable><Pressable onPress={loadAdminUsers} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Refresh user list</Text></Pressable>{adminUsers.map(u=><View key={u.id} style={styles.searchResult}><View style={styles.rowMain}><Text style={styles.rowTitle}>{u.username} · {u.role}</Text><Text style={styles.rowSubtitle}>{u.active?"Active":"Disabled"} · ID {u.id}</Text></View><Pressable onPress={async()=>{try{const r=await fetch(authServerUrl.replace(/\/+$/,"")+"/api/v1/admin/users/"+u.id,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken},body:JSON.stringify({active:!u.active})});const j=await r.json();if(!r.ok)throw new Error(j.detail||"Update failed");await loadAdminUsers();}catch(e:any){Alert.alert("Admin error",e?.message||String(e),[{text:"Close"}]);}}}><Text style={styles.action}>{u.active?"Disable":"Enable"}</Text></Pressable></View>)}</Card>:null}<Card style={styles.infoCard}><View style={styles.infoHeading}><ShieldCheck size={18} color={C.green}/><Text style={styles.rowTitle}>Privacy & safety</Text></View><Text style={styles.noteText}>Read-only integration. InvestAI does not place trades or request your Webull password. Remote connections require HTTPS. Keep API tokens private and protect the server behind authentication.</Text><View style={styles.rowDivider}/><View style={styles.infoHeading}><Clock3 size={18} color={C.blue}/><Text style={styles.rowTitle}>Last successful sync</Text></View><Text style={styles.noteText}>{stamp(lastSync || data.lastSync)}</Text><View style={styles.rowDivider}/><View style={styles.infoHeading}><CircleHelp size={18} color={C.muted}/><Text style={styles.rowTitle}>API endpoints required</Text></View><Text style={styles.noteText}>GET /api/v1/portfolio{"\n"}GET /api/v1/positions{"\n"}GET /api/v1/trades{"\n"}GET /api/v1/analytics</Text></Card><Text style={styles.footerText}>InvestAI v0.1 · Private portfolio companion · Not investment advice</Text></>;

  const pages: Record<Tab, () => React.ReactNode> = { Overview: overview, Positions: positionsPage, Activity: activityPage, Analytics: analyticsPage, Search: searchPage, Settings: settingsPage };
  const tabs: {key:Tab; icon:any}[] = [{key:"Overview",icon:ChartNoAxesCombined},{key:"Positions",icon:BriefcaseBusiness},{key:"Activity",icon:Activity},{key:"Analytics",icon:BrainCircuit},{key:"Search",icon:CircleHelp},{key:"Settings",icon:Settings2}];

  if (!loggedIn) return <SafeAreaProvider><SafeAreaView edges={["top","bottom"]} style={styles.safe}><StatusBar barStyle="light-content" backgroundColor={C.bg}/><ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled"><View style={styles.loginLogo}><ChartNoAxesCombined size={30} color={C.bg}/></View><Text style={styles.loginTitle}>InvestAI</Text><Text style={styles.loginSubtitle}>{isCreatingAccount ? "Create a profile stored securely on this device." : "Sign in to your local profile."}</Text><Card><Text style={styles.fieldLabel}>USERNAME</Text><TextInput value={loginName} onChangeText={setLoginName} autoCapitalize="none" autoCorrect={false} placeholder="Username" placeholderTextColor="#687790" style={styles.input}/><Text style={[styles.fieldLabel,{marginTop:18}]}>PASSWORD</Text><View style={styles.passwordWrap}><TextInput value={loginPassword} onChangeText={setLoginPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} placeholder="Password" placeholderTextColor="#687790" style={[styles.input,styles.passwordInput]}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword?"Hide password characters":"Show password characters"} onPress={()=>setShowPassword(v=>!v)} style={styles.passwordToggle}>{showPassword?<EyeOff size={19} color={C.muted}/>:<Eye size={19} color={C.muted}/>}</Pressable></View><View style={styles.biometricRow}><View style={styles.biometricCopy}><Text style={styles.rowTitle}>Enable biometric sign-in</Text><Text style={styles.rowSubtitle}>Use your device fingerprint or face after successful sign-in.</Text></View><Switch value={enableBiometrics} onValueChange={setEnableBiometrics} trackColor={{false:C.border,true:"#52752D"}} thumbColor={enableBiometrics?C.green:C.muted}/></View>{authError?<Text selectable style={styles.errorText}>{authError}</Text>:null}<Pressable onPress={signIn} disabled={loading} style={[styles.primaryButton,loading&&{opacity:0.6}]}>{loading?<ActivityIndicator color={C.bg}/>:<ShieldCheck size={18} color={C.bg}/>}<Text style={styles.primaryButtonText}>{loading?(isCreatingAccount?"Creating profile…":"Signing in…"):(isCreatingAccount?"Create local account":"Sign in")}</Text></Pressable><Pressable onPress={()=>{setIsCreatingAccount(v=>!v);setAuthError("");}} style={styles.serverSetupLink}><Text style={styles.action}>{isCreatingAccount?"Already have a profile? Sign in":"New to InvestAI? Create account"}</Text></Pressable></Card><Text style={styles.loginFoot}>Your profile, server URL, and bearer token are stored locally on this device. Server connection checks run only when both URL and token are saved.</Text></ScrollView></SafeAreaView></SafeAreaProvider>;

  return <SafeAreaProvider><SafeAreaView edges={["top", "bottom"]} style={styles.safe}><StatusBar barStyle="light-content" backgroundColor={C.bg} /><TopBar connected={!data.demo}/><View style={styles.main}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>sync(true)} tintColor={C.green} colors={[C.green]}/>}>{tab==="Overview" ? <View style={styles.pageHeading}><Text style={styles.pageTitle}>Good evening.</Text><Text style={styles.pageSubtitle}>Here's how your portfolio is doing.</Text></View> : null}{pages[tab]()}<View style={{height:18}}/></ScrollView></View><View style={styles.tabBar}>{tabs.map(({key,icon:Icon})=><Pressable key={key} onPress={()=>setTab(key)} style={styles.tabButton}><Icon size={20} color={tab===key?C.green:C.muted} strokeWidth={tab===key?2.5:1.8}/><Text style={[styles.tabLabel,tab===key&&{color:C.green}]}>{key==="Overview"?"Home":key}</Text>{tab===key?<View style={styles.tabIndicator}/>:null}</Pressable>)}</View></SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},passwordWrap:{position:"relative",justifyContent:"center"},passwordInput:{paddingRight:48},passwordToggle:{position:"absolute",right:14,height:"100%",justifyContent:"center"},biometricRow:{flexDirection:"row",alignItems:"center",gap:10,marginTop:17},biometricCopy:{flex:1},serverSetupLink:{alignItems:"center",marginTop:15,gap:3},loginWrap:{flexGrow:1,justifyContent:"center",paddingHorizontal:22,paddingVertical:32},loginLogo:{width:62,height:62,borderRadius:20,backgroundColor:C.green,alignItems:"center",justifyContent:"center",alignSelf:"center",marginBottom:15},loginTitle:{fontSize:32,fontWeight:"900",color:C.text,textAlign:"center",letterSpacing:-1},loginSubtitle:{fontSize:13,color:C.muted,textAlign:"center",marginTop:7,marginBottom:25},loginFoot:{color:C.muted,fontSize:10,lineHeight:16,textAlign:"center",marginTop:10},topBar:{paddingHorizontal:20,paddingTop:10,paddingBottom:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{flexDirection:"row",alignItems:"center",gap:11},logo:{width:40,height:40,borderRadius:13,backgroundColor:C.green,alignItems:"center",justifyContent:"center"},brandName:{color:C.text,fontSize:19,fontWeight:"800",letterSpacing:-0.5},brandSub:{color:C.muted,fontSize:8,fontWeight:"700",letterSpacing:1.5,marginTop:2},statusPill:{flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:C.border,backgroundColor:C.panel,borderRadius:20,paddingHorizontal:10,paddingVertical:7},dot:{width:6,height:6,borderRadius:4},statusText:{color:C.muted,fontSize:9,fontWeight:"800",letterSpacing:0.7},main:{flex:1},content:{paddingHorizontal:18,paddingBottom:14},pageHeading:{marginTop:3,marginBottom:18},pageTitle:{fontSize:27,color:C.text,fontWeight:"800",letterSpacing:-0.8},pageSubtitle:{fontSize:13,color:C.muted,marginTop:5},card:{backgroundColor:C.panel,borderColor:C.border,borderWidth:1,borderRadius:20,padding:16,marginBottom:13},hero:{backgroundColor:"#121E30",padding:19,borderColor:"#2C3D53"},heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},label:{color:C.muted,fontSize:10,fontWeight:"800",letterSpacing:1.05},heroIcon:{height:34,width:34,borderRadius:11,backgroundColor:"#24352B",alignItems:"center",justifyContent:"center"},heroValue:{color:C.text,fontSize:35,fontWeight:"800",letterSpacing:-1.5,marginTop:13},heroChange:{flexDirection:"row",alignItems:"center",gap:4,marginTop:6},heroChangeText:{color:C.green,fontSize:12,fontWeight:"700"},chartLabels:{flexDirection:"row",justifyContent:"space-between",marginTop:23,marginBottom:9},chartCaption:{color:C.muted,fontSize:10,fontWeight:"600"},chartFoot:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:C.border},chartFootValue:{fontSize:15,fontWeight:"800",color:C.text},metricsGrid:{flexDirection:"row",gap:10,marginBottom:5},metric:{flex:1,minWidth:0,padding:14},metricValue:{fontSize:19,fontWeight:"800",color:C.text,marginTop:10,letterSpacing:-0.4},metricSub:{fontSize:10,marginTop:6},sectionHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:14,marginBottom:10},sectionTitle:{fontSize:16,color:C.text,fontWeight:"800",letterSpacing:-0.3},action:{color:C.green,fontSize:12,fontWeight:"700"},rowItem:{flexDirection:"row",alignItems:"center",paddingVertical:9,gap:11},symbolMark:{width:42,height:42,borderRadius:14,backgroundColor:C.panel2,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border},symbolText:{fontSize:10,color:C.text,fontWeight:"800"},rowMain:{flex:1,minWidth:0},rowTitle:{color:C.text,fontSize:13,fontWeight:"700"},rowSubtitle:{color:C.muted,fontSize:10,marginTop:4},rowRight:{alignItems:"flex-end",maxWidth:"45%"},rowDivider:{height:1,backgroundColor:C.border,marginVertical:4},tradeIcon:{width:38,height:38,borderRadius:13,alignItems:"center",justifyContent:"center"},emptyText:{color:C.muted,fontSize:12,paddingVertical:12},pageTitleDummy:{color:C.text},positionDetails:{flexDirection:"row",justifyContent:"space-between",gap:5,paddingLeft:53,paddingBottom:10},detailText:{fontSize:9,color:C.muted},detailStrong:{fontSize:10,color:C.text,fontWeight:"700"},filterRow:{flexDirection:"row",gap:8,marginBottom:13},sortRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:12},horizonRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:14},searchResult:{flexDirection:"row",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.border},filterChip:{borderRadius:14,borderWidth:1,borderColor:C.border,paddingVertical:9,paddingHorizontal:16,backgroundColor:C.panel},filterActive:{backgroundColor:C.green,borderColor:C.green},filterText:{fontSize:12,color:C.muted,fontWeight:"700"},filterTextActive:{color:C.bg},tradeDetails:{flexDirection:"row",gap:20,paddingLeft:49,paddingBottom:8},muted:{color:C.muted,fontSize:11,marginTop:5},noteCard:{flexDirection:"row",gap:12,alignItems:"flex-start"},noteText:{color:C.muted,fontSize:11,lineHeight:17,marginTop:6},connectionCard:{flexDirection:"row",alignItems:"center",gap:12},connectionIcon:{width:42,height:42,borderRadius:14,backgroundColor:C.panel2,alignItems:"center",justifyContent:"center"},fieldLabel:{fontSize:10,color:C.muted,fontWeight:"800",letterSpacing:0.8,marginBottom:8},input:{backgroundColor:C.bg,borderColor:C.border,borderWidth:1,borderRadius:13,paddingHorizontal:13,paddingVertical:13,color:C.text,fontSize:13},fieldHint:{fontSize:10,lineHeight:15,color:C.muted,marginTop:7},primaryButton:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,backgroundColor:C.green,borderRadius:14,paddingVertical:14,marginTop:20},primaryButtonText:{fontSize:13,fontWeight:"800",color:C.bg},secondaryButton:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderRadius:14,borderColor:C.border,borderWidth:1,paddingVertical:13,marginTop:9},secondaryButtonText:{fontSize:12,fontWeight:"700",color:C.text},infoCard:{gap:2},errorCard:{borderColor:"#71313D",backgroundColor:"#211722"},errorText:{color:"#FFD6DB",fontSize:11,lineHeight:17,marginTop:10},infoHeading:{flexDirection:"row",alignItems:"center",gap:9,marginTop:4},footerText:{textAlign:"center",fontSize:9,color:"#64738A",marginTop:6,marginBottom:14},tabBar:{flexDirection:"row",borderTopWidth:1,borderTopColor:C.border,backgroundColor:C.bg,paddingTop:9,paddingBottom:10,paddingHorizontal:3},tabButton:{flex:1,alignItems:"center",justifyContent:"center",gap:5,minWidth:0},tabLabel:{color:C.muted,fontSize:9,fontWeight:"700"},tabIndicator:{width:16,height:2,borderRadius:2,backgroundColor:C.green,marginTop:0}
});