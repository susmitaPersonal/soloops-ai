'use client';

import type { ChangeRequestDetail, RequirementDto } from '@soloops/contracts';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import styles from '@/features/core-ops/core-ops.module.css';
import { DraftEditor } from './DraftEditor';
import { NextStepPanel } from './NextStepPanel';
import { ProposalView } from './ProposalView';
import { VersionCompare } from './VersionCompare';

/**
 * S-07 interactive part: the selected version (editable draft or frozen proposal), the "Next
 * step" panel and version compare. Proposing is blocked while the draft has unsaved changes, so
 * the client is never sent a version the freelancer has not saved.
 */
export function ChangeRequestWorkspace({
  workspaceId,
  cr,
  versionNumber,
  requirements,
  currency,
  aiAvailable,
  isOwner,
  today,
  basePath,
}: {
  workspaceId: string;
  cr: ChangeRequestDetail;
  versionNumber: number;
  requirements: RequirementDto[];
  currency: string;
  aiAvailable: boolean;
  isOwner: boolean;
  today: string;
  basePath: string;
}) {
  const [dirty, setDirty] = useState(false);
  const version = cr.versions.find((v) => v.number === versionNumber) ?? cr.versions.at(-1);
  if (!version) return null;
  const editable = version.state === 'DRAFT' && !cr.readOnly;
  const keys = new Map(requirements.map((r) => [r.id, `${r.key} ${r.title}`]));

  return (
    <div className={styles.page}>
      <div className={styles.split}>
        <div className={styles.page}>
          {editable ? (
            <DraftEditor
              key={`${cr.id}-${version.number}`}
              workspaceId={workspaceId}
              cr={cr}
              version={version}
              requirements={requirements}
              currency={currency}
              aiAvailable={aiAvailable}
              isOwner={isOwner}
              onDirtyChange={setDirty}
            />
          ) : (
            <ProposalView version={version} requirements={requirements} />
          )}
        </div>
        <div className={styles.page}>
          {dirty && editable ? (
            <Alert tone="warning" title="Save the draft first">
              You have unsaved changes. Save them before proposing to the client.
            </Alert>
          ) : (
            <NextStepPanel
              workspaceId={workspaceId}
              cr={cr}
              version={version}
              today={today}
              basePath={basePath}
            />
          )}
        </div>
      </div>
      {cr.versions.length > 1 ? (
        <VersionCompare
          workspaceId={workspaceId}
          crId={cr.id}
          versionNumbers={cr.versions.map((v) => v.number)}
          requirementKeys={keys}
        />
      ) : null}
    </div>
  );
}
