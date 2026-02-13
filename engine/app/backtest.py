import requests
from datetime import datetime
from typing import Dict, Any, List

BINANCE_BASE_URL = "https://api.binance.com"
FEE_RATE = 0.001  # 0.1%


def fetch_candles(symbol: str, interval: str, start_date: str, end_date: str):
    start_ts = int(datetime.fromisoformat(start_date).timestamp() * 1000)
    end_ts = int(datetime.fromisoformat(end_date).timestamp() * 1000)

    url = f"{BINANCE_BASE_URL}/api/v3/klines"

    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": start_ts,
        "endTime": end_ts,
        "limit": 1000
    }

    response = requests.get(url, params=params)
    response.raise_for_status()

    return response.json()


def run_backtest(
    code: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str
) -> Dict[str, Any]:

    local_env = {}
    exec(code, {}, local_env)
    generate_signal = local_env["generate_signal"]

    candles_raw = fetch_candles(symbol, timeframe, start_date, end_date)

    balance = initial_balance
    position = None
    trades: List[Dict] = []
    equity_curve: List[float] = [initial_balance]

    peak_equity = initial_balance
    max_drawdown = 0

    wins = []
    losses = []

    for candle in candles_raw:
        candle_data = {
            "open": float(candle[1]),
            "high": float(candle[2]),
            "low": float(candle[3]),
            "close": float(candle[4]),
            "volume": float(candle[5]),
            "timestamp": candle[0]
        }

        signal = generate_signal(candle_data)

        if signal == "BUY" and position is None:
            position = candle_data["close"]

        elif signal == "SELL" and position is not None:
            entry_price = position
            exit_price = candle_data["close"]

            gross_pnl = exit_price - entry_price

            # Apply fees (entry + exit)
            fee = (entry_price + exit_price) * FEE_RATE
            net_pnl = gross_pnl - fee

            balance += net_pnl

            trades.append({
                "entry_price": entry_price,
                "exit_price": exit_price,
                "gross_pnl": gross_pnl,
                "net_pnl": net_pnl
            })

            if net_pnl > 0:
                wins.append(net_pnl)
            else:
                losses.append(net_pnl)

            position = None

            equity_curve.append(balance)

            # Update drawdown
            if balance > peak_equity:
                peak_equity = balance

            drawdown = (peak_equity - balance) / peak_equity
            if drawdown > max_drawdown:
                max_drawdown = drawdown

    total_return = balance - initial_balance
    total_return_pct = (total_return / initial_balance) * 100

    win_rate = (len(wins) / len(trades) * 100) if trades else 0

    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = sum(losses) / len(losses) if losses else 0

    profit_factor = (
        abs(sum(wins) / sum(losses)) if losses else 0
    )

    return {
        "initial_balance": initial_balance,
        "final_balance": balance,
        "total_return": total_return,
        "total_return_pct": total_return_pct,
        "total_trades": len(trades),
        "win_rate_pct": win_rate,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "profit_factor": profit_factor,
        "max_drawdown_pct": max_drawdown * 100,
        "equity_curve": equity_curve,
        "trades": trades
    }
