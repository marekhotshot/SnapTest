export type QuestionType = 'mcq' | 'tf' | 'short';

export interface Question {
  id: number;
  type: QuestionType;
  question: string;
  options: string[];
  correct: string;
  hint?: string;
}

export type AppState = 'upload' | 'processing' | 'quiz' | 'evaluating' | 'results' | 'bonus_offer';

export interface EvaluationResult {
  score: number;
  total: number;
  details: {
    questionIndex: number;
    isCorrect: boolean;
    feedback?: string;
    aiExplanation?: string;
  }[];
}
