export const Role = {
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  EMPLOYER: 'EMPLOYER',
  FREELANCER: 'FREELANCER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Roles a user can pick on sign-up. Staff roles are granted by an admin. */
export const SELF_SIGNUP_ROLES: Role[] = [Role.EMPLOYER, Role.FREELANCER];
