import * as path from 'path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { type LanguageServerHandle, startLanguageServer } from '../../test-utils';
import { GetMatchTsConfigRequest } from '../protocol';

const workspace = path.join(__dirname, 'fixtures/projectReferences');
let server: LanguageServerHandle;

beforeAll(async () => {
	server = startLanguageServer(path.join(__dirname, 'fixtures/tsServer.js'), __dirname);
	await server.initialize(URI.file(workspace).toString(), {});
});

afterAll(async () => {
	await server.shutdown();
});

test('a project reference to a directory resolves to the tsconfig.json inside it', async () => {
	const document = await server.openTextDocument(path.join(workspace, 'src/index.ts'), 'typescript');
	const result = await server.connection.sendRequest(GetMatchTsConfigRequest.type, { uri: document.uri });
	expect(result?.uri).toBe(URI.file(path.join(workspace, 'configs/app/tsconfig.json')).toString());
});
