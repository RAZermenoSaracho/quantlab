import axios from "axios";
import { env } from "../config/env";

export async function validateAlgorithm(code: string) {
    try {
        const response = await axios.post(
            `${env.ENGINE_URL}/validate`,
            { code }
        );

        return response.data;
    } catch (error: any) {
        if (error.response) {
            // Error from engine
            throw new Error(error.response.data.detail || "Validation failed");
        }

        throw new Error("Engine service unavailable");
    }
}
