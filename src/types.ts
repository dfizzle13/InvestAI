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

export const EMPTY_DATA: AppData = {
  demo: true,
  lastSync: undefined,
  portfolio: {
    currency: "USD",
    virtual_equity: 0,
    realized_pnl: 0,
    unrealized_pnl: 0,
    daily_pnl: 0,
    daily_pnl_percent: 0
  },
  positions: [],
  trades: [],
  analytics: {
    win_rate: undefined,
    closed_trades: undefined,
    average_win: undefined,
    average_loss: undefined,
    max_drawdown_percent: undefined,
    daily: []
  }
};
