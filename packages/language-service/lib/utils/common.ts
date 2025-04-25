import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';

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

export function isEqualRange(a: vscode.Range, b: vscode.Range) {
	return a.start.line === b.start.line
		&& a.start.character === b.start.character
		&& a.end.line === b.end.line
		&& a.end.character === b.end.character;
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
