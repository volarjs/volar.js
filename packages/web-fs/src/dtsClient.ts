import { IDtsHost } from './dtsHost';
import { getPackageNameOfDtsPath } from './utils';

export function createDtsClient(server: IDtsHost) {

	let readFileResultsSyncAt = 0;
	let fileExistsResultsSyncAt = 0;

	const readFileResults = new Map<string, string | undefined | Promise<string | undefined>>();
	const fileExistsResults = new Map<string, boolean | Promise<boolean>>();

	return {
		readFile(fileName: string) {
			if (!readFileResults.has(fileName)) {
				readFileResults.set(fileName, readFileAsync(fileName));
			}
			const textOrFetching = readFileResults.get(fileName);
			if (typeof textOrFetching === 'string') {
				return textOrFetching;
			}
		},
		fileExists(fileName: string) {
			if (!fileExistsResults.has(fileName)) {
				fileExistsResults.set(fileName, fileExistsAsync(fileName));
			}
			const textOrFetching = fileExistsResults.get(fileName);
			if (typeof textOrFetching === 'boolean') {
				return textOrFetching;
			}
			return false;
		},
		async sync() {
			while (
				readFileResults.size !== readFileResultsSyncAt
				|| fileExistsResults.size !== fileExistsResultsSyncAt
			) {
				const newReadFileResultsSize = readFileResults.size;
				const newFileExistsResultsSize = fileExistsResults.size;
				await Promise.all([
					...readFileResults.values(),
					...fileExistsResults.values(),
				]);
				if (newReadFileResultsSize > readFileResultsSyncAt) {
					readFileResultsSyncAt = newReadFileResultsSize;
				}
				if (newFileExistsResultsSize > fileExistsResultsSyncAt) {
					fileExistsResultsSyncAt = newFileExistsResultsSize;
				}
			}
			const validReadFileResults = [...readFileResults.values()].filter(text => typeof text === 'string');
			const validFileExistsResults = [...fileExistsResults.values()].filter(text => text === true);
			return validReadFileResults.length + validFileExistsResults.length;
		},
	};

	async function readFileAsync(fileName: string) {
		let result: string | undefined;
		if (!await valid(fileName)) {
			result = undefined;
		}
		else {
			result = await server.readFile(fileName);
		}
		readFileResults.set(fileName, result);
		fileExistsResults.set(fileName, result !== undefined);
		return result;
	}

	async function fileExistsAsync(fileName: string) {
		let result: boolean;
		if (!await valid(fileName)) {
			result = false;
		}
		else {
			result = await server.fileExists(fileName);
		}
		fileExistsResults.set(fileName, result);
		return result;
	}

	async function valid(fileName: string) {
		const pkgName = getPackageNameOfDtsPath(fileName);
		if (!pkgName) {
			return false;
		}
		if (pkgName.indexOf('.') >= 0 || pkgName.endsWith('/node_modules')) {
			return false;
		}
		// hard code for known invalid package
		if (pkgName.startsWith('@typescript/') || pkgName.startsWith('@types/typescript__')) {
			return false;
		}
		// don't check @types if original package already having types
		if (pkgName.startsWith('@types/')) {
			let originalPkgName = pkgName.slice('@types/'.length);
			if (originalPkgName.indexOf('__') >= 0) {
				originalPkgName = '@' + originalPkgName.replace('__', '/');
			}
			const packageJson = await readFileAsync(`/node_modules/${originalPkgName}/package.json`);
			if (packageJson) {
				const packageJsonObj = JSON.parse(packageJson);
				if (packageJsonObj.types || packageJsonObj.typings) {
					return false;
				}
				const indexDts = await readFileAsync(`/node_modules/${originalPkgName}/index.d.ts`);
				if (indexDts) {
					return false;
				}
			}
		}
		return true;
	}
}
