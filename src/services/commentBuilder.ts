export type DatLevel = 'T' | 'HT' | 'CHT';

export function buildLevelComment(score: number, total: number): { dat: DatLevel; comment: string } {
  // Score is out of total (e.g. 8/10)
  const percentage = (score / total) * 100;
  
  if (percentage >= 80) {
    return { 
      dat: 'T', 
      comment: "Em hoàn thành rất tốt, nắm vững kiến thức, tư duy nhạy bén và tích cực trong bài học." 
    };
  } else if (percentage >= 50) {
    return { 
      dat: 'HT', 
      comment: "Em đã hoàn thành các yêu cầu cơ bản. Cần chú ý rèn luyện thêm để khắc sâu kiến thức hơn nữa." 
    };
  } else {
    return { 
      dat: 'CHT', 
      comment: "Em cần dành nhiều thời gian hơn để ôn tập và nắm vững nội dung bài học. Thầy cô luôn sẵn sàng hỗ trợ em." 
    };
  }
}

export function getReviewLine(wrongQuestions: { topic: string }[]): string {
  const topics = Array.from(new Set(wrongQuestions.map(q => q.topic))).slice(0, 3);
  if (topics.length === 0) return "";
  return `Cần ôn tập: ${topics.join(', ')}.`;
}
