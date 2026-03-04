import api from "./api.service";
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
} from "@quantlab/contracts";

export function loginUser(payload: LoginRequest): Promise<AuthResponse> {
  return api.post<AuthResponse>("/auth/login", payload);
}

export function registerUser(payload: RegisterRequest): Promise<AuthResponse> {
  return api.post<AuthResponse>("/auth/register", payload);
}

export function getMe(): Promise<MeResponse> {
  return api.get<MeResponse>("/auth/me");
}
