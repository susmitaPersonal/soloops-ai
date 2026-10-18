import type { Migration } from '../src/platform/db/migrations';
import { migration0001 } from './0001-identity-and-workspaces';
import { migration0002 } from './0002-core-ops';
import { migration0003 } from './0003-scope-guard-and-ai';
import { migration0004 } from './0004-delivery-and-billable-work';
import { migration0005 } from './0005-invoices';
import { migration0006 } from './0006-scope-check';
import { migration0007 } from './0007-membership-version';

/** All migrations in order. Append new scripts; never edit or remove merged ones. */
export const migrations: Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
  migration0007,
];
