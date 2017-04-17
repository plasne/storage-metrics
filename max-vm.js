
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
            "uri": "https://management.azure.com/subscriptions/" + subscription + "/providers/Microsoft.Compute/virtualMachines?api-version=2016-04-30-preview",
            "headers": {
                "Authorization": "bearer " + tokenResponse.accessToken
            },
            json: true
        }, (error, response, body) => {
            if (!error && response.statusCode == 200) {

                // create list of accounts
                body.value.forEach(vm => {
                    accounts.push({
                        id: vm.id,
                        name: vm.name
                    });
                });

                // query all the accounts
                accounts.forEach(vm => {
                    request.get({
                        "uri": "https://management.azure.com" + vm.id + "/metricDefinitions?api-version=2014-04-01",
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