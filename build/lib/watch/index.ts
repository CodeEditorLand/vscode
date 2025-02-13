/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = function () {
    return (process.platform === "win32"
        ? require("./watch-win32")
        : require("vscode-gulp-watch")).apply(null, arguments);
};
