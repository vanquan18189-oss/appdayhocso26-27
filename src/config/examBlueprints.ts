
export interface QuestionSubPart {
  id: string;
  label: string;
  points: number;
}

export interface QuestionBlueprint {
  questionNumber: number;
  type: 'single_choice' | 'multi_choice' | 'true_false' | 'essay';
  points: number;
  subParts?: QuestionSubPart[];
  config?: any;
}

export interface ExamBlueprint {
  id: string;
  title: string;
  durationMinutes: number;
  totalPoints: number;
  parts: {
    partName: string;
    points: number;
    questions: QuestionBlueprint[];
  }[];
}

export const TECHNOLOGY_GRADE3_FINAL_EXAM_BLUEPRINT: ExamBlueprint = {
  id: 'tech-grade3-final',
  title: 'Đề kiểm tra định kì cuối học kì 1 - Công nghệ lớp 3',
  durationMinutes: 40,
  totalPoints: 10,
  parts: [
    {
      partName: 'Phần I. Trắc nghiệm',
      points: 6.0,
      questions: [
        { questionNumber: 1, type: 'single_choice', points: 1.0 },
        { questionNumber: 2, type: 'single_choice', points: 1.0 },
        { questionNumber: 3, type: 'single_choice', points: 1.0 },
        { questionNumber: 4, type: 'single_choice', points: 1.0 },
        { 
          questionNumber: 5, 
          type: 'multi_choice', 
          points: 1.0, 
          config: { wrongSelectionPenalty: 0.5, minScore: 0 } 
        },
        { questionNumber: 6, type: 'true_false', points: 1.0 }
      ]
    },
    {
      partName: 'Phần II. Tự luận',
      points: 4.0,
      questions: [
        { 
          questionNumber: 7, 
          type: 'essay', 
          points: 2.0, 
          subParts: [{ id: 'a', label: 'Ý a', points: 1.0 }, { id: 'b', label: 'Ý b', points: 1.0 }] 
        },
        { 
          questionNumber: 8, 
          type: 'essay', 
          points: 2.0, 
          subParts: [{ id: 'a', label: 'Ý a', points: 1.0 }, { id: 'b', label: 'Ý b', points: 1.0 }] 
        }
      ]
    }
  ]
};
