
const adal = require("adal-node");
const request = require("request");
const config = require("config");

// configuration
const authority = config.get("authority");
const directory = config.get("directory");
const subscription = config.get("subscription");
const clientId = config.get("clientId");
const clientSecret = config.get("clientSecret");

// variables
const accounts = [];

// authenticate
const context = new adal.AuthenticationContext(authority + directory);
context.acquireTokenWithClientCredentials("https://management.core.windows.net/", clientId, clientSecret, (error, tokenResponse) => {
    if (!error) {

        // get list of storage accounts
        request.get({
            "uri": "https://management.azure.com/subscriptions/" + subscription + "/providers/Microsoft.Storage/storageAccounts?api-version=2016-12-01",
            "headers": {
                "Authorization": "bearer " + tokenResponse.accessToken
            },
            json: true
        }, (error, response, body) => {
            if (!error && response.statusCode == 200) {

                // create list of accounts
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

                // query all the accounts
                const type = "blob";
                accounts.forEach(sa => {
                    request.get({
                        "uri": "https://management.azure.com" + sa.id + "/services/" + type + "/providers/microsoft.insights/metricDefinitions?api-version=2015-07-01",
                        "headers": {
                            "Authorization": "bearer " + tokenResponse.accessToken
                        },
                        json: true
                    }, (error, response, body) => {
                        if (!error && response.statusCode == 200) {
                            console.log("success");
                        } else {
                            if (error) { console.error("error(120): " + error) } else { console.error("error(121)"); console.log(body); };
                        }
                    });
                });

            } else {
                if (error) { console.error("error(110): " + error) } else { console.error("error(111)"); console.log(body); };
            }
        });

    } else {
        console.error("error(130): " + error);
    }
});