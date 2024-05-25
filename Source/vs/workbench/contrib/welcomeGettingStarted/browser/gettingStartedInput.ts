/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import "vs/css!./media/gettingStarted";
import { Schemas } from "vs/base/common/network";
import { URI } from "vs/base/common/uri";
import { localize } from "vs/nls";
import type { IEditorOptions } from "vs/platform/editor/common/editor";
import type { IUntypedEditorInput } from "vs/workbench/common/editor";
import { EditorInput } from "vs/workbench/common/editor/editorInput";

export const gettingStartedInputTypeId =
	"workbench.editors.gettingStartedInput";

export interface GettingStartedEditorOptions extends IEditorOptions {
	selectedCategory?: string;
	selectedStep?: string;
	showTelemetryNotice?: boolean;
}

export class GettingStartedInput extends EditorInput {
	static readonly ID = gettingStartedInputTypeId;
	static readonly RESOURCE = URI.from({
		scheme: Schemas.walkThrough,
		authority: "vscode_getting_started_page",
	});

	override get typeId(): string {
		return GettingStartedInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: GettingStartedInput.RESOURCE,
			options: {
				override: GettingStartedInput.ID,
				pinned: false,
			},
		};
	}

	get resource(): URI | undefined {
		return GettingStartedInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		if (other instanceof GettingStartedInput) {
			return other.selectedCategory === this.selectedCategory;
		}
		return false;
	}

	constructor(options: GettingStartedEditorOptions) {
		super();
		this.selectedCategory = options.selectedCategory;
		this.selectedStep = options.selectedStep;
		this.showTelemetryNotice = !!options.showTelemetryNotice;
	}

	override getName() {
		return localize("getStarted", "Welcome");
	}

	selectedCategory: string | undefined;
	selectedStep: string | undefined;
	showTelemetryNotice: boolean;
}
