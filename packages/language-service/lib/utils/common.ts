import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';

export function getOverlapRange(
	range1Start: number,
	range1End: number,
	range2Start: number,
	range2End: number,
): { start: number, end: number; } | undefined {

	const start = Math.max(range1Start, range2Start);
	const end = Math.min(range1End, range2End);

	if (start > end) {
		return undefined;
	}

	return {
		start,
		end,
	};
}

export function isInsideRange(parent: vscode.Range, child: vscode.Range) {
	if (child.start.line < parent.start.line) {
		return false;
	}
	if (child.end.line > parent.end.line) {
		return false;
	}
	if (child.start.line === parent.start.line && child.start.character < parent.start.character) {
		return false;
	}
	if (child.end.line === parent.end.line && child.end.character > parent.end.character) {
		return false;
	}
	return true;
}

export function stringToSnapshot(str: string): ts.IScriptSnapshot {
	return {
		getText: (start, end) => str.substring(start, end),
		getLength: () => str.length,
		getChangeRange: () => undefined,
	};
}

export function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
