import type { LanguagePlugin } from '@volar/language-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { proxyCreateProgram, releaseRemovedProjects } from '../lib/node/proxyCreateProgram';

const plugin: LanguagePlugin<string> = {
	getLanguageId: () => undefined,
	typescript: {
		extraFileExtensions: [{ extension: 'vfile', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
		getServiceScript: () => undefined,
	},
};

describe('proxyCreateProgram state per project', () => {
	let root: string;
	let host: ts.CompilerHost;

	beforeAll(() => {
		root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'volar-projects-'))).replace(/\\/g, '/');
		for (const project of ['a', 'b']) {
			fs.mkdirSync(`${root}/${project}`);
			fs.writeFileSync(`${root}/${project}/index.ts`, `import './late';\nexport {};\n`);
		}
		host = ts.createCompilerHost({});
	});

	afterAll(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function setup() {
		const create = vi.fn(() => [plugin]);
		const createProgram = proxyCreateProgram(ts, ts.createProgram, create);
		// Like the solution builder, reuse the parsed options of each project.
		const projectOptions = new Map<string | undefined, ts.CompilerOptions>();
		const build = (project: string | undefined, rootNames = [`${root}/${project ?? 'a'}/index.ts`]) => {
			if (!projectOptions.has(project)) {
				projectOptions.set(project, {
					noLib: true,
					types: [],
					...project ? { configFilePath: `${root}/${project}/tsconfig.json` } : {},
				});
			}
			return createProgram({ rootNames, options: projectOptions.get(project)!, host });
		};
		return { create, createProgram, build };
	}

	it('keeps the state of each project while a solution builder alternates between them', () => {
		const { create, build } = setup();
		build('a');
		build('b');
		build('a');
		build('b');
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('releases the state of projects that are no longer built', () => {
		const { create, createProgram, build } = setup();
		build('a');
		build('b');
		const activeProject = host.getCanonicalFileName(`${root}/b/tsconfig.json`);
		releaseRemovedProjects(createProgram, configFilePath => configFilePath === activeProject);
		build('b');
		expect(create).toHaveBeenCalledTimes(2);
		build('a');
		expect(create).toHaveBeenCalledTimes(3);
	});

	it('shares one state between programs without a config file', () => {
		const { create, build } = setup();
		build(undefined, [`${root}/a/index.ts`]);
		build(undefined, [`${root}/b/index.ts`]);
		build(undefined, [`${root}/a/index.ts`]);
		expect(create).toHaveBeenCalledTimes(3);
	});

	it('does not keep module resolutions across a change of the root files', () => {
		const { build } = setup();
		const late = `${root}/a/late.ts`;
		try {
			expect(build('a').getSourceFile(late)).toBeUndefined();
			build('b');
			fs.writeFileSync(late, 'export {};\n');
			build('b', [`${root}/b/index.ts`, late]);
			expect(build('a').getSourceFile(late)).toBeDefined();
		}
		finally {
			fs.rmSync(late, { force: true });
		}
	});
});
