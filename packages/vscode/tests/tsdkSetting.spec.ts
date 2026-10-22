import { describe, expect, test } from 'vitest';
import type * as vscode from 'vscode';
import { getWritableTsdkSetting, readTsdkSetting } from '../lib/features/tsdkSetting';

function createWorkspace(settings: Record<string, { globalValue?: string; workspaceValue?: string }>) {
	return {
		getConfiguration: (section?: string) => ({
			inspect: (key: string) => ({ key: `${section}.${key}`, ...settings[`${section}.${key}`] }),
			get: (key: string) => {
				const setting = settings[`${section}.${key}`];
				return setting?.workspaceValue ?? setting?.globalValue;
			},
		}),
	} as unknown as Pick<typeof vscode.workspace, 'getConfiguration'>;
}

describe('tsdk setting', () => {
	test('reads js/ts.tsdk.path', () => {
		const workspace = createWorkspace({ 'js/ts.tsdk.path': { workspaceValue: 'node_modules/typescript/lib' } });
		expect(readTsdkSetting(workspace)).toBe('node_modules/typescript/lib');
	});

	test('prefers js/ts.tsdk.path over typescript.tsdk', () => {
		const workspace = createWorkspace({
			'js/ts.tsdk.path': { globalValue: 'C:\\ts\\lib' },
			'typescript.tsdk': { workspaceValue: 'legacy/lib' },
		});
		expect(readTsdkSetting(workspace)).toBe('C:/ts/lib');
	});

	test('falls back to typescript.tsdk', () => {
		const workspace = createWorkspace({ 'typescript.tsdk': { workspaceValue: 'legacy/lib' } });
		expect(readTsdkSetting(workspace)).toBe('legacy/lib');
	});

	test('returns undefined when neither is set', () => {
		expect(readTsdkSetting(createWorkspace({}))).toBeUndefined();
	});

	test('writes js/ts.tsdk.path on VS Code 1.110 and later', () => {
		expect(getWritableTsdkSetting('1.110.0').id).toBe('js/ts.tsdk.path');
		expect(getWritableTsdkSetting('1.111.0-insider').id).toBe('js/ts.tsdk.path');
	});

	test('writes typescript.tsdk before VS Code 1.110', () => {
		expect(getWritableTsdkSetting('1.109.5').id).toBe('typescript.tsdk');
		expect(getWritableTsdkSetting('1.82.0').id).toBe('typescript.tsdk');
	});
});
