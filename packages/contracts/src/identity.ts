import { z } from 'zod';
import { idSchema } from './common';
import { roleSchema } from './workspace';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: 'Email must be at most 254 characters.' })
  .pipe(z.email({ error: 'Enter a valid email address.' }));

/** SEC-001 / security-architecture: 12–256 characters, no composition rules. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` });

export const personNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(120, { error: 'Name must be at most 120 characters.' });

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Workspace name is required.' })
  .max(120, { error: 'Workspace name must be at most 120 characters.' });

/** FR-001, FR-003. `workspaceName` defaults to "<name>'s workspace" (S-01). */
export const registerRequestSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  workspaceName: workspaceNameSchema.optional(),
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

/** FR-002. The password is not length-checked on login beyond the max, to keep errors generic. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password.' }).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const userDtoSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const workspaceSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  role: roleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

/** Response of register, login and GET /auth/me. */
export const sessionResponseSchema = z.object({
  user: userDtoSchema,
  workspaces: z.array(workspaceSummarySchema),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
