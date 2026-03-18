interface IDataset {
  label: string;
  value: string;
}

interface ICorpusItem {
  category_name: string;
  permission: string;
}

interface TaskSummary {
  corpusId: string;
  completionRate: number;
  processedCount: number;
  totalCorpusCount: number;
  totalCount: number;
  unprocessedCount: number;
}

interface UserSummary {
  assigneeRef: string;
  nickname: string;
  avatar: string;
}

type ItemSummary = UserSummary & TaskSummary;
