import api from "./api.service";
import type {
  AuthProfile,
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  PublicProfileResponse,
  RegisterRequest,
  UpdateAuthProfileRequest,
  UpdateAuthProfileResponse,
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

export function getAuthProfile(): Promise<AuthProfile> {
  return api.get<AuthProfile>("/auth/profile");
}

export function updateAuthProfile(
  payload: UpdateAuthProfileRequest
): Promise<UpdateAuthProfileResponse> {
  return api.put<UpdateAuthProfileResponse>(
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

export function changePassword(
  payload: ChangePasswordRequest
): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/change-password", payload);
}
