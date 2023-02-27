import axios from 'axios';

export function createAutoTypesFetchingHost(cdn: string) {

	const fetchTasks: [string, Promise<void>][] = [];
	const files = new Map<string, string | undefined>();

	let fetching: Promise<void> | undefined;

	return {
		fileExists,
		readFile,
		files,
		wait: async () => await fetching,
	};

	function fileExists(fileName: string): boolean {
		return readFile(fileName) !== undefined;
	}

	function readFile(fileName: string) {
		if (!files.has(fileName)) {
			files.set(fileName, undefined);
			fetch(fileName);
		}
		return files.get(fileName);
	}

	async function readFileAsync(fileName: string) {
		if (fileName.startsWith('/node_modules/')) {
			const url = cdn + fileName.slice('/node_modules/'.length);
			const text = await readWebFile(url);
			files.set(fileName, text);
		}
	}

	async function readWebFile(uri: string) {
		// ignore .js because it's no help for intellisense
		if (uri.endsWith('.d.ts') || uri.endsWith('/package.json')) {
			try {
				return (await axios.get(uri, {
					transformResponse: (res) => {
						// avoid parse to json object
						return res;
					},
				})).data as string ?? undefined;
			} catch {
				// ignore
			}
		}
	}

	async function fetch(fileName: string) {

		fetchTasks.push([fileName, readFileAsync(fileName)]);

		if (!fetching) {
			fetching = fetchWorker();
			await fetching;
			fetching = undefined;
		}
	}

	async function fetchWorker() {
		while (fetchTasks.length) {
			const tasks = fetchTasks.map(([_, task]) => task);
			fetchTasks.length = 0;
			await Promise.all(tasks);
		}
	}
}
