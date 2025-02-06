/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationToken,
	Hover,
	HoverProvider,
	MarkedString,
	Position,
	TextDocument,
	workspace,
} from "vscode";

import * as phpGlobalFunctions from "./phpGlobalFunctions";
import * as phpGlobals from "./phpGlobals";
import { textToMarkedString } from "./utils/markedTextUtil";

export default class PHPHoverProvider implements HoverProvider {
	public provideHover(
		document: TextDocument,
		position: Position,
		_token: CancellationToken,
	): Hover | undefined {
		const enable = workspace
			.getConfiguration("php")
			.get<boolean>("suggest.basic", true);
		if (!enable) {
			return undefined;
		}

		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return undefined;
		}

		const name = document.getText(wordRange);

		const entry =
			phpGlobalFunctions.globalfunctions[name] ||
			phpGlobals.compiletimeconstants[name] ||
			phpGlobals.globalvariables[name] ||
			phpGlobals.keywords[name];
		if (entry && entry.description) {
			const signature = name + (entry.signature || "");
			const contents: MarkedString[] = [
				textToMarkedString(entry.description),
				{ language: "php", value: signature },
			];
			return new Hover(contents, wordRange);
		}

		return undefined;
	}
}
