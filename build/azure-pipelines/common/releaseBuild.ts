/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CosmosClient } from "@azure/cosmos";
import { ClientAssertionCredential } from "@azure/identity";
import { retry } from "./retry";
function getEnv(name: string): string {
    const result = process.env[name];
    if (typeof result === "undefined") {
        throw new Error("Missing env: " + name);
    }
    return result;
}
interface Config {
    id: string;
    frozen: boolean;
}
const [, , force] = process.argv;
console.log(process.argv);
(async (force: boolean): Promise<void> => {
    const commit = getEnv("BUILD_SOURCEVERSION");
    const quality = getEnv("VSCODE_QUALITY");
    const aadCredentials = new ClientAssertionCredential(process.env["AZURE_TENANT_ID"]!, process.env["AZURE_CLIENT_ID"]!, () => Promise.resolve(process.env["AZURE_ID_TOKEN"]!));
    const client = new CosmosClient({
        endpoint: process.env["AZURE_DOCUMENTDB_ENDPOINT"]!,
        aadCredentials,
    });
    if (!force) {
        const config = await (async (client: CosmosClient, quality: string): Promise<Config> => {
            const res = await client
                .database("builds")
                .container("config")
                .items.query(`SELECT TOP 1 * FROM c WHERE c.id = "${quality}"`)
                .fetchAll();
            if (res.resources.length === 0) {
                return ((quality: string): Config => {
                    return {
                        id: quality,
                        frozen: false,
                    };
                })(quality);
            }
            return res.resources[0] as Config;
        })(client, quality);
        console.log("Quality config:", config);
        if (config.frozen) {
            console.log(`Skipping release because quality ${quality} is frozen.`);
            return;
        }
    }
    console.log(`Releasing build ${commit}...`);
    await retry(() => client.database("builds").container(quality).scripts.storedProcedure("releaseBuild").execute("", [commit]));
})(/^true$/i.test(force)).then(() => {
    console.log("Build successfully released");
    process.exit(0);
}, (err) => {
    console.error(err);
    process.exit(1);
});
