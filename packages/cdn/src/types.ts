export interface UriResolver {
	uriToFileName(uri: string): string | undefined;
	fileNameToUri(fileName: string): string | undefined;
}
