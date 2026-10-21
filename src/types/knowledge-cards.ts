export type CardRating = "forgot" | "fuzzy" | "known";
export type KnowledgeCard = {
  id: string; category: string; front: string; answer: string; pitfall: string;
  practice: string; confidence: string;
  source: { course: string; item: string; question: string; questionTitle: string };
};
export type CardProgress = {
  rating: CardRating | null; due: number; streak: number; myAnswer: string;
};
export type CardProgressMap = Record<string, CardProgress>;
export type CardsReport = {
  cards: KnowledgeCard[]; progress: CardProgressMap; revision: number;
};
