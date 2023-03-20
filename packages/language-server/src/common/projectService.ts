import { ServerMode } from "../types";
import type { server } from 'typescript/lib/tsserverlibrary'

export interface ProjectServiceContext {
	ts: typeof import('typescript/lib/tsserverlibrary') | undefined;
	serverMode: ServerMode | undefined;
}


export function createProjectService(context: ProjectServiceContext): server.ProjectService | undefined {
	if (!context.ts || !context.ts.server.ProjectService) return undefined;

	return new context.ts.server.ProjectService({
		host: context.ts.sys as any,
		logger: new Logger(),
		cancellationToken: context.ts.server.nullCancellationToken,
		useSingleInferredProject: false,
		useInferredProjectPerProjectRoot: false,
		typingsInstaller: context.ts.server.nullTypingsInstaller,
		session: undefined,
		serverMode: context.serverMode === 0 || context.serverMode === 1 ? 0 : 2
	});
}

class Logger {
    close() {}
    getLogFileName() { return undefined }
    loggingEnabled() { return false }
    hasLevel() { return false }
    info() {}
    endGroup() {}
    startGroup() {}
    perftrc() {}
    msg() {}
}
