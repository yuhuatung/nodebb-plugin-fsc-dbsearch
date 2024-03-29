'use strict';

var winston = require.main.require('winston');
var async = require.main.require('async');

module.exports = function(db) {

	async.series([
		function(next) {
			db.client.collection('searchtopic').createIndex({content: 'text', uid: 1, cid: 1}, {background: true}, next);
		},
		function(next) {
			db.client.collection('searchtopic').createIndex({id: 1}, {background: true}, next);
		},
		function(next) {
			db.client.collection('searchpost').createIndex({content: 'text', uid: 1, cid: 1}, {background: true}, next);
		},
		function(next) {
			db.client.collection('searchpost').createIndex({id: 1}, {background: true}, next);
		}
	], function(err) {
		if (err) {
			winston.error(err);
		}
	});

	db.searchIndex = function(key, data, ids, callback) {
		callback = callback || function() {};

		if (!ids.length) {
			return callback();
		}

		ids = ids.map(function(id) {
			return parseInt(id, 10);
		});

		var bulk = db.client.collection('search' + key).initializeUnorderedBulkOp();
		ids.forEach(function(id, index) {
			var setData = {
				id: id
			};

			for(var field in data[index]) {
				if (data[index].hasOwnProperty(field) && data[index][field]) {
					setData[field] = data[index][field].toString();
				}
			}

			bulk.find({id: id}).upsert().updateOne({$set: setData});
		});

		bulk.execute(function(err) {
			if (err) {
		 		winston.error('Error indexing ' + err.message);
		 	}
			callback(err);
		});
	};

	db.search = function(key, data, limit, callback) {
		var searchQuery = {};

		if (data.content) {
			searchQuery.$text = {$search: data.content};
		}

		if (Array.isArray(data.cid) && data.cid.length) {
			data.cid = data.cid.filter(Boolean);
			if (data.cid.length > 1) {
				searchQuery.cid = {$in: data.cid.map(String)};
			} else if (data.cid[0]) {
				searchQuery.cid = data.cid[0].toString();
			}
		}

		if (Array.isArray(data.uid) && data.uid.length) {
			data.uid = data.uid.filter(Boolean);
			if (data.uid.length > 1) {
				searchQuery.uid = {$in: data.uid.map(String)};
			} else if (data.uid[0]) {
				searchQuery.uid = data.uid[0].toString();
			}
		}

		var aggregate = [{$match: searchQuery}];
		if (searchQuery.$text) {
			aggregate.push({$sort: {score: {$meta: 'textScore'}}});
		}
		aggregate.push({$limit: parseInt(limit, 10)});
		aggregate.push({$project: {_id: 0, id: 1}});

		var regexValue = '\.*' + data.content + '\.*';

		db.client.collection('search' + key).find({content: new RegExp(regexValue)}).toArray(function(err, results) {
			if (err) {
				return callback(err);
			}

			if (!results || !results.length) {
				return callback(null, []);
			}

			var data = results.map(function(item) {
				return item.id;
			});

			callback(null, data);
		});

	// 	db.client.collection('search' + key).aggregate(aggregate).toArray(function(err, results) {

	// 		// console.log(results) // [{ id: 7 }, { id: 1 }]
	// 		if (err) {
	// 			return callback(err);
	// 		}

	// 		if (!results || !results.length) {
	// 			return callback(null, []);
	// 		}

	// 		var data = results.map(function(item) {
	// 			return item.id;
	// 		});
	// 		console.log('aggregate');
	// 		console.log(data);
	// 		callback(null, data);
	// 	});

	};

	db.searchRemove = function(key, ids, callback) {
		callback = callback || function() {};

		if (!ids.length) {
			return callback();
		}

		ids = ids.map(function(id) {
			return parseInt(id, 10);
		});

		db.client.collection('search' + key).remove({id: {$in: ids}}, function(err) {
			callback(err);
		});
	};
};
