export interface ISentiments {
	sentiment: string;
	exampleSentences: string[];
}

export interface ITaskDetail {
	data: string;
	source: string;
	source_name: string;
	cantonesePronunciations: [];
	phrases:[];
	sentiments: ISentiments[];
	phrases_join: string;
}
