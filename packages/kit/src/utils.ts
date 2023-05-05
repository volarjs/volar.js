import * as path from 'typesafe-path/posix';
import { URI } from 'vscode-uri';

export function asPosix(path: string) {
	return path.replace(/\\/g, '/') as path.PosixPath;
}

export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');

export const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

export function getConfiguration(settings: any, section: string) {
	if (section in settings) {
		// console.log(section, settings, settings[section]);
		return settings[section];
	}
	let result: any;
	for (const settingKey in settings) {
		if (settingKey.startsWith(`${section}.`)) {
			const value = settings[settingKey];
			const props = settingKey.substring(section.length + 1).split('.');
			result ??= {};
			let current = result;
			while (props.length > 1) {
				const prop = props.shift()!;
				if (typeof current[prop] !== 'object') {
					current[prop] = {};
				}
				current = current[prop];
			}
			current[props.shift()!] = value;
		}
	}
	// console.log(section, settings, result);
	return result;
}
