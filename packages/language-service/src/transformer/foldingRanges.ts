import * as vscode from 'vscode-languageserver-protocol';

export function transform(ranges: vscode.FoldingRange[], getOtherRange: (range: vscode.Range) => vscode.Range | undefined): vscode.FoldingRange[] {

	const result: vscode.FoldingRange[] = [];

	for (const range of ranges) {
		const otherRange = getOtherRange({
			start: { line: range.startLine, character: range.startCharacter ?? 0 },
			end: { line: range.endLine, character: range.endCharacter ?? 0 },
		});
		if (otherRange) {
			range.startLine = otherRange.start.line;
			range.endLine = otherRange.end.line;
			if (range.startCharacter !== undefined)
				range.startCharacter = otherRange.start.character;
			if (range.endCharacter !== undefined)
				range.endCharacter = otherRange.end.character;
			result.push(range);
		}
	}

	return result;
}
