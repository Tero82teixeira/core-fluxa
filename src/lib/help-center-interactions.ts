import type { HelpArticle } from "@/lib/help-center";

export type HelpArticleActivationEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function openHelpArticle(
  event: HelpArticleActivationEvent,
  article: HelpArticle,
  selectArticle: (article: HelpArticle) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  selectArticle(article);
}

export function goToHelpArticleModule(
  event: HelpArticleActivationEvent,
  selected: HelpArticle,
  selectArticle: (article: HelpArticle | null) => void,
  navigate: (route: string) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const relatedRoute = selected.relatedRoute;
  selectArticle(null);
  navigate(relatedRoute);
}
