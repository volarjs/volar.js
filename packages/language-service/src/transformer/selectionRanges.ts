import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common.js';
import { transform as transformSelectionRange } from './selectionRange.js';

export function transform<T extends vscode.SelectionRange>(locations: T[], getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T[] {
	return locations
		.map(location => transformSelectionRange(location, getOtherRange))
		.filter(notEmpty);
}
