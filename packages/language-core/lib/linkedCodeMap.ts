import * as SourceMaps from '@volar/source-map';
import type { LinkedCodeTrigger } from './types';

export class LinkedCodeMap extends SourceMaps.SourceMap<[LinkedCodeTrigger, LinkedCodeTrigger]> {
	*toLinkedOffsets(start: number) {
		for (const mapped of this.getGeneratedOffsets(start)) {
			yield [mapped[0], mapped[1][3][1]] as const;
		}
		for (const mapped of this.getSourceOffsets(start)) {
			yield [mapped[0], mapped[1][3][0]] as const;
		}
	}
}
