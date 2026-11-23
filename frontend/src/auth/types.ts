/** Shape of `GET /auth/me` (AUTH_RBAC §1.1). There is no membership list yet (MASTERPLAN §8.3 G-4). */
export interface ActiveFacilityInfo {
  id: string;
  name: string;
  name_bn?: string;
  role?: string;
}

export interface UserMe {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  preferred_language: string;
  roles: string[];
  active_facility: ActiveFacilityInfo | null;
  permissions: string[];
  is_platform_admin: boolean;
}
