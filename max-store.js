
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

        // execute 100 times
        for (var i = 0; i < 100; i++) {

            // get list of storage accounts
            const j = i;
            request.get({
                "uri": "https://management.azure.com/subscriptions/" + subscription + "/providers/Microsoft.Storage/storageAccounts?api-version=2016-12-01",
                "headers": {
                    "Authorization": "bearer " + tokenResponse.accessToken
                },
                json: true
            }, (error, response, body) => {
                console.log(j);
                if (!error && response.statusCode == 200) {
                    // nothing to do
                } else {
                    if (error) {
                        console.error("error(110): " + error)
                    } else {
                        console.error("error(111)");
                        console.log(response.headers);
                        console.log(body);
                    };
                }
            });

        }

    } else {
        console.error("error(130): " + error);
    }
});