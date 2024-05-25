/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	InstantiationType,
	registerSingleton,
} from "vs/platform/instantiation/common/extensions";
import { SpeechService } from "vs/workbench/contrib/speech/browser/speechService";
import { ISpeechService } from "vs/workbench/contrib/speech/common/speechService";

registerSingleton(
	ISpeechService,
	SpeechService,
	InstantiationType.Eager /* Reads Extension Points */,
);
