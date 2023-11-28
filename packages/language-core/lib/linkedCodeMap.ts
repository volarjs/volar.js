import { SourceMap } from '@volar/source-map';

export class LinkedCodeMap extends SourceMap {
	*toLinkedOffsets(start: number) {
		for (const mapped of this.getGeneratedOffsets(start)) {
			yield mapped[0];
		}
		for (const mapped of this.getSourceOffsets(start)) {
			yield mapped[0];
		}
	}
}
