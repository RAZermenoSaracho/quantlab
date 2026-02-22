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
    # SAFE EXECUTION
    # ============================
    execution_env = SAFE_GLOBALS.copy()
    exec(code, execution_env, execution_env)

    if "generate_signal" not in execution_env:
        raise Exception("generate_signal not defined")

    generate_signal = execution_env["generate_signal"]

    # ============================
    # LOAD CONFIG
    # ============================
    config, config_used = load_config_from_env(execution_env)

    # ============================
    # EXCHANGE
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

    # ============================
    # STATE VARIABLES
    # ============================
    balance = float(initial_balance)
    max_allowed_capital = initial_balance * (config.max_account_exposure_pct / 100)

    position = None
    position_quantity = 0.0
    entry_timestamp = None
    last_exit_timestamp = None

    trades = []
    equity_curve = []

    peak_equity = balance
    max_drawdown = 0.0

    wins = []
    losses = []

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

        current_price = candle_data["close"]
        signal = generate_signal(candle_data)

        # ============================
        # AUTO EXIT: STOP LOSS / TAKE PROFIT
        # ============================
        if position is not None:

            pnl_pct = ((current_price - position) / position) * 100

            sl_hit = (
                config.stop_loss_pct is not None
                and pnl_pct <= -config.stop_loss_pct
            )

            tp_hit = (
                config.take_profit_pct is not None
                and pnl_pct >= config.take_profit_pct
            )

            if sl_hit or tp_hit:
                signal = "SELL"

        # ============================
        # ENTRY LOGIC
        # ============================
        if signal == "BUY" and position is None:

            # cooldown check
            if (
                config.cooldown_seconds > 0
                and last_exit_timestamp is not None
                and (candle_data["timestamp"] - last_exit_timestamp)
                < config.cooldown_seconds * 1000
            ):
                pass  # skip entry due to cooldown

            else:
                # Determine quantity
                if config.batch_size_type == "fixed":
                    quantity = config.batch_size
                else:
                    # percent_balance
                    capital_to_use = balance * (config.batch_size / 100)
                    quantity = capital_to_use / current_price

                # Exposure check
                capital_required = quantity * current_price

                if capital_required > balance:
                    quantity = balance / current_price
                    capital_required = quantity * current_price

                if capital_required <= max_allowed_capital:
                    position = current_price
                    position_quantity = quantity
                    entry_timestamp = candle_data["timestamp"]

        # ============================
        # EXIT LOGIC
        # ============================
        elif signal == "SELL" and position is not None:

            entry_price = position
            exit_price = current_price
            quantity = position_quantity

            gross_pnl = (exit_price - entry_price) * quantity

            fee = (
                (entry_price * quantity * fee_rate) +
                (exit_price * quantity * fee_rate)
            )

            net_pnl = gross_pnl - fee

            balance += net_pnl

            trade = {
                "entry_price": entry_price,
                "exit_price": exit_price,
                "net_pnl": net_pnl,
                "pnl": net_pnl,
                "gross_pnl": gross_pnl,
                "fee": fee,
                "side": "LONG",
                "quantity": quantity,
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
            position_quantity = 0.0
            entry_timestamp = None
            last_exit_timestamp = candle_data["timestamp"]

        # ============================
        # EQUITY CALCULATION
        # ============================
        if position is not None:
            unrealized = (
                (current_price - position) * position_quantity
            )
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

        # Kill switch if configured
        if (
            config.max_drawdown_pct is not None
            and drawdown * 100 >= config.max_drawdown_pct
        ):
            break

    # ============================
    # METRICS
    # ============================
    total_return_usdt = balance - initial_balance
    total_return_percent = (
        (total_return_usdt / initial_balance) * 100
        if initial_balance else 0
    )

    total_trades = len(trades)
    win_rate_percent = (
        (len(wins) / total_trades * 100)
        if total_trades else 0
    )

    total_wins = sum(wins)
    total_losses = abs(sum(losses)) if losses else 0

    profit_factor = (
        (total_wins / total_losses)
        if total_losses > 0 else 0
    )

    analysis = calculate_metrics(
        equity_curve=equity_curve,
        trades=trades,
        initial_balance=float(initial_balance),
        timeframe=timeframe,
        risk_free_rate=0.0
    )

    return {
        "exchange": exchange,
        "fee_rate": fee_rate,
        "config_used": config_used,

        "initial_balance": initial_balance,
        "final_balance": balance,

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
