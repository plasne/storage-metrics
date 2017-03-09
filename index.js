
// import
const q = require("q");
const config = require("config");
const adal = require("adal-node");
const request = require("request");
const storage = require("azure-storage");
const moment = require("moment");

// configuration
const authority = config.get("authority");
const directory = config.get("directory");
const subscription = config.get("subscription");
const clientId = config.get("clientId");
const clientSecret = config.get("clientSecret");

// global variables
var initializing = true;
const refreshAtMost = 20;
const accounts = [];

function GetStorageAccounts(token) {

    // get list of ASM storage accounts
    const asm_deferred = q.defer();
    request.get({
        "uri": "https://management.azure.com/subscriptions/" + subscription + "/providers/Microsoft.ClassicStorage/storageAccounts?api-version=2016-04-01",
        "headers": {
            "Authorization": "bearer " + token
        },
        json: true
    }, (error, response, body) => {
        if (!error && response.statusCode == 200) {
            body.value.forEach(sa => {
                const existing = accounts.find(a => a.id === sa.id);
                if (!existing) {
                    accounts.push({
                        id: sa.id,
                        name: sa.name
                    });
                }
            });
            asm_deferred.resolve();
        } else {
            if (error) { console.error("error(110): " + error) } else { console.error("error(111)"); console.log(body); };
            asm_deferred.reject();
        }
    });

    // get list of ARM storage accounts
    const arm_deferred = q.defer();
    request.get({
        "uri": "https://management.azure.com/subscriptions/" + subscription + "/providers/Microsoft.Storage/storageAccounts?api-version=2016-12-01",
        "headers": {
            "Authorization": "bearer " + token
        },
        json: true
    }, (error, response, body) => {
        if (!error && response.statusCode == 200) {
            body.value.forEach(sa => {
                if (sa.sku.tier == "Standard") {
                    const existing = accounts.find(a => a.id === sa.id);
                    if (!existing) {
                        accounts.push({
                            id: sa.id,
                            name: sa.name
                        });
                    }
                }
            });
            arm_deferred.resolve();
        } else {
            if (error) { console.error("error(112): " + error) } else { console.error("error(113)"); console.log(body); };
            arm_deferred.reject();
        }
    });

    return q.allSettled([ asm_deferred.promise, arm_deferred.promise ]);
}

function GetMostGranular(availabilities) {
    let lowest;

    availabilities.forEach(availability => {
        if (!lowest) {
            lowest = availability;
        } else {
            const last_lowest = lowest.timeGrain.charAt(lowest.timeGrain.length - 1);
            const last_current = availability.timeGrain.charAt(availability.timeGrain.length -1);
            if (last_lowest == "H" && last_current == "M") {
                lowest = availability;
            } else if (last_lowest == "M" && last_current == "H") {
                // ignore; lowest is already lower
            } else if (last_lowest == last_current) {
                const num_lowest = Number(lowest.timeGrain.substring(2, lowest.timeGrain.length - 1));
                const num_current = Number(availability.timeGrain.substring(2, availability.timeGrain.length - 1));
                if (num_current < num_lowest) lowest = availability;
            }
        }
    });

    return lowest;
}

function GetMetricDefinitions(accounts, token) {
    const promises = [];

    // define the query function
    const query = (type) => {
        accounts.forEach(sa => {
            const deferred = q.defer();
            promises.push(deferred.promise);
            request.get({
                //"uri": "https://management.azure.com" + sa.id + "/providers/microsoft.insights/metricDefinitions?api-version=2016-03-01",
                "uri": "https://management.azure.com" + sa.id + "/services/" + type + "/providers/microsoft.insights/metricDefinitions?api-version=2015-07-01",
                "headers": {
                    "Authorization": "bearer " + token
                },
                json: true
            }, (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    if (body.value.length > 0) {
                        const definition = body.value[0]; // should all be the same since Set-AzureStorageServiceMetricsProperty doesn't set separately
                        const mostGranular = GetMostGranular(definition.metricAvailabilities);
                        sa[type] = {
                            timeGrain: "duration'" + mostGranular.timeGrain + "'",
                            host: mostGranular.location.tableEndpoint,
                            sasToken: mostGranular.location.tableInfo[0].sasToken
                        };
                    }
                    sa.refreshed = Date.now();
                    deferred.resolve();
                } else {
                    if (error) { console.error("error(120): " + error) } else { console.error("error(121)"); console.log(body); };
                    deferred.reject();
                }
            });
        });
    }

    // query each type
    query("blob");
    query("table");
    query("queue");

    return q.allSettled(promises);
}

function RefreshAccounts() {

    // authenticate
    const context = new adal.AuthenticationContext(authority + directory);
    context.acquireTokenWithClientCredentials("https://management.core.windows.net/", clientId, clientSecret, (error, tokenResponse) => {
        if (!error) {

            // get the storage accounts
            const previous = accounts.length;
            GetStorageAccounts(tokenResponse.accessToken).done(() => {

                // log
                if (previous != accounts.length) {
                    console.log(accounts.length + " standard storage accounts are being monitored.");
                }

                // refresh some /metricDefinitions
                accounts.sort((a, b) => {
                    if (a.refreshed && b.refreshed) {
                        return (a.refreshed > b.refreshed) - (a.refreshed < b.refreshed);
                    } else if (a.refreshed) {
                        return 1;
                    } else if (b.refreshed) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                const oldest = accounts.slice(0, refreshAtMost);
                GetMetricDefinitions(oldest, tokenResponse.accessToken).done(() => {
                    
                    // do this again every 30 sec during initialization and every 10 min thereafter
                    if (initializing) {
                        const uninitialized = accounts.filter(a => !a.refreshed);
                        if (uninitialized.length > 0) {
                            console.log(uninitialized.length + " storage accounts still need to be initialized.");
                        } else {
                            console.log("all storage accounts initialized.");
                            initializing = false;
                        }
                    } else {
                        console.log(oldest.length + " storage accounts were refreshed.");
                    }
                    setTimeout(RefreshAccounts, (initializing) ? 30000 : 600000);

                });

            });

        } else {
            console.error("error(130): " + error);
        }
    });

}

function RefreshMetrics() {

    // authenticate
    const context = new adal.AuthenticationContext(authority + directory);
    context.acquireTokenWithClientCredentials("https://management.core.windows.net/", clientId, clientSecret, (error, tokenResponse) => {
        if (!error) {
            const promises = [];
            var total = 0;

            // refresh all accounts
            accounts.forEach(account => {

                // define the query function
                const query = (node, type) => {
                    const deferred = q.defer();
                    promises.push(deferred.promise);
                    const service = storage.createTableServiceWithSas(node.host, node.sasToken);

                    // determine the query range
                    const grain = node.timeGrain.charAt(node.timeGrain.length - 2);
                    let start = node.last;
                    if (!start) {
                        start = new Date();
                        if (grain == "H") start.setHours(start.getHours() - 2, 0, 0, 0);
                        if (grain == "M") start.setMinutes(start.getMinutes() - 2, 0, 0);
                    }
                    let end = new Date();
                    if (grain == "H") end.setHours(end.getHours() - 1, 0, 0, 0);
                    if (grain == "M") end.setMinutes(end.getMinutes() - 1, 0, 0);

                    // get the metrics                    
                    const query = new storage.TableQuery().where("PartitionKey ge ?", moment(start).format("YYYYMMDDTHHmm")).and("PartitionKey le ?", moment(end).format("YYYYMMDDTHHmm"));
                    service.queryEntities("$MetricsHourPrimaryTransactions" + type, query, null, (error, result, response) => {
                        if (!error) {
                            total += result.entries.length;
                            node.last = end;
                            deferred.resolve();
                        } else {
                            console.error("error(141) [" + node.host + ", " + type + "]: " + error);
                            deferred.reject();
                        }
                    });

                }

                // fetch metrics
                if (account.blob) query(account.blob, "Blob");
                if (account.table) query(account.table, "Table");
                if (account.queue) query(account.queue, "Queue");

            });

            // call again after 1 min (aggressive just to test load)
            q.allSettled(promises).done(() => {
                console.log(total + " metric rows retrieved.");
                setTimeout(RefreshMetrics, 10000);
            });

        } else {
            console.error("error(140): " + error);
        }
    });

}

// initialize
RefreshAccounts();
setTimeout(RefreshMetrics, 10000);