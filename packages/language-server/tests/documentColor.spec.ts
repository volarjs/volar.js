import * as path from 'path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { type LanguageServerHandle, startLanguageServer } from '../../test-utils';

let server: LanguageServerHandle;

beforeAll(async () => {
	server = startLanguageServer(path.join(__dirname, 'fixtures/emptyColorServer.js'), __dirname);
	await server.initialize('file:///', {});
});

afterAll(async () => {
	await server.shutdown();
});

test('documentColor and colorPresentation return an empty array instead of null', async () => {
	const document = await server.openUntitledDocument('plaintext', 'text');
	expect(await server.sendDocumentColorRequest(document.uri)).toEqual([]);
	expect(
		await server.sendColorPresentationRequest(
			document.uri,
			{ red: 0, green: 0, blue: 0, alpha: 1 },
			{ start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
		),
	).toEqual([]);
});
