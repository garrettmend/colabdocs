/**
 * The whole permission model lives here so it can be read (and tested) in one
 * place. A user's relationship to a document is one of these roles, or null
 * when they have no access at all.
 */
export type Role = "owner" | "editor" | "viewer";
export type ShareRole = Exclude<Role, "owner">;

export const SHARE_ROLES: readonly ShareRole[] = ["editor", "viewer"] as const;

export const can = {
  view: (role: Role | null): role is Role => role !== null,
  edit: (role: Role | null) => role === "owner" || role === "editor",
  share: (role: Role | null) => role === "owner",
  delete: (role: Role | null) => role === "owner",
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Can edit",
  viewer: "Can view",
};
