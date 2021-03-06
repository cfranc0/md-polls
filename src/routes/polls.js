// polls.js
// (c) 2019 - CesconFrancesco

const express = require('express');
const router = express.Router();

require('dotenv').config();

const aws = require('aws-sdk');
var ddb = new aws.DynamoDB({apiVersion: '2012-08-10', region: process.env.AWS_REGION});

router.get('/:id', (req, res) => {
	// Get polls data from ID

	var params = {
		TableName: process.env.AWS_TABLE_NAME,
		ConsistentRead: true,
		Limit: 1,
		KeyConditionExpression: "ID = :val",
		ExpressionAttributeValues: {
			':val': {S: req.params.id}
		}
	};

	var ddbResponse = ddb.query(params, function(err, data) {
		if (err) {
			console.error("DynamoDB error results.js : ", err);
		  res.json({result: "error", message:"Somthing didn\'t work out quite right"});
		} else {
			var resultSet = []
			data.Items.forEach(function(element, index, array) {
				resultSet.push(element);
			});

			if (data.Items.length === 0) {
				res.json({result: "empty"});
			}
			else {
				res.json(data.Items[0]);
			}
		}
	});

});

router.post('/', (req, res) => {

	// Create a new poll

	// Remap data
	var d = req.body;

	const alphabet = 'abcdefghikmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789-';
	var pollID_number = Math.floor(Date.now() - 946080000) + String(Math.floor(Math.random()*1000));

	var pollID = '';
	var rem = 0;

	while (pollID_number > 1) {

		rem = Math.floor(pollID_number % 60);

		pollID = alphabet.slice(rem, rem+1) + pollID;

		pollID_number /= 60;

	}

	// Item to be added into dynamoDB
	var itemData = {
		'ID': {S: pollID},
		'created': {N: String(Date.now())},
		'ownerIP': {S: req.headers['x-forwarded-for'] || req.connection.remoteAddress},
		'title': {S: d.title || pollID},
		'metadata': {M: {
			preventDoubles: {BOOL: (d.metadata.preventDoubles || false)},
			collectNames: {BOOL: (d.metadata.collectNames || false)},
			hiddenResults: {BOOL: (d.metadata.hiddenResults || false)},
			answeredBy: {L: []}
		}},
		'options': null,
	}

	// Check options quality
	for (var i = 0; i < d.options.length; i++) {
		d.options[i].ID = i;

		if (d.options[i].value == "") {
			d.options.splice(i,1);
		}
	}
	if (d.options.length < 1) {
		res.json({result: "error", error: "notEnoughAnswers", message:"Not enough valid options"});
		return false;
	}

	// Adding the options
	var options = [];
	for (var i = 0; i < d.options.length; i++) {
		var o = d.options[i];

		if (isNaN(parseInt(o.metadata.limitAnswers)) || o.metadata.limitAnswers < 0) {
			o.metadata.limitAnswers = 0;
		}

		// Forcing object structure
		// Hence, only allowed data will be inside the database
		var singleOption = {
			id: {N: String(i)},
			value: {S: o.value},
			metadata: {M: {
				limitAnswers: {N: String(o.metadata.limitAnswers)}
			}},
			votes: {N: '0'}
		}

		if (d.metadata.collectNames) {
			singleOption.metadata.M["names"] = {L : []};
		}

		options.push({M: singleOption});
	}
	itemData.options = {L: options};

	var params = {
		TableName: process.env.AWS_TABLE_NAME,
		Item: itemData
	};

	var ddbResponse = ddb.putItem(params).promise();

	ddbResponse.then(function(data) {
		console.log("Poll created: "+pollID);

	  res.json({result: "success", ID: pollID, message:"Request processed successfully"});
	}).catch(function(err) {
		console.error("Poll creation error: "+pollID+" | error: "+ err.message);

	  res.json({result: "error", message:"Somthing didn\'t work out quite right"});
	});


});

module.exports = router;
