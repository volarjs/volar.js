export function getPackageNameOfDtsPath(path: string) {
	if (!path.startsWith('/node_modules/')) {
		return undefined;
	}
	let pkgName = path.split('/')[2];
	if (pkgName.startsWith('@')) {
		pkgName += '/' + path.split('/')[3];
	}
	return pkgName;
}
