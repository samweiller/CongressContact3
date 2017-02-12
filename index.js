/////////////////////////////
//  WELCOME TO JEFFERSON!  //
/////////////////////////////
//  You're in for a real   //
//  treat.                 //
/////////////////////////////


const
    bodyParser = require('body-parser'),
    config = require('config'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request');

var googleMapsClient = require('@google/maps').createClient({
    key: 'AIzaSyCEWnT2fRtUmWSMIpLXLTu5cLmMbFrfMKk'
});

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({
    verify: verifyRequestSignature
}));
app.use(express.static('public'));
var myCoordinates = []

/*
 * Be sure to setup your config values before running this code. You can
 * set them using environment variables or modifying the config file in /config.
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.APP_SECRET)

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.VALIDATION_TOKEN)

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.PAGE_ACCESS_TOKEN)

// URL where the app is running (include protocol). Used to point to scripts and
// assets located at this address.
const SERVER_URL = (process.env.SERVER_URL)

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
    console.error("Missing config values");
    process.exit(1);
}

/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});

// SET UP ALL THREAD SETTINGS HERE
request({
    url: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN
    },
    method: 'POST',
    json: {
        "setting_type": "call_to_actions",
        "thread_state": "new_thread",
        "call_to_actions": [{
            "payload": "WELCOME_PAYLOAD"
        }]
    }
}, function(error, response, body) {
    if (error) {
        console.log('Error sending message: ', error);
    } else if (response.body.error) {
        console.log('Error: ', response.body.error);
    }
});

request({
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: {
        access_token: PAGE_ACCESS_TOKEN
    },
    method: 'POST',
    json: {
        setting_type: "domain_whitelisting",
        "whitelisted_domains": ["https://www.facebook.com", "https://petersfancybrownhats.com", "https://senate.gov"],
        "domain_action_type": "add"
    }
}, function(error, response, body) {
    if (error) {
        return console.error('upload failed:', error);
    }
    console.log('Upload successful!  Server responded with:', body);
})

request({
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: {
        access_token: PAGE_ACCESS_TOKEN
    },
    method: 'POST',
    json: {
        setting_type: "call_to_actions",
        "thread_state": "existing_thread",
        "call_to_actions": [{
            "type": "postback",
            "title": "Find More Representatives",
            "payload": "RESTART_REP_SEARCH_PAYLOAD"
        }, {
            "type": "postback",
            "title": "About Jefferson",
            "payload": "ABOUT_THIS_BOT_PAYLOAD"
        }]
    }
}, function(error, response, body) {
    if (error) {
        return console.error('upload failed:', error);
    }
    console.log('Upload successful!  Server responded with:', body);
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function(req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL.
 *
 */
app.get('/authorize', function(req, res) {
    var accountLinkingToken = req.query.account_linking_token;
    var redirectURI = req.query.redirect_uri;

    // Authorization Code should be generated per user by the developer. This will
    // be passed to the Account Linking callback.
    var authCode = "1234567890";

    // Redirect users to this URI on successful login
    var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        redirectURISuccess: redirectURISuccess
    });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
   //  console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s",
            messageId, appId, metadata);
        return;
    } else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        console.log("Quick reply for message %s with payload %s",
            messageId, quickReplyPayload);

        sendTextMessage(senderID, "Quick reply tapped");
        return;
    }

    if (messageText) {

        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.
        switch (messageText) {
            case 'button':
                sendButtonMessage(senderID);
                break;

            case 'generic':
                sendGenericMessage(senderID);
                break;

            case 'receipt':
                sendReceiptMessage(senderID);
                break;

            case 'quick reply':
                sendQuickReply(senderID);
                break;

            case 'read receipt':
                sendReadReceipt(senderID);
                break;

            case 'typing on':
                sendTypingOn(senderID);
                break;

            case 'typing off':
                sendTypingOff(senderID);
                break;

            case 'account linking':
                sendAccountLinking(senderID);
                break;

            default:
                sendTextMessage(senderID, "Whoops! I'm not sure what you said there. Try tapping one of the buttons above or restarting the conversation from the menu.");
        }
    } else if (messageAttachments) {
        messageAttachments = messageAttachments[0]
        if (messageAttachments.type === 'location') {
            sendTextMessage(senderID, "Excellent! Hang on while I find your representatives.")

            // Get Reps from Sunight
            request({
                uri: 'https://congress.api.sunlightfoundation.com/legislators/locate',
                qs: {
                    latitude: messageAttachments.payload.coordinates.lat,
                    longitude: messageAttachments.payload.coordinates.long
                },
                method: 'GET',
            }, function(error, response, body) {
                if (error) {
                    return console.error('upload failed:', error);
                }
                console.log('Upload successful!  Server responded with:', body);

                var dataPack = JSON.parse(body);
                if (dataPack.results.length == 0) {
                    sendTextMessage(senderID, "Looks like there are no congresspeople in that area. Please select another location using the menu.")
                } else {
                    // build congressperson data cards
                    dataElements = []
                    masterRepData = []
                    scriptData = []

                    for (cPeople = 0; cPeople < dataPack.results.length; cPeople++) {
                        repData = dataPack.results[cPeople];
                        masterRepData.push(repData)

                        theName = toTitleCase(repData.first_name) + " " + toTitleCase(repData.last_name)

                        if (repData.party == 'R') {
                            theParty = 'Republican'
                        } else if (repData.party == 'D') {
                            theParty = 'Democrat'
                        } else if (repData.party == 'I') {
                            theParty = 'Independent'
                        } else {
                            theParty = 'Party Error'
                        }

                        theFullSubtitle = toTitleCase(repData.chamber) + " - " + theParty

                        if (repData.gender == 'M') {
                           repArticle = 'Him';
                        } else if (repData.gender == 'F') {
                           repArticle = 'Her'
                        } else {
                           repArticle = 'Them'
                        }

                        theURL = repData.website
                        if (theURL[4] == ':') {
                            theURL = theURL.replace('http', 'https')
                        }

                        if (repData.chamber.toLowerCase() == 'senate') {
                           chamberTitle = 'Senator'
                            chamberZip = '20510'
                        } else if (repData.chamber.toLowerCase() == 'house') {
                           chamberTitle = 'Representative'
                            chamberZip = '20515'
                        } else {
                           chamberTitle = 'Congressperson'
                            chamberZip = '20510'
                        }

                        imageURL = "https://theunitedstates.io/images/congress/225x275/" + repData.bioguide_id + ".jpg"

                        theContactPayload = {
                           'payloadID': 'GENERATE_SCRIPT',
                           'rep_first_name': repData.first_name,
                           'rep_last_name': repData.last_name,
                           'rep_phone': repData.phone,
                           'chamber_title': chamberTitle,
                           'coords_lat': messageAttachments.payload.coordinates.lat,
                           'coords_long': messageAttachments.payload.coordinates.long,
                           'bioguide': repData.bioguide_id
                        }

                        theContactPayload = JSON.stringify(theContactPayload)

                        addressText = repData.first_name + " " + repData.last_name + "\n" + repData.office + "\n" + "Washington, DC, " + chamberZip

                        theInfoPayload = {
                           'payloadID': 'GENERATE_MORE_OPTIONS',
                           'rep_address': addressText,
                           'twitter': repData.twitter_id,
                           'bioguide': repData.bioguide_id
                        }

                        theInfoPayload = JSON.stringify(theInfoPayload)

                        repToPush = {
                            title: theName,
                            image_url: imageURL,
                            subtitle: theFullSubtitle,
                            "default_action": {
                                "type": "web_url",
                                "url": theURL
                            },
                            "buttons": [{
                                "type": "postback",
                                "title": "Contact " + repArticle,
                                "payload": theContactPayload
                            }, {
                                "type": "postback",
                                "title": "More Options",
                                "payload": theInfoPayload
                            }]
                        }

                        dataElements.push(repToPush) // Push rep into data array

                        myCoordinates = [messageAttachments.payload.coordinates.lat, messageAttachments.payload.coordinates.long]
                    }

                    // CALL SEND API
                    var messageContent = {
                        "recipient": {
                            id: senderID
                        },
                        "message": {
                            "attachment": {
                                "type": "template",
                                "payload": {
                                    "template_type": "generic",
                                    "elements": dataElements
                                }
                            },
                        }
                    }
                    callSendAPI(messageContent)
                }
            })
        }
    }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function(messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

    if (payload.indexOf('WELCOME_PAYLOAD') > -1) {
        sendTextMessage(senderID, "Hello! I'm Jefferson. I can help you get in contact with your congresspeople.");
        setTimeout(function() {
            sendLocationRequest(senderID)
        }, 2000)
     } else if (payload.indexOf('ABOUT_THIS_BOT_PAYLOAD') > -1) {

        structuredPayload = JSON.parse(payload)

        sendTextMessage(senderID, "Jefferson was created by Sam Weiller, 2017. Operations are supported by the Sunlight Foundation API, TheUnitedStates.io, and Google's Geocode API. For any questions, please visit us at CallWithJefferson.org or contact us at jefferson@samweiller.io.")
    } else if (payload.indexOf('RESTART_REP_SEARCH_PAYLOAD') > -1) {
        setTimeout(function() {
            sendTextMessage(senderID, "Let's look up some more representatives.")
            setTimeout(function() {
                sendLocationRequest(senderID)
            }, 2000)
        }, 1000)
    } else if (payload.indexOf('GENERATE_SCRIPT') > -1) {


        payloadData = JSON.parse(payload)

        googleMapsClient.reverseGeocode({
            latlng: payloadData.coords_lat + ',' + payloadData.coords_long
        }, function(err, response) {
            if (!err) {
               theLocationData = response.json.results[0];

               theZip = '';
               theState = '';
               theCity = '';
                    for (j = 0; j < theLocationData.address_components.length; j++) {
                        if (theLocationData.address_components[j].types[0] == 'postal_code') {
                           theZip = theLocationData.address_components[j].long_name
                        } else if (theLocationData.address_components[j].types[0] == 'administrative_area_level_1') {
                           theState = theLocationData.address_components[j].long_name
                        } else if (theLocationData.address_components[j].types[0] == 'locality') {
                           theCity = theLocationData.address_components[j].long_name
                        }
                    }
               //  }

               if (theCity == '') { // If a location has no locality (ie Brooklyn), search back through for a sublocality
                  for (j = 0; j < theLocationData.address_components.length; j++) {
                     if (theLocationData.address_components[j].types[0] == 'political') {
                        if (theLocationData.address_components[j].types[1] == 'sublocality') {
                           theCity = theLocationData.address_components[j].long_name
                        }
                     }
                  }
               }

                request({
                    uri: 'https://graph.facebook.com/v2.6/' + senderID,
                    qs: {
                       access_token: PAGE_ACCESS_TOKEN
                    },
                    method: 'GET'

                }, function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var recipientId = body.recipient_id;
                        var messageId = body.message_id;

                        userData = JSON.parse(body);

                        userName = userData.first_name + " " + userData.last_name

                        talkingScript = "Hello. My name is " + userName + ". I am a constituent from " + theCity + ", " + theState + ", zip code " + theZip + ". I do not need a response. I am in favor of/opposed to ____, and I encourage " + payloadData.chamber_title + " " + payloadData.rep_last_name + " to please support/oppose this as well. Thanks for your hard work answering the phones!"

                        // Send script with a call button.
                        console.log(talkingScript)

                        var messageData = {
                            recipient: {
                                id: senderID
                            },
                            message: {
                                attachment: {
                                    type: "template",
                                    payload: {
                                        template_type: "button",
                                        text: talkingScript,
                                        buttons: [{
                                            type: "phone_number",
                                            title: "Call the Office",
                                            payload: "+1" + payloadData.rep_phone
                                        }]
                                    }
                                }
                            }
                        }

                        console.log('message ready to send');

                        sendTextMessage(senderID, "You can use this script when you call.");
                        callSendAPI(messageData);

                    } else {
                        console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
                    }
                });
            } else {
                console.log('LOCATION ERROR')
            }
        });
    } else if (payload.indexOf('GENERATE_MORE_OPTIONS') > -1) {
      payloadData = JSON.parse(payload)

      theMailingPayload = {
         'payloadID': 'GET_MAILING_ADDRESS',
         'rep_address': payloadData.rep_address
      }

      theMailingPayload = JSON.stringify(theMailingPayload)

        var messageData = {
            recipient: {
               id: senderID
            },
            message: {
               attachment: {
                    type: "template",
                    payload: {
                        template_type: "button",
                        text: "In addition to calling, here are some other actions you can take.",
                        buttons: [{
                           type: "postback",
                           title: "Get Mailing Address",
                           payload: theMailingPayload
                        }]
                    }
               }
            }
       }

       callSendAPI(messageData);
    } else if (payload.indexOf('GET_MAILING_ADDRESS') > -1) {
        payloadData = JSON.parse(payload)
        sendTextMessage(senderID, payloadData.rep_address)
        sendTextMessage(senderID, "Pro tip: If you write you congresspeople, send a postcard! Envelopes often take longer to be opened, read, and considered.")
    } else if (payload.indexOf('GO_TO_TWITTER') > -1) {
        repIndex = payload[payload.length - 1];
        scriptTemp = masterRepData[repIndex]

        imageURL = "https://theunitedstates.io/images/congress/450x550/" + scriptTemp.bioguide_id + ".jpg"

        if (scriptTemp.chamber.toLowerCase() == 'senate') {
            chamberTitle = 'Senator'
        } else if (scriptTemp.chamber.toLowerCase() == 'house') {
            chamberTitle = 'Representative'
        } else {
            chamberTitle = 'Congressperson'
        }

        theURL = 'http://twitter.com/' + scriptTemp.twitter_id

        var messageContent = {
            "recipient": {
                id: senderID
            },
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "generic",
                        "elements": [{
                            title: "Visit " + chamberTitle + " " + scriptTemp.last_name + " on Twitter.",
                            image_url: imageURL,
                            subtitle: "Twitter",
                            "default_action": {
                                "type": "web_url",
                                "url": theURL
                            },
                            "buttons": [{
                                "type": "element_share"
                            }]
                        }]
                    }
                },
            }
        }
        callSendAPI(messageContent)
    }
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData);
}

function sendLocationRequest(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        "message": {
            "text": "All I need is your location to get started.",
            "quick_replies": [{
                "content_type": "location",
            }]
        }
    }
    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
    console.log("Sending a read receipt to mark message as seen");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
    console.log("Turning typing indicator on");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
    console.log("Turning typing indicator off");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
            access_token: PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
