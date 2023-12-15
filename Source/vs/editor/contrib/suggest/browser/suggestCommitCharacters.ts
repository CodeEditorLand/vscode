/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from "vs/base/common/arrays";
import { DisposableStore } from "vs/base/common/lifecycle";
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { EditorOption } from "vs/editor/common/config/editorOptions";
import { CharacterSet } from "vs/editor/common/core/characterClassifier";
import {
	State,
	SuggestModel,
} from "vs/editor/contrib/suggest/browser/suggestModel";
import { ISelectedSuggestion, SuggestWidget } from "./suggestWidget";

export class CommitCharacterController {
	private readonly _disposables = new DisposableStore();

	private _active?: {
		readonly acceptCharacters: CharacterSet;
		readonly item: ISelectedSuggestion;
	};

	constructor(
		editor: ICodeEditor,
		widget: SuggestWidget,
		model: SuggestModel,
		accept: (selected: ISelectedSuggestion) => any,
	) {
		this._disposables.add(
			model.onDidSuggest((e) => {
				if (e.completionModel.items.length === 0) {
					this.reset();
				}
			}),
		);
		this._disposables.add(
			model.onDidCancel((e) => {
				this.reset();
			}),
		);

		this._disposables.add(
			widget.onDidShow(() => this._onItem(widget.getFocusedItem())),
		);
		this._disposables.add(widget.onDidFocus(this._onItem, this));
		this._disposables.add(widget.onDidHide(this.reset, this));

		this._disposables.add(
			editor.onWillType((text) => {
				if (
					this._active &&
					!widget.isFrozen() &&
					model.state !== State.Idle
				) {
					const ch = text.charCodeAt(text.length - 1);
					if (
						this._active.acceptCharacters.has(ch) &&
						editor.getOption(
							EditorOption.acceptSuggestionOnCommitCharacter,
						)
					) {
						accept(this._active.item);
					}
				}
			}),
		);
	}

	private _onItem(selected: ISelectedSuggestion | undefined): void {
		if (
			!selected ||
			!isNonEmptyArray(selected.item.completion.commitCharacters)
		) {
			// no item or no commit characters
			this.reset();
			return;
		}

		if (this._active && this._active.item.item === selected.item) {
			// still the same item
			return;
		}

		// keep item and its commit characters
		const acceptCharacters = new CharacterSet();
		for (const ch of selected.item.completion.commitCharacters) {
			if (ch.length > 0) {
				acceptCharacters.add(ch.charCodeAt(0));
			}
		}
		this._active = { acceptCharacters, item: selected };
	}

	reset(): void {
		this._active = undefined;
	}

	dispose() {
		this._disposables.dispose();
	}
}
