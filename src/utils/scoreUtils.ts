/**
 * Utility functions for score formatting and qualitative evaluations
 */

export function formatScore(score: number | string | null | undefined, fallback: string = '--'): string {
  if (score === null || score === undefined || score === '') return fallback;
  const num = typeof score === 'number' ? score : parseFloat(String(score));
  if (isNaN(num)) return fallback;
  return (Math.round(num * 10) / 10).toFixed(1);
}

export function roundTotalScore(score: number | string | null | undefined): number {
  if (score === null || score === undefined || score === '' || score === '-') return 0;
  const num = typeof score === 'number' ? score : parseFloat(String(score));
  if (isNaN(num)) return 0;
  return Math.round(num); // Standard mathematical rounding to nearest integer (.5+ rounds up, <.5 rounds down)
}

export function formatTotalScore(score: number | string | null | undefined, fallback: string = '0'): string {
  if (score === null || score === undefined || score === '' || score === '-') return fallback;
  const num = typeof score === 'number' ? score : parseFloat(String(score));
  if (isNaN(num)) return fallback;
  return String(Math.round(num)); // Displays nearest integer e.g. 6.5 -> "7", 6.4 -> "6"
}

export function getCurrentSubmissionTimestamp(): string {
  return new Date().toISOString();
}

export function formatSubmissionDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function isSubjectWithScore(subjectName?: string): boolean {
  if (!subjectName) return false;
  const name = subjectName.toLowerCase().trim();
  if (
    name.includes('đạo đức') ||
    name.includes('tự nhiên và xã hội') ||
    name.includes('tnxh') ||
    name.includes('mĩ thuật') ||
    name.includes('mỹ thuật') ||
    name.includes('giáo dục thể chất') ||
    name.includes('gdtc') ||
    name.includes('thể dục') ||
    name.includes('âm nhạc') ||
    name.includes('hoạt động trải nghiệm') ||
    name.includes('hđtn')
  ) {
    return false;
  }
  return true;
}

export function getQualitativeLevel(
  scoreOrCorrectCount?: number | string | null,
  totalQuestions?: number
): 'T' | 'H' | 'CHT' {
  if (scoreOrCorrectCount === null || scoreOrCorrectCount === undefined || scoreOrCorrectCount === '') return 'H';

  if (typeof totalQuestions === 'number' && totalQuestions > 0) {
    const correct = typeof scoreOrCorrectCount === 'number' ? scoreOrCorrectCount : parseFloat(String(scoreOrCorrectCount));
    if (isNaN(correct)) return 'H';
    const ratio = correct / totalQuestions;
    if (ratio >= 0.8) return 'T';
    if (ratio >= 0.5) return 'H';
    return 'CHT';
  }

  const num = typeof scoreOrCorrectCount === 'number' ? scoreOrCorrectCount : parseFloat(String(scoreOrCorrectCount));
  if (isNaN(num)) return 'H';
  if (num >= 8.0) return 'T';
  if (num >= 5.0) return 'H';
  return 'CHT';
}

export function getQualitativeLabel(
  levelOrCorrectCount?: 'T' | 'H' | 'CHT' | string | number | null,
  totalQuestions?: number
): string {
  if (levelOrCorrectCount === null || levelOrCorrectCount === undefined) return 'Hoàn thành (H)';

  if (typeof levelOrCorrectCount === 'number' && typeof totalQuestions === 'number') {
    const lvl = getQualitativeLevel(levelOrCorrectCount, totalQuestions);
    return getQualitativeLabel(lvl);
  }

  if (typeof levelOrCorrectCount === 'number') {
    const lvl = getQualitativeLevel(levelOrCorrectCount);
    return getQualitativeLabel(lvl);
  }

  const str = String(levelOrCorrectCount).trim();
  if (str === 'T') return 'Hoàn thành tốt (T)';
  if (str === 'H') return 'Hoàn thành (H)';
  if (str === 'CHT') return 'Chưa hoàn thành (CHT)';

  const num = parseFloat(str);
  if (!isNaN(num)) {
    const lvl = getQualitativeLevel(num, totalQuestions);
    return getQualitativeLabel(lvl);
  }

  return str;
}
