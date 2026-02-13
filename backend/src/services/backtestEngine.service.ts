import axios from "axios";
import { env } from "../config/env";

export async function runBacktestOnEngine(payload: {
    code: string;
    symbol: string;
    timeframe: string;
    initial_balance: number;
    start_date: string;
    end_date: string;
}) {
    try {
        const response = await axios.post(
            `${env.ENGINE_URL}/backtest`,
            payload
        );

        return response.data;
    } catch (error: any) {
        if (error.response) {
            throw new Error(error.response.data.detail);
        }

        throw new Error("Engine unavailable");
    }
}
