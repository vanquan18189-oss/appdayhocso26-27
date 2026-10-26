import { normalizeStudentCode } from './studentCode';

export interface ScanStats {
  totalScanned: number;
  lostIdsFound: number;
  fixedIds: number;
  dryRun: boolean;
}

export function scanAndFixSubmissions(dryRun: boolean = true): ScanStats {
  const stats: ScanStats = {
    totalScanned: 0,
    lostIdsFound: 0,
    fixedIds: 0,
    dryRun
  };

  const allSubsRaw = localStorage.getItem('eduplay_all_exam_submissions');
  if (!allSubsRaw) return stats;

  let allSubs = [];
  try {
    allSubs = JSON.parse(allSubsRaw);
  } catch { return stats; }

  const updatedSubs = allSubs.map((sub: any) => {
    stats.totalScanned++;
    const currentId = sub.studentId || sub.maHs || sub.studentCode || sub.code || '';
    const normalized = normalizeStudentCode(currentId);
    
    // Check if ID is 'lost' or 'u-4'
    if (!normalized || normalized === 'U-4' || normalized === 'HS-TEMP') {
      stats.lostIdsFound++;
      if (!dryRun) {
        // Here we can't easily map back to the student name/roster without more context.
        // For now, mark as 'LOST' or try to recover from name if possible.
        sub.studentId = 'LOST-ID';
        stats.fixedIds++;
      }
    }
    return sub;
  });

  if (!dryRun) {
    localStorage.setItem('eduplay_all_exam_submissions', JSON.stringify(updatedSubs));
  }

  return stats;
}
