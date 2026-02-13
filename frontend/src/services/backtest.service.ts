import axios from "axios";

const API = "http://localhost:5000/api";

export async function getBacktest(id: string, token: string) {
    const res = await axios.get(`${API}/backtest/${id}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return res.data;
}
