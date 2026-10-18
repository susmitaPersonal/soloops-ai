import type { Database, TxSession } from '../../platform/db';
import type { SessionDoc, UserDoc } from './documents';

export function createIdentityRepository(db: Database) {
  const users = db.global<UserDoc>('users');
  const sessions = db.global<SessionDoc>('sessions');
  return {
    insertUser: (doc: UserDoc, tx: TxSession) => users.insertOne(doc, { session: tx }),
    findUserByEmail: (email: string) => users.findOne({ email }),
    findUserById: (id: string) => users.findOne({ _id: id }),
    findUsersByIds: (ids: string[]) =>
      ids.length === 0
        ? Promise.resolve([])
        : users.find({ _id: { $in: ids } }, { limit: ids.length }),
    insertSession: (doc: SessionDoc) => sessions.insertOne(doc),
    findSession: (id: string) => sessions.findOne({ _id: id }),
    touchSession: (id: string, lastSeenAt: Date, expiresAt: Date) =>
      sessions.updateOne({ _id: id }, { $set: { lastSeenAt, expiresAt } }),
    deleteSession: (id: string) => sessions.deleteOne({ _id: id }),
  };
}
