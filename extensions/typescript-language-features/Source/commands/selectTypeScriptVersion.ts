/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type TypeScriptServiceClientHost from "../typeScriptServiceClientHost";
import type { Lazy } from "../utils/lazy";
import type { Command } from "./commandManager";

export class SelectTypeScriptVersionCommand implements Command {
	public static readonly id = "typescript.selectTypeScriptVersion";
	public readonly id = SelectTypeScriptVersionCommand.id;

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) {}

	public execute() {
		this.lazyClientHost.value.serviceClient.showVersionPicker();
	}
}
