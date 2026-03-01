from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, Optional
from datetime import datetime
import logging
from dotenv import load_dotenv
import asyncio

from .validator import validate_algorithm, AlgorithmValidationError
from .backtest import run_backtest


# ======================================================
# =================== APP INIT =========================
# ======================================================
load_dotenv()

app = FastAPI(
    title="QuantLab Engine",
    version="0.2.0"
)

logger = logging.getLogger("quantlab.engine")


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

    # 🔥 Optional live/testnet credentials
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    testnet: bool = False

    # ============================
    # DATE VALIDATION
    # ============================

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_iso_date(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v)
        except ValueError:
            raise ValueError("Dates must be ISO format (YYYY-MM-DDTHH:MM:SS)")
        return v


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
    except Exception as e:
        logger.exception("Unexpected validation error")
        raise HTTPException(status_code=500, detail="Internal validation error")


# ======================================================
# ===================== Backtesting ====================
# ======================================================
BACKTEST_PROGRESS = {}
@app.post("/backtests")
async def backtest(request: BacktestRequest):

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

    BACKTEST_PROGRESS[request.run_id] = 100

    return {
        "success": True,
        "data": result
    }

@app.get("/backtest-progress/{run_id}")
async def get_progress(run_id: str):
    progress = BACKTEST_PROGRESS.get(run_id, 0)
    return {"progress": progress}