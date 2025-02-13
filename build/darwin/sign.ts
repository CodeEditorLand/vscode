/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import { spawn } from "@malept/cross-spawn-promise";
import codesign from "electron-osx-sign";
const root = path.dirname(path.dirname(__dirname));
if (require.main === module) {
    (async (buildDir?: string): Promise<void> => {
        const tempDir = process.env["AGENT_TEMPDIRECTORY"];
        const arch = process.env["VSCODE_ARCH"];
        const identity = process.env["CODESIGN_IDENTITY"];
        if (!buildDir) {
            throw new Error("$AGENT_BUILDDIRECTORY not set");
        }
        if (!tempDir) {
            throw new Error("$AGENT_TEMPDIRECTORY not set");
        }
        const product = JSON.parse(fs.readFileSync(path.join(root, "product.json"), "utf8"));
        const baseDir = path.dirname(__dirname);
        const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
        const appName = product.nameLong + ".app";
        const appFrameworkPath = path.join(appRoot, appName, "Contents", "Frameworks");
        const helperAppBaseName = product.nameShort;
        const gpuHelperAppName = helperAppBaseName + " Helper (GPU).app";
        const rendererHelperAppName = helperAppBaseName + " Helper (Renderer).app";
        const pluginHelperAppName = helperAppBaseName + " Helper (Plugin).app";
        const infoPlistPath = path.resolve(appRoot, appName, "Contents", "Info.plist");
        const defaultOpts: codesign.SignOptions = {
            app: path.join(appRoot, appName),
            platform: "darwin",
            entitlements: path.join(baseDir, "azure-pipelines", "darwin", "app-entitlements.plist"),
            "entitlements-inherit": path.join(baseDir, "azure-pipelines", "darwin", "app-entitlements.plist"),
            hardenedRuntime: true,
            "pre-auto-entitlements": false,
            "pre-embed-provisioning-profile": false,
            keychain: path.join(tempDir, "buildagent.keychain"),
            version: ((): string => {
                return /^target="(.*)"$/m.exec(fs.readFileSync(path.join(root, ".npmrc"), "utf8"))![1];
            })(),
            identity,
            "gatekeeper-assess": false,
        };
        // Only overwrite plist entries for x64 and arm64 builds,
        // universal will get its copy from the x64 build.
        if (arch !== "universal") {
            await spawn("plutil", [
                "-insert",
                "NSAppleEventsUsageDescription",
                "-string",
                "An application in Visual Studio Code wants to use AppleScript.",
                `${infoPlistPath}`,
            ]);
            await spawn("plutil", [
                "-replace",
                "NSMicrophoneUsageDescription",
                "-string",
                "An application in Visual Studio Code wants to use the Microphone.",
                `${infoPlistPath}`,
            ]);
            await spawn("plutil", [
                "-replace",
                "NSCameraUsageDescription",
                "-string",
                "An application in Visual Studio Code wants to use the Camera.",
                `${infoPlistPath}`,
            ]);
        }
        await codesign.signAsync({
            ...defaultOpts,
            app: path.join(appFrameworkPath, gpuHelperAppName),
            entitlements: path.join(baseDir, "azure-pipelines", "darwin", "helper-gpu-entitlements.plist"),
            "entitlements-inherit": path.join(baseDir, "azure-pipelines", "darwin", "helper-gpu-entitlements.plist"),
        });
        await codesign.signAsync({
            ...defaultOpts,
            app: path.join(appFrameworkPath, rendererHelperAppName),
            entitlements: path.join(baseDir, "azure-pipelines", "darwin", "helper-renderer-entitlements.plist"),
            "entitlements-inherit": path.join(baseDir, "azure-pipelines", "darwin", "helper-renderer-entitlements.plist"),
        });
        await codesign.signAsync({
            ...defaultOpts,
            app: path.join(appFrameworkPath, pluginHelperAppName),
            entitlements: path.join(baseDir, "azure-pipelines", "darwin", "helper-plugin-entitlements.plist"),
            "entitlements-inherit": path.join(baseDir, "azure-pipelines", "darwin", "helper-plugin-entitlements.plist"),
        });
        await codesign.signAsync({
            ...defaultOpts,
            // TODO(deepak1556): Incorrectly declared type in electron-osx-sign
            ignore: (filePath: string) => {
                return (filePath.includes(gpuHelperAppName) ||
                    filePath.includes(rendererHelperAppName) ||
                    filePath.includes(pluginHelperAppName));
            },
        } as any);
    })(process.argv[2]).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
