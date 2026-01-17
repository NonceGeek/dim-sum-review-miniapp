export interface ITaskDetail {
  data: string;
  source: string;
  source_name: string;
  cantonesePronunciations: [];
  phrases: [];
  phrases_join: string;
}

export interface IBlock {
  type: string;
  content?: string;
  url?: string;
  duration?: string;
  new?: boolean;
}

export interface ICusttomCantoneseItem {
  jyutping: string;
  type: "character" | "word" | "idiom" | "sentence"; // 或 "word", "idiom", 'sentence'
  text: string;
  blocks: IBlock[];
}
