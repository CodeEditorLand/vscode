/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	VSBuffer,
	VSBufferReadable,
	VSBufferReadableStream,
} from "vs/base/common/buffer";
import type { URI } from "vs/base/common/uri";
import type {
	IFileStatWithMetadata,
	IWriteFileOptions,
} from "vs/platform/files/common/files";
import { createDecorator } from "vs/platform/instantiation/common/instantiation";

export const IElevatedFileService = createDecorator<IElevatedFileService>(
	"elevatedFileService",
);

export interface IElevatedFileService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether saving elevated is supported for the provided resource.
	 */
	isSupported(resource: URI): boolean;

	/**
	 * Attempts to write to the target resource elevated. This may bring
	 * up a dialog to ask for admin username / password.
	 */
	writeFileElevated(
		resource: URI,
		value: VSBuffer | VSBufferReadable | VSBufferReadableStream,
		options?: IWriteFileOptions,
	): Promise<IFileStatWithMetadata>;
}
