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

export type AuthProfile = {
  id: string;
  email: string;
  provider: "google" | "github" | "password";
  created_at?: string | null;
};

export function getAuthProfile(): Promise<AuthProfile> {
  return api.get<AuthProfile>("/auth/profile");
}

export function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/change-password", payload);
}
