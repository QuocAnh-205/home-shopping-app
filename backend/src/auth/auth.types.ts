import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Token ID: dùng để thu hồi token khi logout (denylist trong Redis) */
  jti: string;
  exp: number;
}

export type JwtClaims = Pick<JwtPayload, 'sub' | 'email' | 'role'>;

export interface AuthenticatedRequest {
  user: JwtPayload;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}
