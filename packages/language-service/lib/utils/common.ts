import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import type { CodeInformation, SourceMap } from '@volar/language-core';

export function findOverlapCodeRange(
	start: number,
	end: number,
	map: SourceMap<CodeInformation>,
	filter: (data: CodeInformation) => boolean
) {
	let mappedStart: number | undefined;
	let mappedEnd: number | undefined;

	for (const [mappedStart, mappedEnd] of map.getGeneratedStartEnd(start, end, filter)) {
		return {
			start: mappedStart,
			end: mappedEnd,
		}
	}

	for (const [mapped] of map.getGeneratedOffsets(start, filter)) {
		mappedStart = mapped;
		break;
	}
	for (const [mapped] of map.getGeneratedOffsets(end, filter)) {
		mappedEnd = mapped;
		break;
	}

	if (mappedStart === undefined || mappedEnd === undefined) {
		for (const mapping of map.mappings) {
			if (filter(mapping.data)) {
				const mappingStart = mapping.sourceOffsets[0];
				const mappingEnd = mapping.sourceOffsets[mapping.sourceOffsets.length - 1] + mapping.lengths[mapping.lengths.length - 1];
				const overlap = getOverlapRange(start, end, mappingStart, mappingEnd);
				if (overlap) {
					const curMappedStart = (overlap.start - mappingStart) + mapping.generatedOffsets[0];

					mappedStart = mappedStart === undefined ? curMappedStart : Math.min(mappedStart, curMappedStart);

					const lastGeneratedLength = (mapping.generatedLengths ?? mapping.lengths)[mapping.generatedOffsets.length - 1];
					const curMappedEndOffset = Math.min(overlap.end - mapping.sourceOffsets[mapping.sourceOffsets.length - 1], lastGeneratedLength);

					const curMappedEnd = mapping.generatedOffsets[mapping.generatedOffsets.length - 1] + curMappedEndOffset;

					mappedEnd = mappedEnd === undefined ? curMappedEnd : Math.max(mappedEnd, curMappedEnd);
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
	range2End: number
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
