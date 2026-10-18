import { z } from 'zod';
import { idSchema } from './common';
import { emailSchema } from './identity';
import { roleSchema } from './workspace';

/**
 * FR-004 workspace members (US-003, S-12). Owners add an **existing** user by email as `MEMBER`
 * and remove members; the last owner can never be removed. There are no invitations or role
 * changes in the MVP.
 */
export const memberDtoSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  joinedAt: z.string(),
});
export type MemberDto = z.infer<typeof memberDtoSchema>;

export const memberListResponseSchema = z.object({ items: z.array(memberDtoSchema) });
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

/** POST {ws}/members (owner): the user must already have a SoloOps account. Joins as MEMBER. */
export const addMemberRequestSchema = z.object({ email: emailSchema });
export type AddMemberRequest = z.input<typeof addMemberRequestSchema>;

/** The most members a workspace may have (small freelance teams, bounded list, no pagination). */
export const MAX_WORKSPACE_MEMBERS = 50;
