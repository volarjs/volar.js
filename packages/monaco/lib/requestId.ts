import type { CancellationToken } from 'monaco-types';
import type { WorkerLanguageService } from '../worker.js';

const requestIdMap = new WeakMap<WorkerLanguageService, number>();

export function getRequestId(token: CancellationToken, languageService: WorkerLanguageService) {
	const nextRequestId = (requestIdMap.get(languageService) ?? 0) + 1;
	requestIdMap.set(languageService, nextRequestId);
	token.onCancellationRequested(() => languageService.cancelRequest(nextRequestId));
	return nextRequestId;
}
