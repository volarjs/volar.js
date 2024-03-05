import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import type { CodeInformation, SourceMap } from '@volar/language-core';

export function findOverlapCodeRange(
	start: number,
	end: number,
	map: SourceMap<CodeInformation>,
	filter: (data: CodeInformation) => boolean,
) {
	let mappedStart: number | undefined;
	let mappedEnd: number | undefined;

	for (const [mapped, mapping] of map.getGeneratedOffsets(start)) {
		if (filter(mapping.data)) {
			mappedStart = mapped;
			break;
		}
	}
	for (const [mapped, mapping] of map.getGeneratedOffsets(end)) {
		if (filter(mapping.data)) {
			mappedEnd = mapped;
			break;
		}
	}

	if (mappedStart === undefined || mappedEnd === undefined) {
		for (const mapping of map.mappings) {
			if (filter(mapping.data)) {
				const mappingStart = mapping.sourceOffsets[0];
				const mappingEnd = mapping.sourceOffsets[mapping.sourceOffsets.length - 1] + mapping.lengths[mapping.lengths.length - 1];
				const overlap = getOverlapRange(start, end, mappingStart, mappingEnd);
				if (overlap) {
					if (mappedStart === undefined) {
						mappedStart = overlap.start + mapping.generatedOffsets[0] - mappingStart;
					}
					else {
						mappedStart = Math.min(mappedStart, overlap.start + mapping.generatedOffsets[0] - mappingStart);
					}
					if (mappedEnd === undefined) {
						mappedEnd = overlap.end + mapping.generatedOffsets[0] - mappingStart;
					}
					else {
						mappedEnd = Math.max(mappedEnd, overlap.end + mapping.generatedOffsets[0] - mappingStart);
					}
				}
			}
		}
	}

	if (mappedStart !== undefined && mappedEnd !== undefined) {
		return {
			start: mappedStart,
			end: mappedEnd,
		};
	}
}

function getOverlapRange(
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

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
