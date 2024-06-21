import { SourceMap } from '@volar/source-map';

export class LinkedCodeMap extends SourceMap<any> {
	*getLinkedOffsets(start: number) {
		for (const mapped of this.toGeneratedLocation(start)) {
			yield mapped[0];
		}
		for (const mapped of this.toSourceLocation(start)) {
			yield mapped[0];
		}
	}
}
