/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
const root = path.dirname(path.dirname(__dirname));
const platform = process.platform;
console.log(path.join(root, ".build", "node", `v${/^target="(.*)"$/m.exec(fs.readFileSync(path.join(root, "remote", ".npmrc"), "utf8"))![1]}`, `${platform}-${process.arch}`, (platform === "win32" ? "node.exe" : "node")));
