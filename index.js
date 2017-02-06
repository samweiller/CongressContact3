/* jshint node: true, devel: true */
// 'use strict';

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
 *
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
        setting_type: "greeting",
        greeting: {
            text: "This is an amazing greeting."
        }
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
            "title": "About Hana",
            "payload": "ABOUT_THIS_BOT_PAYLOAD"
        }]
    }
}, function(error, response, body) {
    if (error) {
        return console.error('upload failed:', error);
    }
    console.log('Upload successful!  Server responded with:', body);
})

request({
    uri: 'https://graph.facebook.com/v2.6/me/',
    qs: {
        access_token: PAGE_ACCESS_TOKEN
    },
    method: 'GET'

}, function(error, response, body) {
    if (!error && response.statusCode == 200) {
        var recipientId = body.recipient_id;
        var messageId = body.message_id;

        console.log('RIGHT HERE');
        console.log(recipientId);

        request({
            uri: 'https://graph.facebook.com/v2.6/' + recipientId,
            qs: {
               access_token: PAGE_ACCESS_TOKEN
            },
            method: 'GET'

        }, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                var recipientId = body.recipient_id;
                var messageId = body.message_id;

                console.log('RIGHT HERE, ACTUALLY');
                console.log(body);

                if (messageId) {
                    console.log("Successfully sent message with id %s to recipient %s", messageId, recipientId);
                        console.log(body);
                } else {
                    console.log("Successfully called Send API for recipient %s",
                        recipientId);
                }
            } else {
                console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
            }
        });

        if (messageId) {
            console.log("Successfully sent message with id %s to recipient %s", messageId, recipientId);
                console.log(body);
        } else {
            console.log("Successfully called Send API for recipient %s",
                recipientId);
        }
    } else {
        console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
});


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
    console.log(JSON.stringify(message));

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
                sendTextMessage(senderID, messageText);
        }
    } else if (messageAttachments) {
        messageAttachments = messageAttachments[0]
            //   sendTextMessage(senderID, "Message with attachment received");
            //   console.log('LOOK HERE')
            //   console.log(messageAttachments)
        if (messageAttachments.type === 'location') {
            sendTextMessage(senderID, "Excellent! Hang on while I find your representatives.")
                //   var theMessageContent = "Your location is Lat: " + messageAttachments.payload.coordinates.lat + ", Long: " + messageAttachments.payload.coordinates.long + "."
                //   sendTextMessage(senderID, theMessageContent)

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
                console.log('LOOK HERE')
                var dataPack = JSON.parse(body);
                console.log(dataPack)
                console.log(dataPack.results.length)
                if (dataPack.results.length == undefined) {
                    sendTextMessage(senderID, "Looks like there are no congresspeople in that area. Please select another location using the menu.")
                } else {
                    //  console.log(fooBar.results[0].last_name)
                    //  sendTextMessage(senderID, "Got it!")

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
                           repArticle = 'his';
                        } else if (repData.gender == 'F') {
                           repArticle = 'her'
                        } else {
                           repArticle = 'their'
                        }

                        theURL = repData.website
                        if (theURL[4] == ':') {
                            theURL = theURL.replace('http', 'https')
                        }
                        //  theURL = repData.website.replace('http', 'https')
                        //  console.log(theURL)

                        imageURL = "https://theunitedstates.io/images/congress/225x275/" + repData.bioguide_id + ".jpg"

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
                                "title": "Call " + repArticle + " DC Office",
                                "payload": "GENERATE_SCRIPT_" + cPeople
                            }, {
                                "type": "postback",
                                "title": "More Options",
                                "payload": "GENERATE_MORE_OPTIONS_" + cPeople
                            }]
                        }

                        dataElements.push(repToPush) // Push rep into data array

                        myCoordinates = [messageAttachments.payload.coordinates.lat, messageAttachments.payload.coordinates.long]

                        googleMapsClient.reverseGeocode({
                            latlng: myCoordinates[0] + ',' + myCoordinates[1]
                        }, function(err, response) {
                            if (!err) {
                                theLocationData = response.json.results;

                                if (repData.chamber.toLowerCase() == 'senate') {
                                    chamberTitle = 'Senator'
                                } else if (repData.chamber.toLowerCase() == 'house') {
                                    chamberTitle = 'Representative'
                                }

                                scriptDataPoint = {
                                    constituent: 'James Fillmore',
                                    city: theLocationData.results[3].address_components[0].long_name,
                                    zip: theLocationData.results[5].address_components[0].long_name,
                                    chamber_title: chamberTitle,
                                    last_name: toTitleCase(repData.last_name),
                                    phone_number: repData.phone
                                }

                                scriptData.push(scriptDataPoint)
                            }
                        });
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
                    console.log('sending Now')
                    callSendAPI(messageContent)
                    console.log('should be sent')
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

    console.log('LOOK HERE')
    console.log(event.postback)

    // When a postback is called, we'll send a message back to the sender to
    // let them know it was successful
    // sendTextMessage(senderID, "Postback called");

    if (payload.indexOf('WELCOME_PAYLOAD') > -1) {
        sendTextMessage(senderID, "Hello! I'm Franklin. I can help you get in contact with your congresspeople.");
        setTimeout(function() {
            sendLocationRequest(senderID)
        }, 2000)
    } else if (payload.indexOf('RESTART_REP_SEARCH_PAYLOAD') > -1) {
        setTimeout(function() {
            sendTextMessage(senderID, "Let's look up some more representatives.")
            setTimeout(function() {
                sendLocationRequest(senderID)
            }, 2000)
        }, 1000)
    } else if (payload.indexOf('GENERATE_SCRIPT') > -1) {
        repIndex = payload[payload.length - 1];

        console.log('NO. LOOK HERE!')
            //   console.log(scriptData)
            //   console.log(masterRepData)

        scriptTemp = masterRepData[repIndex]
            //   console.log(scriptTemp)

        constituent = "George Milton"

        googleMapsClient.reverseGeocode({
            latlng: myCoordinates[0] + ',' + myCoordinates[1]
        }, function(err, response) {
            if (!err) {
                console.log('GOT LOCATION')
                theLocationData = response.json.results[0];
               //  console.log(theLocationData)

                if (scriptTemp.chamber.toLowerCase() == 'senate') {
                    chamberTitle = 'Senator'
                } else if (scriptTemp.chamber.toLowerCase() == 'house') {
                    chamberTitle = 'Representative'
                } else {
                    chamberTitle = 'Congressperson'
                }

                console.log(theLocationData.address_components.length);
               //  if (theLocationData) {
               theZip = '';
               theState = '';
               theCity = '';
                    for (j = 0; j < theLocationData.address_components.length; j++) {
                       console.log(theLocationData.address_components[j].types[0]);
                        if (theLocationData.address_components[j].types[0] == 'postal_code') {
                           console.log('log zip');
                           theZip = theLocationData.address_components[j].long_name
                           console.log(theZip);
                        } else if (theLocationData.address_components[j].types[0] == 'administrative_area_level_1') {
                           console.log('log state');
                           theState = theLocationData.address_components[j].long_name
                           console.log(theState);
                        } else if (theLocationData.address_components[j].types[0] == 'locality') {
                           console.log('log city');
                           theCity = theLocationData.address_components[j].long_name
                           console.log(theCity);
                        }
                    }
               //  }

               if (theCity == '') { // If a location has no locality (ie Brooklyn), search back through for a sublocality
                  for (j = 0; j < theLocationData.address_components.length; j++) {
                     if (theLocationData.address_components[j].types[0] == 'political') {
                        if (theLocationData.address_components[j].types[1] == 'sublocality') {
                           theCity = theLocationData.address_components[j].long_name
                           console.log('MISSING CITY FOUND')
                           console.log(theCity);
                        }
                     }
                  }
               }

               console.log('hello I am here');

                console.log(chamberTitle)

               //  theCity = theLocationData[0].address_components[3].long_name;
                console.log(theCity);
               //  theState = theLocationData[0].address_components[5].long_name;
                console.log(theState)
               //  theZip = theLocationData[0].address_components[7].long_name;
                console.log(theZip)
                theLastName = toTitleCase(scriptTemp.last_name)
                console.log(theLastName);
                phoneNumber = scriptTemp.phone
                console.log(phoneNumber);


                talkingScript = "Hello. My name is " + constituent + ". I am a constituent from " + theCity + ", " + theState + ", zip code " + theZip + ". I do not need a response. I am in favor of/opposed to ____, and I encourage " + chamberTitle + " " + theLastName + " to please support/oppose this as well. Thanks for your hard work answering the phones!"

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
                                    payload: "+1" + phoneNumber
                                }]
                            }
                        }
                    }
                }

                // messageData = {
                //     recipient: {
                //         id: recipientID
                //     },
                //     message: {
                //         text: messageText,
                //         metadata: "DEVELOPER_DEFINED_METADATA"
                //     }
                // };


                console.log('message ready to send');

                sendTextMessage(senderID, "You can use this script when you call.");
                callSendAPI(messageData);

                //  setTimeout(function() {
                //      console.log('sending message')
                //
                //      setTimeout(function() {
                //
                //      }, 1000)
                //  }, 1000)
            } else {
                console.log('LOCATION ERROR')
            }
        });
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

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons: [{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPER_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}


/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What's your favorite movie genre?",
            quick_replies: [{
                "content_type": "text",
                "title": "Action",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
            }, {
                "content_type": "text",
                "title": "Comedy",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
            }, {
                "content_type": "text",
                "title": "Drama",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
            }]
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
