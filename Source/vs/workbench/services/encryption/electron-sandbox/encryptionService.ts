/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEncryptionService } from "vs/platform/encryption/common/encryptionService";
import { registerMainProcessRemoteService } from "vs/platform/ipc/electron-sandbox/services";

registerMainProcessRemoteService(IEncryptionService, "encryption");
