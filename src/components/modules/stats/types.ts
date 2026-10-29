export type ActivityStatus = 'completed' | 'in_progress' | 'not_started';

export interface ActivityDetail {
  status: ActivityStatus;
  label: string;
  completedAt?: string;
  timeSpentMinutes?: number;
  score?: string;
}

export interface Student5EProgress {
  studentId: string;
  stt: number;
  studentCode: string;
  studentName: string;
  className: string;
  avatar?: string;
  engage: ActivityDetail;
  explore: ActivityDetail;
  explain: ActivityDetail;
  elaborate: ActivityDetail;
  evaluate: ActivityDetail;
  progressPct: number;
  avgQuizScore?: number | null;
  qualityLabel?: string;
  isQualityPass?: boolean;
  rating: 'good' | 'pass' | 'need_effort' | 'not_started'; // 🎯 Hoàn thành tốt (100% + Điểm ≥ 8.0), 👍 Đạt (100% + Điểm 5.0-7.9), 💪 Cần cố gắng (<100% hoặc Điểm < 5.0), ⏳ Chưa vào học (0%)
  lastActiveText: string;
  isAtRisk: boolean; // 0% progress OR 100% progress but low quiz score (< 5.0)
}

export interface StatsOverview {
  totalStudents: number;
  completedCount: number;
  completedPct: number;
  inProgressCount: number;
  inProgressPct: number;
  notStartedCount: number;
  notStartedPct: number;
  avgProgressPct: number;
}

export interface Activity5EStats {
  key: 'engage' | 'explore' | 'explain' | 'elaborate' | 'evaluate';
  name: string;
  stepCode: string;
  completedCount: number;
  totalStudents: number;
  completedPct: number;
}
