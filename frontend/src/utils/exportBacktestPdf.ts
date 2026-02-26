import jsPDF from "jspdf";

/* ==============================
   Helpers: Export charts as images
============================== */

async function svgElementToPngDataUrl(
  svgEl: SVGElement,
  width = 1600,
  height = 600,
  background = "#0b1220"
): Promise<string> {
  const svgText = new XMLSerializer().serializeToString(svgEl);

  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      // Important for some browsers even when using blob
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(e);
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context not available");

    // background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    // draw svg
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getCanvasDataUrl(selector: string): string | null {
  const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function safeText(x: any) {
  if (x == null) return "-";
  return String(x);
}

function fmtNum(x: any, d = 2) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(d);
}

function fmtPct(x: any, d = 2) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(d)}%`;
}

/* ==============================
   PDF Export
============================== */

export async function exportStructuredBacktestPdf({
  run,
  metrics,
  trades,
  openPositionsAtEnd,
  hadForcedClose,
}: {
  run: any;
  metrics: any;
  trades: any[];
  openPositionsAtEnd?: number;
  hadForcedClose?: boolean;
}) {
  const pdf = new jsPDF("p", "mm", "a4");

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;

  let y = 16;

  const title = (t: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(t, margin, y);
    pdf.setFontSize(11);
    y += 10;
  };

  const section = (t: string) => {
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(t, margin, y);
    pdf.setFontSize(11);
    y += 6;
    pdf.setDrawColor(51, 65, 85); // slate-700-ish
    pdf.line(margin, y, pageW - margin, y);
    y += 6;
  };

  const row = (label: string, value: any) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(label, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(safeText(value), margin + 55, y);
    y += 6;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      pdf.addPage();
      y = 16;
    }
  };

  // ==============================
  // COVER / SUMMARY
  // ==============================

  title("QuantLab Backtest Report");

  section("Strategy");
  row("Algorithm", run?.algorithm_name ?? run?.algorithm_id ?? "-");
  row("Symbol", run?.symbol);
  row("Timeframe", run?.timeframe);
  row("Exchange", run?.exchange);
  row("Fee rate", fmtNum(run?.fee_rate, 6));
  row(
    "Period",
    `${String(run?.start_date ?? "").slice(0, 10)} → ${String(run?.end_date ?? "").slice(0, 10)}`
  );
  row("Candles", run?.candles_count ?? metrics?.candles_count ?? "-");

  ensureSpace(10);
  section("Performance");
  row("Initial balance", fmtNum(run?.initial_balance, 2));
  row("Total return (USDT)", fmtNum(metrics?.total_return_usdt, 2));
  row("Total return (%)", fmtPct(metrics?.total_return_percent, 2));
  row("Max drawdown (%)", fmtPct(metrics?.max_drawdown_percent, 2));
  row("Sharpe", fmtNum(metrics?.sharpe_ratio ?? metrics?.sharpe, 2));
  row("Win rate (%)", fmtPct(metrics?.win_rate_percent, 2));
  row("Profit factor", fmtNum(metrics?.profit_factor, 2));
  row("Total trades", safeText(metrics?.total_trades ?? trades?.length ?? 0));
  if (hadForcedClose) {
    row(
      "Forced closures",
      `${openPositionsAtEnd ?? 0} position(s) closed at final candle`
    );
  }

  // ==============================
  // CHARTS (Equity SVG -> PNG) + Candles canvas -> PNG
  // ==============================

  // Equity chart wrapper svg
  const equitySvg = document.querySelector(
    "#equity-chart-wrapper svg"
  ) as SVGElement | null;

  // Candlestick chart wrapper canvas
  const candlePng = getCanvasDataUrl("#candle-chart-wrapper canvas");

  // Add charts page
  pdf.addPage();
  y = 16;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Charts", margin, y);
  pdf.setFontSize(11);
  y += 10;

  // Equity image
  if (equitySvg) {
    const equityPng = await svgElementToPngDataUrl(equitySvg, 1600, 600);
    pdf.setFont("helvetica", "bold");
    pdf.text("Equity Curve", margin, y);
    y += 6;

    const imgW = pageW - margin * 2;
    const imgH = 70; // fixed height
    pdf.addImage(equityPng, "PNG", margin, y, imgW, imgH);
    y += imgH + 10;
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.text("Equity curve chart not found in DOM.", margin, y);
    y += 10;
  }

  // Candle image
  if (candlePng) {
    ensureSpace(90);
    pdf.setFont("helvetica", "bold");
    pdf.text("Price Chart & Trade Markers", margin, y);
    y += 6;

    const imgW = pageW - margin * 2;
    const imgH = 90;
    pdf.addImage(candlePng, "PNG", margin, y, imgW, imgH);
    y += imgH + 6;
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.text("Candlestick chart canvas not found in DOM.", margin, y);
    y += 10;
  }

  // ==============================
  // TRADES TABLE (paginada simple)
  // ==============================

  pdf.addPage();
  y = 16;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Trades", margin, y);
  pdf.setFontSize(10);
  y += 10;

  // headers
  const headers = ["#", "Side", "Qty", "Entry", "Exit", "PnL", "Opened", "Closed"];
  const colX = [margin, margin + 10, margin + 28, margin + 48, margin + 70, margin + 95, margin + 120, margin + 155];

  pdf.setFont("helvetica", "bold");
  headers.forEach((h, i) => pdf.text(h, colX[i], y));
  pdf.setFont("helvetica", "normal");
  y += 6;
  pdf.setDrawColor(51, 65, 85);
  pdf.line(margin, y, pageW - margin, y);
  y += 6;

  const rows = trades ?? [];
  for (let i = 0; i < rows.length; i++) {
    ensureSpace(10);

    const t = rows[i];
    const opened = String(t?.opened_at ?? "").slice(0, 19).replace("T", " ");
    const closed = String(t?.closed_at ?? "").slice(0, 19).replace("T", " ");

    const vals = [
      String(i + 1),
      safeText(t?.side) + (t?.forced_close ? " (Forced)" : ""),
      fmtNum(t?.quantity, 4),
      fmtNum(t?.entry_price, 2),
      t?.exit_price == null ? "-" : fmtNum(t?.exit_price, 2),
      fmtNum(t?.pnl ?? t?.net_pnl, 2),
      opened || "-",
      closed || "-",
    ];

    vals.forEach((v, c) => pdf.text(v, colX[c], y));
    y += 6;
  }

  // footer date
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Generated: ${new Date().toISOString()}`, margin, pageH - 10);

  pdf.save(`backtest-${run?.symbol ?? "symbol"}-${run?.timeframe ?? "tf"}.pdf`);
}