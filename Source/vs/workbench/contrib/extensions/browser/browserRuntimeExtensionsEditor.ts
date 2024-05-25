/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Action } from "vs/base/common/actions";
import type { ExtensionIdentifier } from "vs/platform/extensions/common/extensions";
import {
	AbstractRuntimeExtensionsEditor,
	type IRuntimeExtension,
} from "vs/workbench/contrib/extensions/browser/abstractRuntimeExtensionsEditor";
import { ReportExtensionIssueAction } from "vs/workbench/contrib/extensions/common/reportExtensionIssueAction";
import type { IExtensionHostProfile } from "vs/workbench/services/extensions/common/extensions";

export class RuntimeExtensionsEditor extends AbstractRuntimeExtensionsEditor {
	protected _getProfileInfo(): IExtensionHostProfile | null {
		return null;
	}

	protected _getUnresponsiveProfile(
		extensionId: ExtensionIdentifier,
	): IExtensionHostProfile | undefined {
		return undefined;
	}

	protected _createSlowExtensionAction(
		element: IRuntimeExtension,
	): Action | null {
		return null;
	}

	protected _createReportExtensionIssueAction(
		element: IRuntimeExtension,
	): Action | null {
		if (element.marketplaceInfo) {
			return this._instantiationService.createInstance(
				ReportExtensionIssueAction,
				element.description,
			);
		}
		return null;
	}

	protected _createSaveExtensionHostProfileAction(): Action | null {
		return null;
	}

	protected _createProfileAction(): Action | null {
		return null;
	}
}
