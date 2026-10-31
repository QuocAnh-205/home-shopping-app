import { Gender, OAuthProvider, Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Token ID: dùng để thu hồi token khi logout (denylist trong Redis) */
  jti: string;
  /** Thời điểm cấp (giây) – so với mốc đổi mật khẩu để vô hiệu hóa phiên cũ */
  iat: number;
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
  avatarUrl: string | null;
}

export interface AccountProfile extends UserProfile {
  phone: string | null;
  gender: Gender | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  createdAt: Date;
  hasPassword: boolean;
  providers: OAuthProvider[];
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}
