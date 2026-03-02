from datetime import datetime
import asyncio
import logging
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .backtest import run_backtest
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


# ======================================================
# ===================== Lifespan =======================
# ======================================================

@app.on_event("shutdown")
async def _shutdown():
    logger.info("Engine shutdown initiated. Stopping active paper sessions...")

    # Stop all active paper sessions
    for run_id, session in list(ACTIVE_PAPER_SESSIONS.items()):
        try:
            logger.info("Stopping paper session during shutdown run_id=%s", run_id)
            await session.stop()
        except Exception:
            logger.exception("Failed stopping session during shutdown run_id=%s", run_id)

    ACTIVE_PAPER_SESSIONS.clear()

    # Close shared HTTP client
    try:
        from .paper_trading import close_http_client
        await close_http_client()
    except Exception:
        logger.exception("Error during shutdown cleanup")

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


# ======================================================
# ===================== Paper Trading ==================
# ======================================================

@app.post("/paper/start")
async def start_paper(request: PaperStartRequest):

    if request.run_id in ACTIVE_PAPER_SESSIONS:
        raise HTTPException(status_code=400, detail="Paper run already active")

    try:
        from .paper_trading import build_paper_session

        session = build_paper_session(request)
        ACTIVE_PAPER_SESSIONS[request.run_id] = session

        await session.start()

        logger.info("Paper session started run_id=%s symbol=%s timeframe=%s",
                    request.run_id, request.symbol, request.timeframe)

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