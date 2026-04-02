import { apiPost } from './axios';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
}

export const authApi = {
  login: (data: LoginRequest) => apiPost<LoginResponse>('/auth/login', data),
  register: (data: RegisterRequest) => apiPost<AuthUser>('/auth/register', data),
};
