export type RestoreIssueKind = 'trip' | 'photo-list' | 'photo' | 'groups';

export interface RestoreIssue {
  kind: RestoreIssueKind;
  reason: string;
}

export interface RestoreSummary {
  restoredTrips: number;
  failedTrips: number;
  restoredPhotos: number;
  existingPhotos: number;
  failedPhotos: number;
  failedPhotoLists: number;
  groupsRestored: boolean;
  groupsFailed: boolean;
  issues: RestoreIssue[];
}

export function emptyRestoreSummary(): RestoreSummary {
  return {
    restoredTrips: 0,
    failedTrips: 0,
    restoredPhotos: 0,
    existingPhotos: 0,
    failedPhotos: 0,
    failedPhotoLists: 0,
    groupsRestored: false,
    groupsFailed: false,
    issues: [],
  };
}

function itemCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function distinctReasons(issues: RestoreIssue[]): string[] {
  return Array.from(new Set(issues.map((issue) => issue.reason.trim()).filter(Boolean)));
}

export function restoreSummaryMessage(summary: RestoreSummary): string {
  const hasFailures = summary.failedTrips > 0 || summary.failedPhotos > 0 ||
    summary.failedPhotoLists > 0 || summary.groupsFailed;
  const restored = [itemCount(summary.restoredTrips, 'trip'), itemCount(summary.restoredPhotos, 'photo')];

  if (!hasFailures) {
    const existing = summary.existingPhotos > 0
      ? ` ${itemCount(summary.existingPhotos, 'photo')} already existed on this device.`
      : '';
    return `Restore complete. ${restored.join(' and ')} restored.${existing}`;
  }

  const failures: string[] = [];
  if (summary.failedTrips > 0) failures.push(`${itemCount(summary.failedTrips, 'trip')} could not be restored`);
  if (summary.failedPhotos > 0) failures.push(`${itemCount(summary.failedPhotos, 'photo')} could not be restored`);
  if (summary.failedPhotoLists > 0) {
    failures.push(`photos for ${itemCount(summary.failedPhotoLists, 'waypoint')} could not be checked`);
  }
  if (summary.groupsFailed) failures.push('trip groups could not be restored');

  const reasons = distinctReasons(summary.issues);
  const reasonText = reasons.length > 0 ? `\nReason: ${reasons.join(' ')}` : '';
  return `Restore completed with some problems.\n${restored.join(' and ')} restored.\n${failures.join('; ')}.${reasonText}`;
}
