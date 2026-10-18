import type { UserDto } from '@soloops/contracts';

/** Persistence shape of `users` (data-model.md §4.1). `passwordHash` never leaves the API. */
export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence shape of `sessions` (data-model.md §4.2). `_id` = SHA-256 of the cookie token. */
export interface SessionDoc {
  _id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export function toUserDto(doc: Pick<UserDoc, '_id' | 'name' | 'email'>): UserDto {
  return { id: doc._id, name: doc.name, email: doc.email };
}
