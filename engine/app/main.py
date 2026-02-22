from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional

from .validator import validate_algorithm, AlgorithmValidationError
from .backtest import run_backtest


app = FastAPI(
    title="QuantLab Engine",
    version="0.1.0"
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


# ======================================================
# ===================== Health =========================
# ======================================================

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "engine running"}


# ======================================================
# ================= Algorithm Validation ===============
# ======================================================

@app.post("/validate")
def validate(request: AlgorithmRequest) -> Dict[str, Any]:
    try:
        return validate_algorithm(request.code)
    except AlgorithmValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ======================================================
# ===================== Backtesting ====================
# ======================================================

@app.post("/backtest")
def backtest(request: BacktestRequest) -> Dict[str, Any]:
    try:
        return run_backtest(
            code=request.code,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            initial_balance=request.initial_balance,
            start_date=request.start_date,
            end_date=request.end_date,
            fee_rate=request.fee_rate
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
