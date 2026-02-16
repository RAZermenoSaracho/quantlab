from .validator import SAFE_GLOBALS
from .data import fetch_candles

FEE_RATE = 0.001  # 0.1% per trade

def run_backtest(
    code: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str
) -> dict[str, any]:

    # 🔐 SAFE EXECUTION ENVIRONMENT
    execution_env = SAFE_GLOBALS.copy()
    exec(code, execution_env, execution_env)

    if "generate_signal" not in execution_env:
        raise Exception("generate_signal not defined")

    generate_signal = execution_env["generate_signal"]

    candles_raw = fetch_candles(symbol, timeframe, start_date, end_date)

    balance = float(initial_balance)
    position = None

    trades: list[dict] = []
    equity_curve: list[float] = []

    peak_equity = balance
    max_drawdown = 0.0

    wins: list[float] = []
    losses: list[float] = []

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

        # ============================
        # ENTRY
        # ============================
        if signal == "BUY" and position is None:
            position = candle_data["close"]

        # ============================
        # EXIT
        # ============================
        elif signal == "SELL" and position is not None:

            entry_price = position
            exit_price = candle_data["close"]

            gross_pnl = exit_price - entry_price
            fee = (entry_price + exit_price) * FEE_RATE
            net_pnl = gross_pnl - fee

            balance += net_pnl

            trades.append({
                "entry_price": entry_price,
                "exit_price": exit_price,
                "net_pnl": net_pnl
            })

            if net_pnl > 0:
                wins.append(net_pnl)
            else:
                losses.append(net_pnl)

            position = None

        # ============================
        # MARK TO MARKET EQUITY
        # ============================
        if position is not None:
            # unrealized PnL
            unrealized = candle_data["close"] - position
            current_equity = balance + unrealized
        else:
            current_equity = balance

        equity_curve.append(current_equity)

        # ============================
        # DRAWDOWN
        # ============================
        if current_equity > peak_equity:
            peak_equity = current_equity

        drawdown = (peak_equity - current_equity) / peak_equity
        max_drawdown = max(max_drawdown, drawdown)

    # ============================
    # METRICS
    # ============================

    total_return_usdt = balance - initial_balance
    total_return_percent = (total_return_usdt / initial_balance) * 100

    total_trades = len(trades)
    win_rate_percent = (len(wins) / total_trades * 100) if total_trades else 0

    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = sum(losses) / len(losses) if losses else 0

    total_wins = sum(wins)
    total_losses = abs(sum(losses)) if losses else 0

    profit_factor = (
        (total_wins / total_losses) if total_losses > 0 else 0
    )

    return {
        "initial_balance": initial_balance,
        "final_balance": balance,

        # 🔥 DB-compatible names
        "total_return_usdt": total_return_usdt,
        "total_return_percent": total_return_percent,
        "max_drawdown_percent": max_drawdown * 100,
        "win_rate_percent": win_rate_percent,
        "profit_factor": profit_factor,
        "total_trades": total_trades,

        "equity_curve": equity_curve,
        "trades": trades
    }
