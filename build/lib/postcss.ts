/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import es from "event-stream";
import postcss from "postcss";
import File from "vinyl";
export function gulpPostcss(plugins: postcss.AcceptedPlugin[], handleError?: (err: Error) => void) {
    return es.map((file: File, callback: (error?: any, file?: any) => void) => {
        if (file.isNull()) {
            return callback(null, file);
        }
        if (file.isStream()) {
            return callback(new Error("Streaming not supported"));
        }
        postcss(plugins).process(file.contents.toString(), { from: file.path })
            .then((result) => {
            file.contents = Buffer.from(result.css);
            callback(null, file);
        })
            .catch((error) => {
            if (handleError) {
                handleError(error);
                callback();
            }
            else {
                callback(error);
            }
        });
    });
}
