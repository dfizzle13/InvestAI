export type Portfolio = {
  currency: string;
  virtual_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  daily_pnl: number;
  daily_pnl_percent: number;
  updated_at?: string;
};

export type Position = {
  symbol: string;
  name?: string;
  quantity: number;
  side?: "long" | "short";
  market_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_percent?: number;
  average_entry_price?: number;
  current_price?: number;
};

export type Trade = {
  id?: string;
  symbol: string;
  side?: string;
  status?: string;
  quantity?: number;
  entry_price?: number;
  exit_price?: number;
  realized_pnl?: number;
  opened_at?: string;
  closed_at?: string;
  strategy?: string;
};

export type Analytics = {
  win_rate?: number;
  closed_trades?: number;
  average_win?: number;
  average_loss?: number;
  max_drawdown_percent?: number;
  daily?: { date: string; pnl: number }[];
};

export type AppData = {
  portfolio: Portfolio;
  positions: Position[];
  trades: Trade[];
  analytics: Analytics;
  demo: boolean;
  lastSync?: string;
};

export const DEMO_DATA: AppData = {
  demo: true,
  lastSync: undefined,
  portfolio: {
    currency: "USD",
    virtual_equity: 10043.07,
    realized_pnl: 178.44,
    unrealized_pnl: 43.07,
    daily_pnl: 12.31,
    daily_pnl_percent: 0.12
  },
  positions: [
    { symbol: "STX", name: "Seagate Technology", quantity: 2, side: "long", market_value: 249.60, unrealized_pnl: 5.88, unrealized_pnl_percent: 2.41, average_entry_price: 121.86, current_price: 124.80 },
    { symbol: "WMT", name: "Walmart Inc.", quantity: 3, side: "long", market_value: 309.75, unrealized_pnl: 2.64, unrealized_pnl_percent: 0.86, average_entry_price: 102.37, current_price: 103.25 },
    { symbol: "KLAC", name: "KLA Corporation", quantity: 1, side: "long", market_value: 174.80, unrealized_pnl: -0.56, unrealized_pnl_percent: -0.32, average_entry_price: 175.36, current_price: 174.80 }
  ],
  trades: [
    { id: "demo-1", symbol: "STX", side: "long", status: "closed", quantity: 2, entry_price: 121.86, exit_price: 124.80, realized_pnl: 5.88, opened_at: "2026-10-19T14:31:00-04:00", closed_at: "2026-10-19T15:02:00-04:00", strategy: "Breakout" },
    { id: "demo-2", symbol: "WMT", side: "long", status: "open", quantity: 3, entry_price: 102.37, realized_pnl: 0, opened_at: "2026-10-19T13:05:00-04:00", strategy: "Momentum" },
    { id: "demo-3", symbol: "KLAC", side: "long", status: "closed", quantity: 1, entry_price: 175.36, exit_price: 174.80, realized_pnl: -0.56, opened_at: "2026-10-18T10:12:00-04:00", closed_at: "2026-10-18T11:20:00-04:00", strategy: "Breakout" }
  ],
  analytics: { win_rate: 54.2, closed_trades: 42, average_win: 18.42, average_loss: -11.37, max_drawdown_percent: 3.8, daily: [{ date: "2026-10-15", pnl: 7.24 }, { date: "2026-10-16", pnl: -4.12 }, { date: "2026-10-17", pnl: 15.80 }, { date: "2026-10-18", pnl: -2.41 }, { date: "2026-10-19", pnl: 12.31 }] }
};