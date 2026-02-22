from .validator import SAFE_GLOBALS
from .data import fetch_candles
from .metrics import calculate_metrics
from .clients import get_exchange_client
from .spec import load_config_from_env


def run_backtest(
    code: str,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str
) -> dict:

    # ============================
    # SAFE EXECUTION ENVIRONMENT
    # ============================
    execution_env = SAFE_GLOBALS.copy()
    exec(code, execution_env, execution_env)

    if "generate_signal" not in execution_env:
        raise Exception("generate_signal not defined")

    generate_signal = execution_env["generate_signal"]

    # ============================
    # LOAD + VALIDATE CONFIG (optional)
    # ============================
    # Backward compatible: if CONFIG doesn't exist, defaults apply.
    config, config_used = load_config_from_env(execution_env)

    # ============================
    # EXCHANGE CLIENT + FEE
    # ============================
    client = get_exchange_client(exchange)
    fee_rate = client.get_default_fee_rate()

    candles_raw = fetch_candles(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        start_date=start_date,
        end_date=end_date
    )

    balance = float(initial_balance)
    position = None
    entry_timestamp = None

    trades: list[dict] = []
    equity_curve: list[dict] = []

    peak_equity = balance
    max_drawdown = 0.0

    wins: list[float] = []
    losses: list[float] = []

    # ============================
    # MAIN LOOP
    # ============================
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
            entry_timestamp = candle_data["timestamp"]

        # ============================
        # EXIT
        # ============================
        elif signal == "SELL" and position is not None:

            entry_price = position
            exit_price = candle_data["close"]

            gross_pnl = exit_price - entry_price

            # NOTE: quantity is still 1 in the current model.
            # Next commit will apply sizing using config.batch_size.
            fee = (entry_price * fee_rate) + (exit_price * fee_rate)

            net_pnl = gross_pnl - fee
            balance += net_pnl

            trade = {
                # keep legacy-compatible keys
                "entry_price": entry_price,
                "exit_price": exit_price,
                "net_pnl": net_pnl,

                # detailed fields
                "pnl": net_pnl,
                "gross_pnl": gross_pnl,
                "fee": fee,
                "side": "LONG",
                "quantity": 1,
                "opened_at": entry_timestamp,
                "closed_at": candle_data["timestamp"],
                "duration_ms": (
                    candle_data["timestamp"] - entry_timestamp
                    if entry_timestamp
                    else None
                ),
            }

            trades.append(trade)

            if net_pnl > 0:
                wins.append(net_pnl)
            else:
                losses.append(net_pnl)

            position = None
            entry_timestamp = None

        # ============================
        # MARK TO MARKET EQUITY
        # ============================
        if position is not None:
            unrealized = candle_data["close"] - position
            current_equity = balance + unrealized
        else:
            current_equity = balance

        equity_curve.append({
            "timestamp": candle_data["timestamp"],
            "equity": current_equity
        })

        # ============================
        # DRAWDOWN
        # ============================
        if current_equity > peak_equity:
            peak_equity = current_equity

        drawdown = (peak_equity - current_equity) / peak_equity
        max_drawdown = max(max_drawdown, drawdown)

    # ============================
    # LEGACY METRICS (KEEPING COMPATIBILITY)
    # ============================
    total_return_usdt = balance - initial_balance
    total_return_percent = (
        (total_return_usdt / initial_balance) * 100
        if initial_balance
        else 0
    )

    total_trades = len(trades)
    win_rate_percent = (
        (len(wins) / total_trades * 100)
        if total_trades
        else 0
    )

    total_wins = sum(wins)
    total_losses = abs(sum(losses)) if losses else 0

    profit_factor = (
        (total_wins / total_losses)
        if total_losses > 0
        else 0
    )

    # ============================
    # ADVANCED METRICS
    # ============================
    analysis = calculate_metrics(
        equity_curve=equity_curve,
        trades=trades,
        initial_balance=float(initial_balance),
        timeframe=timeframe,
        risk_free_rate=0.0
    )

    # ============================
    # RETURN STRUCTURE
    # ============================
    return {
        "exchange": exchange,
        "fee_rate": fee_rate,

        # NEW: config info (useful for DB + UI)
        "config_used": config_used,

        "initial_balance": initial_balance,
        "final_balance": balance,

        # DB-compatible names
        "total_return_usdt": total_return_usdt,
        "total_return_percent": total_return_percent,
        "max_drawdown_percent": max_drawdown * 100,
        "win_rate_percent": win_rate_percent,
        "profit_factor": profit_factor,
        "total_trades": total_trades,

        "equity_curve": equity_curve,
        "trades": trades,
        "analysis": analysis
    }
