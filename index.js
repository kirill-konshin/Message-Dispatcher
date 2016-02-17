'use strict';

// Handle local development and testing
require('dotenv').config();

// CONSTANTS
var PORT = 3000;
var FILTER_DIRECTION = 'Outbound';
var FILTER_TO = '511'; // Using 511 as it is the right thing to filter upon for now
// TODO: ADD YOUR NUMBERS TO RECEIVE THE ALERTS
var ALERT_SMS = [
	'15856234190'
];

// Dependencies
var RC = require('ringcentral');
var helpers = require('ringcentral-helpers');
var fs = require('fs');
var http = require('http');

// VARS
var _cachedList = {};
var _extensionFilterArray = [];
var Extension = helpers.extension();
var Message = helpers.message();
var server = http.createServer();

// Initialize the SDK
var SDK = new RC({
	server: process.env.RC_API_BASE_URL,
	appKey: process.env.RC_APP_KEY,
	appSecret: process.env.RC_APP_SECRET
});

// Bootstrap Platform and Subscription
var platform = SDK.platform();
var subscription = SDK.createSubscription();

// Login to the RingCentral Platform
platform.login({
	username: process.env.RC_USERNAME,
	password: process.env.RC_PASSWORD,
	extension: process.env.RC_EXTENSION 
}).then(function(){

});

// Start the server
server.listen(PORT);

// GO!
function init(options) {
	options = options || {};

	platform
		.get('/account/~/device', {
			query: {
				page: 1,
				perPage: 1000
			}
		})
		.then(parseResponse)
		.then(function(data) {
			return data.records.filter(getPhysicalDevices).map(organize);
		})
		.then(startSubscription)
		.catch(function(e) {
			console.error(e);
		});
}

/**
 * Application Functions
**/
function sendAlerts(data) {
	// TODO: SEND THE ALERTS ON THE PROPER CHANNELS, USE THE CONSTANT ABOVE FOR THE TARGET SMS NUMBERS OF PRIORITY RESPONSE TEAM
	// TODO: Need to ETL victim data for outbound messaging
	// TODO: Refactor to handle multiple channels for notification (such as webhooks, etc...)
	var LENGTH = ALERT_SMS.length;
	if(0 < LENGTH) {
		for(var i = 0; i < LENGTH; i++) {
			sendSms(data);
		}
	}
}

function getPhysicalDevices(device) {
	return ('SoftPhone' !== device.type && 'OtherPhone' !== device.type);
}

function generatePresenceEventFilter(item) {
	if(!item) {
		throw new Error('Message-Dispatcher Error: generatePresenceEventFilter requires a parameter');
	} else {
		return '/account/~/extension/' + item.extension.id + '/presence?detailedTelephonyState=true';
	}
}

function loadAlertDataAndSend(eventData) {
	// TODO: Lookup Extension to capture user emergency information
	platform
		.get(Extension.createUrl(eventData.extension.id))
		.then(function(response){
			// Extrapolate emergency information
			console.log("******* LoadAlerrtExtensionDataRespsone is :",JSON.stringify(response));
			return JSON.parse(response);
		})
		.then(sendAlerts)
		.catch(function(e) {
			console.error(e);
		});
}

function organize(ext, i, arr) {
	console.log("Adding the presence event for :", generatePresenceEventFilter(ext));
	_extensionFilterArray.push(generatePresenceEventFilter(ext))
	_cachedList[ext.extension.id] = ext;
}

function parseResponse(response) {
	return JSON.parse(response._text);
}

function startSubscription(options) {
	options = options || {};
	subscription.setEventFilters(_extensionFilterArray);
	//console.log('EXTENSIONS:', _extensionFilterArray);
	subscription.register();
}

function sendSms(data) {
	// For SMS, subject has 160 char max
	platform
		.send({
			url: Message.createUrl({sms}),
			body: {
				to: '18315941779',
				from: '1585623138',
				subject: 'test'
			}
		})
		.then(function(response) {
			// TODO: Check for error and handle
			if(response.error) {
				console.error(response.error);
			} else {
				return true;
			}
		})
		.catch(function(e) {
			throw (e);
		});
}


// Server Event Listeners
server.on('request', inboundRequest);

server.on('error', function(err) {
	console.error(err);
});

server.on('listening', function() {
	console.log('Server is listening to ', PORT);
});

server.on('close', function() {
	console.log('Server has closed and is no longer accepting connections');
});

// Register Platform Event Listeners
platform.on(platform.events.loginSuccess, handleLoginSuccess);
platform.on(platform.events.loginError, handleLoginError);
platform.on(platform.events.logoutSuccess, handleLogoutSuccess);
platform.on(platform.events.logoutError, handleLogoutError);
platform.on(platform.events.refreshSuccess, handleRefreshSuccess);
platform.on(platform.events.refreshError, handleRefreshError);

// Register Subscription Event Listeners
subscription.on(subscription.events.notification, handleSubscriptionNotification);
subscription.on(subscription.events.removeSuccess, handleRemoveSubscriptionSuccess);
subscription.on(subscription.events.removeError, handleRemoveSubscriptionError);
subscription.on(subscription.events.renewSuccess, handleSubscriptionRenewSuccess);
subscription.on(subscription.events.renewError, handleSubscriptionRenewError);
subscription.on(subscription.events.subscribeSuccess, handleSubscribeSuccess);
subscription.on(subscription.events.subscribeError, handleSubscribeError);

// Server Request Handler
function inboundRequest(req, res) {
	//console.log('REQUEST: ', req);
}

/**
 * Subscription Event Handlers
**/
function handleSubscriptionNotification(msg) {
	console.log('SUBSCRIPTION NOTIFICATION: ', JSON.stringify(msg));
	//console.log('SUBSCRIPTION NOTIFICATION: ', msg);
	// TODO: NEED TO BE SURE THIS IS THE RIGHT DATA UPON WHICH TO FILTER
	// Use these constants to filter, not literals: FILTER_DIRECTION and FILTER_TO
	// To modify operation for development, just change these values in the constants
	//if(msg.body.activeCalls[0].direction && msg.body.activeCalls[0].to) {
		if(msg.body.activeCalls[0].direction === FILTER_DIRECTION && msg.body.activeCalls[0].to === FILTER_TO) {
			//console.log("*********** ALERT COPS ***************");
			console.log("The body passed to loadalertdta is :", JSON.stringify(msg.body));
			loadAlertDataAndSend(msg.body);
		}
	//}
}

function handleRemoveSubscriptionSuccess(data) {
	console.log('REMOVE SUBSCRIPTION SUCCESS DATA: ', data);
}

function handleRemoveSubscriptionError(data) {
	console.log('REMOVE SUBSCRIPTION ERROR DATA: ', data);
}

function handleSubscriptionRenewSuccess(data) {
	console.log('RENEW SUBSCRIPTION SUCCESS DATA: ', data);
}

function handleSubscriptionRenewError(data) {
	console.log('RENEW SUBSCRIPTION ERROR DATA: ', data);
}

function handleSubscribeSuccess(data) {
	console.log('SUBSCRIPTION CREATED SUCCESSFULLY');
}

function handleSubscribeError(data) {
	console.log('FAILED TO CREATE SUBSCRIPTION: ', data);
}

/**
 * Platform Event Handlers
**/
function handleLoginSuccess(data) {
	//console.log('LOGIN SUCCESS DATA: ', data);
	init(data);
}

function handleLoginError(data) {
	console.log('LOGIN FAILURE DATA: ', data);
}

function handleLogoutSuccess(data) {
	console.log('LOGOUT SUCCESS DATA: ', data);
}

function handleLogoutError(data) {
	console.log('LOGOUT FAILURE DATA: ', data);
}

function handleRefreshSuccess(data) {
	console.log('REFRESH SUCCESS DATA: ', data);
}

function handleRefreshError(data) {
	console.log('REFRESH FAILURE DATA: ', data);
}
