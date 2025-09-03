import type { SemanticTokens } from 'vscode-languageserver-protocol';

export class SemanticTokensBuilder {
	private _id!: number;

	private _prevLine!: number;
	private _prevChar!: number;
	private _data!: number[];
	private _dataLen!: number;

	constructor() {
		this.initialize();
	}

	private initialize() {
		this._id = Date.now();
		this._prevLine = 0;
		this._prevChar = 0;
		this._data = [];
		this._dataLen = 0;
	}

	public push(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void {
		let pushLine = line;
		let pushChar = char;
		if (this._dataLen > 0) {
			pushLine -= this._prevLine;
			if (pushLine === 0) {
				pushChar -= this._prevChar;
			}
		}

		this._data[this._dataLen++] = pushLine;
		this._data[this._dataLen++] = pushChar;
		this._data[this._dataLen++] = length;
		this._data[this._dataLen++] = tokenType;
		this._data[this._dataLen++] = tokenModifiers;

		this._prevLine = line;
		this._prevChar = char;
	}

	public get id(): string {
		return this._id.toString();
	}

	public build(): SemanticTokens {
		return {
			resultId: this.id,
			data: this._data,
		};
	}
}
