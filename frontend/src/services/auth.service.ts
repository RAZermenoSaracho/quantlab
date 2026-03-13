import api from "./api.service";
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  PublicProfileResponse,
  RegisterRequest,
  UsernameAvailabilityResponse,
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
  username: string | null;
  provider: "google" | "github" | "password";
  created_at?: string | null;
};

export function getAuthProfile(): Promise<AuthProfile> {
  return api.get<AuthProfile>("/auth/profile");
}

export function updateAuthProfile(payload: {
  username: string;
}): Promise<{ id: string; email: string; username: string }> {
  return api.put<{ id: string; email: string; username: string }>(
    "/auth/profile",
    payload
  );
}

export function checkUsernameAvailability(
  username: string
): Promise<UsernameAvailabilityResponse> {
  return api.get<UsernameAvailabilityResponse>("/auth/username-availability", {
    username,
  });
}

export function getPublicProfile(
  username: string
): Promise<PublicProfileResponse> {
  return api.get<PublicProfileResponse>(`/auth/profile/${username}`);
}

export function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/change-password", payload);
}
