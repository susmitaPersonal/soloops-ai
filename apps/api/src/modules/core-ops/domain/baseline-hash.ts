import { createHash } from 'node:crypto';
import type { RequirementPriority } from '@soloops/contracts';

/** The requirement content that a baseline freezes (BR-004). Metadata such as timestamps is excluded. */
export interface FrozenRequirementContent {
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: readonly string[];
  priority: RequirementPriority;
}

/**
 * BR-005: canonical form of a baseline's content — the requirements sorted by `number`, each
 * serialised with a fixed key order. Baselined requirements are immutable, so anyone can
 * recompute this from the stored documents and compare it with `baselines.contentHash`.
 */
export function canonicalBaselineContent(
  requirements: readonly FrozenRequirementContent[],
): string {
  const sorted = [...requirements].sort((a, b) => a.number - b.number);
  return JSON.stringify(
    sorted.map((r) => ({
      number: r.number,
      title: r.title,
      description: r.description,
      acceptanceCriteria: [...r.acceptanceCriteria],
      priority: r.priority,
    })),
  );
}

/** SHA-256 hex of the canonical content (BR-005). */
export function baselineContentHash(requirements: readonly FrozenRequirementContent[]): string {
  return createHash('sha256').update(canonicalBaselineContent(requirements), 'utf8').digest('hex');
}
