/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import crypto from "crypto";
import fs from "fs";
import path from "path";
const shasum = crypto.createHash("sha256");
for (const ext of JSON.parse(fs.readFileSync(path.join(__dirname, "../../../product.json"), "utf8")).builtInExtensions) {
    shasum.update(`${ext.name}@${ext.version}`);
}
process.stdout.write(shasum.digest("hex"));
