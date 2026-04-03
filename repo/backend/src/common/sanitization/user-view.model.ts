export interface UserView {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  deviceFingerprint?: string | null;
  lastIp?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
