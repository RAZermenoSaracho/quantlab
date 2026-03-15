from datetime import datetime, timezone
import asyncio
import os
import logging
from typing import Any, Dict, Optional
from contextlib import suppress

import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from .backtest import run_backtest
from .clients import ExchangeFactory
from .data.candle_aggregator import expand_minute_candles_to_subminute
from .optimizer import run_optimizer
from .validator import AlgorithmValidationError, validate_algorithm

# ======================================================
# ================= LOGGING CONFIG =====================
# ======================================================

logging.basicConfig(
    level=logging.INFO,  # change to DEBUG if needed
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

# Optional: silence noisy libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)

logger = logging.getLogger("quantlab.engine")
DEFAULT_STRATEGY_WORKERS = 4

# ======================================================
# =================== APP INIT =========================
# ======================================================

load_dotenv()

app = FastAPI(
    title="QuantLab Engine",
    version="0.3.0",
)

# ======================================================
# ===================== Schemas ========================
# ======================================================

class AlgorithmRequest(BaseModel):
    code: str = Field(..., description="Python algorithm code")


class BacktestRequest(BaseModel):
    code: str
    exchange: str = Field(default="binance")
    symbol: str = Field(..., example="BTCUSDT")
    timeframe: str = Field(..., example="1h")
    initial_balance: float = Field(..., gt=0)
    start_date: str
    end_date: str
    fee_rate: Optional[float] = Field(default=None, ge=0)
    run_id: Optional[str] = None

    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    testnet: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_iso_date(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v)
        except ValueError:
            raise ValueError("Dates must be ISO format (YYYY-MM-DDTHH:MM:SS)")
        return v


class OptimizerRequest(BaseModel):
    code: str
    exchange: str = Field(default="binance")
    symbol: str = Field(..., example="BTCUSDT")
    timeframe: str = Field(..., example="1h")
    initial_balance: float = Field(..., gt=0)
    start_date: str
    end_date: str
    param_space: Dict[str, list[Any]]
    fee_rate: Optional[float] = Field(default=None, ge=0)

    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    testnet: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_optimizer_iso_date(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v)
        except ValueError:
            raise ValueError("Dates must be ISO format (YYYY-MM-DDTHH:MM:SS)")
        return v


class PaperStartRequest(BaseModel):
    run_id: str
    code: str

    exchange: str = Field(default="binance")
    symbol: str = Field(..., example="BTCUSDT")
    timeframe: str = Field(..., example="1m")

    initial_balance: float = Field(..., gt=0)
    fee_rate: Optional[float] = Field(default=None, ge=0)

    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    testnet: bool = False


# ======================================================
# =============== Engine Global State ==================
# ======================================================

BACKTEST_PROGRESS: Dict[str, int] = {}
ACTIVE_PAPER_SESSIONS: Dict[str, Any] = {}
RECONCILIATION_TASK: Optional[asyncio.Task[None]] = None
_RECOVERY_LOCK = asyncio.Lock()
RECONCILIATION_INTERVAL_SECONDS = 30


# ======================================================
# ===================== Lifespan =======================
# ======================================================

async def _fetch_running_paper_runs() -> list[dict[str, Any]]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.warning("DATABASE_URL missing. Paper run recovery disabled.")
        return []

    conn: Optional[asyncpg.Connection] = None
    try:
        conn = await asyncpg.connect(database_url)
        rows = await conn.fetch(
            """
            SELECT
              p.id AS run_id,
              a.code,
              COALESCE(p.exchange, 'binance') AS exchange,
              p.symbol,
              p.timeframe,
              p.initial_balance,
              p.fee_rate
            FROM paper_runs p
            JOIN algorithms a ON a.id = p.algorithm_id
            WHERE LOWER(p.status::text) IN ('active', 'running')
            ORDER BY p.started_at ASC
            """
        )
        return [dict(row) for row in rows]
    finally:
        if conn is not None:
            await conn.close()


async def _start_paper_session_if_missing(
    request: PaperStartRequest,
    *,
    source: str,
) -> bool:
    if request.run_id in ACTIVE_PAPER_SESSIONS:
        return False

    from .paper_trading import build_paper_session

    session = build_paper_session(request)
    ACTIVE_PAPER_SESSIONS[request.run_id] = session

    try:
        await session.start()
        logger.info(
            "Paper session started source=%s run_id=%s symbol=%s timeframe=%s",
            source,
            request.run_id,
            request.symbol,
            request.timeframe,
        )
        return True
    except Exception:
        ACTIVE_PAPER_SESSIONS.pop(request.run_id, None)
        raise


async def restore_running_sessions(
    runs: Optional[list[dict[str, Any]]] = None,
) -> None:
    async with _RECOVERY_LOCK:
        rows = runs if runs is not None else await _fetch_running_paper_runs()
        restored_count = 0

        for row in rows:
            run_id = str(row["run_id"])
            if run_id in ACTIVE_PAPER_SESSIONS:
                continue

            try:
                started = await _start_paper_session_if_missing(
                    PaperStartRequest(
                        run_id=run_id,
                        code=str(row["code"]),
                        exchange=str(row.get("exchange") or "binance"),
                        symbol=str(row["symbol"]),
                        timeframe=str(row["timeframe"]),
                        initial_balance=float(row["initial_balance"] or 0),
                        fee_rate=float(row["fee_rate"] or 0.001),
                    ),
                    source="recovery",
                )
                if started:
                    restored_count += 1
            except Exception:
                logger.exception("Failed to recover paper session run_id=%s", run_id)

        logger.info(
            "Engine recovery: %d sessions restored",
            restored_count,
        )


async def reconciliation_loop() -> None:
    while True:
        await asyncio.sleep(RECONCILIATION_INTERVAL_SECONDS)
        try:
            runs = await _fetch_running_paper_runs()
            logger.debug(
                "Engine reconciliation checked %d runs",
                len(runs),
            )
            await restore_running_sessions(runs)
        except Exception:
            logger.exception("Paper reconciliation loop iteration failed")


@app.on_event("startup")
async def _startup():
    global RECONCILIATION_TASK

    try:
        from .events import get_strategy_event_system
        await get_strategy_event_system().start_workers(DEFAULT_STRATEGY_WORKERS)
        logger.info("Strategy event workers started: %s", DEFAULT_STRATEGY_WORKERS)
    except Exception:
        logger.exception("Failed to start strategy event workers.")

    try:
        await restore_running_sessions()
    except Exception:
        logger.exception("Initial paper run recovery failed.")

    RECONCILIATION_TASK = asyncio.create_task(reconciliation_loop())
    logger.info("Paper reconciliation loop started interval=%ss", RECONCILIATION_INTERVAL_SECONDS)


@app.on_event("shutdown")
async def _shutdown():
    global RECONCILIATION_TASK

    logger.info(
        "Engine shutdown initiated. Preserving active paper runs state for backend recovery."
    )

    # IMPORTANT:
    # Do not call session.stop() on process shutdown. `stop()` emits STOPPED events to the
    # backend, which would incorrectly mark runs as user-stopped during restarts.
    # We only clear in-memory references here; backend startup recovery will restore runs.
    ACTIVE_PAPER_SESSIONS.clear()

    if RECONCILIATION_TASK is not None:
        RECONCILIATION_TASK.cancel()
        with suppress(asyncio.CancelledError):
            await RECONCILIATION_TASK
        RECONCILIATION_TASK = None

    # Close shared HTTP client
    try:
        from .paper_trading import close_http_client
        await close_http_client()
    except Exception:
        logger.exception("Error during shutdown cleanup")

    try:
        from .market import get_market_stream_manager
        await get_market_stream_manager().stop_all()
    except Exception:
        logger.exception("Error stopping market stream manager during shutdown")

    try:
        from .events import get_strategy_event_system
        await get_strategy_event_system().stop_workers()
    except Exception:
        logger.exception("Error stopping strategy event workers during shutdown")

    logger.info("Engine shutdown cleanup completed.")

# ======================================================
# ===================== Health =========================
# ======================================================

@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "engine running"}


# ======================================================
# ================= Algorithm Validation ===============
# ======================================================

@app.post("/validate")
async def validate(request: AlgorithmRequest) -> Dict[str, Any]:
    try:
        return validate_algorithm(request.code)
    except AlgorithmValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected validation error")
        raise HTTPException(status_code=500, detail="Internal validation error")


# ======================================================
# ===================== Backtesting ====================
# ======================================================

@app.post("/backtests")
async def backtest(request: BacktestRequest):
    if request.run_id:
        BACKTEST_PROGRESS[request.run_id] = 0

    def progress_callback(progress_pct: int):
        if request.run_id:
            BACKTEST_PROGRESS[request.run_id] = progress_pct

    result = await asyncio.to_thread(
        run_backtest,
        code=request.code,
        exchange=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        initial_balance=request.initial_balance,
        start_date=request.start_date,
        end_date=request.end_date,
        fee_rate=request.fee_rate,
        api_key=request.api_key,
        api_secret=request.api_secret,
        testnet=request.testnet,
        progress_callback=progress_callback,
    )

    if request.run_id:
        BACKTEST_PROGRESS[request.run_id] = 100

    return {"success": True, "data": result}


@app.get("/backtest-progress/{run_id}")
async def get_progress(run_id: str):
    return {"progress": BACKTEST_PROGRESS.get(run_id, 0)}


@app.post("/optimizer/run")
async def optimizer_run(request: OptimizerRequest):
    logger.info("Received optimizer request")

    try:
        result = await asyncio.to_thread(
            run_optimizer,
            request.code,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            initial_balance=request.initial_balance,
            start_date=request.start_date,
            end_date=request.end_date,
            param_space=request.param_space,
            fee_rate=request.fee_rate,
            api_key=request.api_key,
            api_secret=request.api_secret,
            testnet=request.testnet,
        )
        logger.info("Optimizer completed successfully")
    except Exception:
        logger.exception("Optimizer execution failed")
        raise

    return {"success": True, "data": result}


# ======================================================
# ===================== Paper Trading ==================
# ======================================================

@app.post("/paper/start")
async def start_paper(request: PaperStartRequest):

    if request.run_id in ACTIVE_PAPER_SESSIONS:
        raise HTTPException(status_code=400, detail="Paper run already active")

    try:
        await _start_paper_session_if_missing(request, source="api")

        return {
            "success": True,
            "message": "Paper trading session started",
            "run_id": request.run_id,
        }

    except Exception as e:
        logger.exception("Failed to start paper session")
        ACTIVE_PAPER_SESSIONS.pop(request.run_id, None)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/paper/stop/{run_id}")
async def stop_paper(run_id: str):

    session = ACTIVE_PAPER_SESSIONS.get(run_id)

    if not session:
        return {
            "success": True,
            "message": "Session already stopped or not active in memory",
            "run_id": run_id,
        }

    try:
        await session.stop()
        ACTIVE_PAPER_SESSIONS.pop(run_id, None)

        logger.info("Paper session stopped run_id=%s", run_id)

        return {
            "success": True,
            "message": "Paper trading session stopped",
            "run_id": run_id,
        }

    except asyncio.CancelledError:
        ACTIVE_PAPER_SESSIONS.pop(run_id, None)
        logger.info("Paper session stop cancelled but treated as stopped run_id=%s", run_id)
        return {
            "success": True,
            "message": "Paper trading session stopped",
            "run_id": run_id,
        }
    except Exception as e:
        logger.exception("Failed to stop paper session")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/paper/status/{run_id}")
async def paper_status(run_id: str):

    session = ACTIVE_PAPER_SESSIONS.get(run_id)

    if not session:
        return {"active": False}

    equity = session.quote_balance
    if session.base_balance > 0 and session.last_price:
        equity += session.base_balance * session.last_price

    return {
        "active": True,
        "quote_balance": session.quote_balance,
        "base_balance": session.base_balance,
        "equity": equity,
        "position": session.position,
    }


@app.get("/market/history")
async def market_history(
    exchange: str = Query(...),
    symbol: str = Query(...),
    limit: int = Query(500, ge=1, le=50_000),
):
    from .market import get_market_stream_manager

    candles = await get_market_stream_manager().get_history(
        exchange=exchange,
        symbol=symbol,
        limit=limit,
    )

    return {
        "exchange": exchange,
        "symbol": symbol,
        "candles": candles,
    }


def _parse_iso_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_kline_rows(rows: list[list[Any]]) -> list[dict[str, float]]:
    return [
        {
            "timestamp": int(row[0]),
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "volume": float(row[5]),
        }
        for row in rows
    ]


@app.get("/market/candles")
async def market_candles(
    symbol: str = Query(...),
    timeframe: str = Query("1m"),
    start: str = Query(...),
    end: str = Query(...),
    exchange: str = Query("binance"),
):
    try:
        start_dt = _parse_iso_datetime(start)
        end_dt = _parse_iso_datetime(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start/end datetime format")

    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="end must be greater than start")

    requested_timeframe = timeframe.lower()
    source_timeframe = (
        "1m"
        if requested_timeframe in {"1s", "5s", "15s", "30s"}
        else timeframe
    )

    try:
        client = ExchangeFactory.create(exchange=exchange)
        raw_rows = await asyncio.to_thread(
            client.fetch_candles,
            symbol.upper(),
            source_timeframe,
            start_dt.isoformat(),
            end_dt.isoformat(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(
            "Failed to fetch market candles exchange=%s symbol=%s timeframe=%s",
            exchange,
            symbol,
            timeframe,
        )
        raise HTTPException(status_code=502, detail=f"Unable to fetch candles: {exc}")

    candles = _normalize_kline_rows(raw_rows)
    if requested_timeframe in {"1s", "5s", "15s", "30s"}:
        candles = expand_minute_candles_to_subminute(candles, requested_timeframe)

    return {
        "exchange": exchange,
        "symbol": symbol.upper(),
        "timeframe": requested_timeframe,
        "candles": candles,
    }
