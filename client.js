var net = require("net");
var mongodb = require('mongodb');
var config = require("./client.config");
var PORT = config.server_port || 8081;
var HOST = config.server_host || "127.0.0.1";
var reconnect_time = config.reconnect_time || 1;
var KEY = config.secure_key || {};
var start_from_local_oplog_ts = config.start_from_local_oplog_ts || false;
var cluster_info = config.cluster_info || "";
var clientName = KEY.name + "-" + KEY.key;
var client = new net.Socket();
var clientInfo = "";
var zlib = require('zlib');
var SYNC_NAMESPACES = config.sync_db_namespace || "";
var namespaceObj = {};
var namespaceArr = SYNC_NAMESPACES.split(",");
for(var i=0;i<namespaceArr.length;i++){
	namespaceObj[namespaceArr[i]] = 1;
}
var sync_size = 0;
/**
* judge this namespace is need to sync
*/
function isSyncedNamespace(namespace){
	if(SYNC_NAMESPACES === "" || namespaceObj[namespace] === 1){
		return true;
	}
	return false;
}
/**
process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
	client.destroy();
	connectServer();
});
*/

var conn ;
function connectMongbdb(){
	mongodb.Db.connect(cluster_info,function(err, con) {
		if(!err){
			conn = con;
			connectServer();
		}else{
			console.log(err);
		}
	});
}

function connectServer(){
	client.connect(PORT , HOST , function(){
		console.log("client connected to server %s:%s" , HOST , PORT);
		console.log("[%s] waiting for server provide cmd ...." , new Date());
	});
}
var type_normal = 1;
var type_zip = 2;
var type_len = 1;
var info_length_len = 12;
var base_info_len = type_len + info_length_len;
var Buffer = require("buffer").Buffer;
var cache_buff = new Buffer("");
var lastType = 1;
var infoLen = 0;
var lastCopyStart = 0;
var isDecoding = false;
var common_code = "utf8";
var Buffer = require("buffer").Buffer;
var dataBuff = [];
var isSolving = false;


client.on("data", function(data){
	if(!Buffer.isBuffer(data)){
		data = new Buffer(data,common_code);
	}
	pushData(data);
});

function pushData(data){
	dataBuff.push(data);
	if(!isSolving){
		solveData();
	}	
}

function solveData(){
	isSolving = true;
	if(dataBuff.length > 0){
		var data = dataBuff[0];
		var buffLen = data.length;
		var typeBuff = data.slice(0,type_len);
		lastType = typeBuff.toString(common_code,0,buffLen);
		// i always get info that client send to server,so strange,here need to solve
		var	infoLenBuff = data.slice(type_len,base_info_len);
		infoLen = Number(infoLenBuff.toString(common_code,0,infoLenBuff.length));
		var curInfoLen = buffLen - infoLenBuff;
		var expectLen = base_info_len + infoLen;
		// info not all recived
		if(expectLen > buffLen){
			if(dataBuff.length > 1){
				var data2 = dataBuff[1];
				var data2Len = data2.length;
				// merged buff index 0 and 1 to index 0
				var mergedBuff = new Buffer(buffLen + data2Len);
				// maybe this message too big ,need to recive at servral times
				data.copy(mergedBuff,0,0,buffLen);
				var needEnd = buffLen + data2Len;
				if(needEnd > data2Len){
					needEnd = data2Len;
				}		
				data2.copy(mergedBuff,buffLen,0,needEnd);
				console.log("connecting buffers ... , merging length %s , merged length %s , need length %s" , data2Len , mergedBuff.length , expectLen);
				dataBuff.shift();//remove index 0 
				dataBuff.shift();//remove index 1 
				dataBuff.unshift(mergedBuff);//put mergedBuff to index 0 
				isSolving = false;
				solveData();
			}else{
				isSolving = false;
			}
		}else{
			var infoBuff = data.slice(base_info_len,expectLen);
			dataBuff.shift();//remove index 0 
			if(expectLen < buffLen){
				var releasedBuff = new Buffer(buffLen - expectLen);
				data.copy(releasedBuff,expectLen,expectLen,buffLen);
				dataBuff.unshift(releasedBuff);//put releasedBuff to index 0 
			}
			solveData2(infoBuff,lastType);
		}
	}else{
		isSolving = false;
	}
}
function solveData2(infoBuff,lastType){
	if(lastType == type_zip){
		zlib.gunzip(infoBuff, function(err, buffer) {
			if (!err) {
				solveInfo(buffer);
				isSolving = false;
				solveData();
			}else{
				console.log(err);
			}
		});
	}
	if(lastType == type_normal){
		solveInfo(infoBuff);
		isSolving = false;
		solveData();
	}
}

client.on("end", function(){
	console.log("client disconnected");
});

client.on("close", function(e){
	console.log("client close,maybe server is down");
	// if server is down ,reconnect it several seconds later
	restartClient();
});
client.on("timeout", function(){
	console.log("client timeout");
});

function restartClient(){
	client.destroy();
	setTimeout(function () {
		  connectServer();
		}, reconnect_time * 1000);
}
/**client.on("drain", function(){

});*/
client.on("error", function(e){
	console.log("client error");
	if (e.code == 'EADDRINUSE') {
		console.log('Address in use, retrying...');
		setTimeout(function () {
		  client.close();
		  connectServer();
		}, 1000);
	 }
});

// solve info 
function solveInfo(str){
	if(Buffer.isBuffer(str)){
		str = str.toString(common_code,0,str.legnth);
	}
	var obj = eval("(" + str + ")");
	//answer asking secure
	if(obj.type == 5){
		//send secure info
		if(start_from_local_oplog_ts){
			conn.databaseName = "local";
			conn.createCollection("oplog.rs",{},function(err, collection){
				collection.find().sort({ts : -1}).limit(1).toArray(function(err, data) {
					if(!err){
						if(data.length > 0){
							var ts = data[0].ts.toString();
							sendData('{type:1,info:' + JSON.stringify(KEY) + ',ts:"' + ts +'"}');
						}
					}else{
						client.destroy();
					}
				});
			});
		}else{
			sendData('{type:1,info:' + JSON.stringify(KEY) + '}');
		}
	}
	//sync info
	if(obj.type == 3){
		var arr = obj.info;
		sync_size = arr.length;
		for(var i=0;i<arr.length;i++){
			commandArr.push(arr[i]);
		}
		console.log("get new command from server...");
		startCommand();
	}
}

var commandArr = [];
var syncedSize = 0;
var cmdFlag = true;
var unExcutedIndexArr = [];
var errArr = [];
/**
* start to submit cmd
*/
function startCommand(){
	if(cmdFlag){
		cmdFlag = false;
		if(commandArr.length > 0){
			var oplog = commandArr[0];
			var op = oplog.op;//command type(c:create , i:insert , u:update , d:delete , n: initiating set)
			var ns = oplog.ns;//command dbs or collection
			var tmp = ns.indexOf("\.");
			var dbs = ns.substring(0,tmp);
			var collections = ns.substring(tmp+1,ns.length);
			var tsInfo = oplog.ts.toString();
			if(!isSyncedNamespace(dbs)){
				unExcutedIndexArr.push(tsInfo);// this command is not excuted , so push it to array
				syncedSize++;
				commandArr.shift();
				cmdFlag = true;
				startCommand();
				return ;
			}
			var o = oplog.o;//info
			var o2 = oplog.o2;//info2,when updata ,this appears
			switch(op){
				case "c":
					solveCmd(tsInfo,o,dbs,collections);
					break;
				case "i":
					solveInsert(tsInfo,dbs,collections,o);
					break;
				case "u":	
					solveUpdate(tsInfo,dbs,collections,o,o2);
					break;
				case "d":	
					solveDelete(tsInfo,dbs,collections,o);
					break;
				case "n":	
					unExcutedIndexArr.push(tsInfo);// this command is not excuted , so push it to array
					resetSyncedSize2(oplog);
					break;
				default: 
					unExcutedIndexArr.push(tsInfo);
					resetSyncedSize();
				 break;
			}
		}
	}
}
/**
* judge wether synced over
*/
function resetSyncedSize(){
	syncedSize++;
	cmdFlag = true;
	startCommand();
	if(syncedSize == sync_size){
		// synced over , record to db
		syncedSize = 0;
		var datas = '{type:4,state:' + (errArr.length >0 ? 1 : 0) + ',info:' + JSON.stringify(KEY) + ',errArr:' + JSON.stringify(errArr) + ',unExcutedArr:' + JSON.stringify(unExcutedIndexArr) + ',syncCount:' + sync_size +'}';
		sendData(datas);
		console.log("this synced result : >> " + datas);
		unExcutedIndexArr = [];
		errArr = [];
		cmdFlag = true;
		console.log("[%s] waiting for server provide cmd ...." , new Date());
	}
}
/**
* shift from commandArr before judge wether synced over
*/
function resetSyncedSize2(){
	commandArr.shift();
	resetSyncedSize();
}
var myCollections = {};
/**
* command
*/
function solveCmd(ts,o,dbs,collections){
	conn.databaseName = dbs;
	if(collections === "$cmd"){
		if(o["create"]){	
			var tableName = o["create"];
			conn.createCollection(tableName,{},function(err, collection){
				if(err){
					errArr.push(ts);
				}
				resetSyncedSize2();
			});
		}
		if(o["drop"]){	
			var tableName = o["drop"];
			conn.dropCollection(tableName,function(err, collection){
				if(err){
					errArr.push(ts);
				}
				resetSyncedSize2();			
			});
		}
		if(o["deleteIndexes"]){	// drop index
			var tableName = o["deleteIndexes"];
			var indexName = o["index"];
			conn.dropIndex(tableName,indexName,function(err, collection){
				if(err){
					errArr.push(ts);
				}
				resetSyncedSize2();			
			});
		}
		if(o["dropDatabase"]){	// drop database
			conn.dropDatabase(function(err, collection){
				if(err){
					errArr.push(ts);
				}
				resetSyncedSize2();			
			});
		}
	}
}
/**
* insert documents or index
*/
function solveInsert(ts,dbs,collections,o){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			insertColl(ts,coll,o);
		})
	}else{
		insertColl(ts,coll,o);
	}
}	
function insertColl(ts,coll,o){
	coll.insert(o , {safe:true} ,function(err,result){
		/** make it err to test mail
		if(!err){
			err = 123;
		}
		*/
		if(err){
			errArr.push(ts);
		}
		resetSyncedSize2();
	});
}
/**
* update
*/
function solveUpdate(ts,dbs,collections,o,o2){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			updateColl(ts,coll,o,o2);
		})
	}else{
		updateColl(ts,coll,o,o2);
	}
}
function updateColl(ts,coll,o,o2){
	coll.update(o2 , o , {safe:true} ,function(err){
		if(err){
			errArr.push(ts);
		}
		resetSyncedSize2();
	});
}
/**
* delete
*/
function solveDelete(ts,dbs,collections,o){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			removeColl(ts,coll,o);
		})
	}else{
		removeColl(ts,coll,o);
	}
}
function removeColl(ts,coll,o){
	coll.remove(o , {safe:true} ,function(err,result){
		if(err){
			errArr.push(ts);
		}
		resetSyncedSize2();
	});
}

function sendData(str){
	var buff = new Buffer(str, common_code);
	var msgInfo = type_normal + "" + getLen(buff,str.length);
	var tmp = new Buffer(msgInfo, common_code);
	client.write(msgInfo + str);
}
function getLen(buffer,len){
	if(!len){
		len = buffer.length;
	}
	len += "";
	var len2 = len.length;
	if(info_length_len > len2){
		var str = "";
		for(var i=0;i<info_length_len - len2;i++){
			str += "0";
		}
		len = str + len;
	}
	return len;
}

var cluster = require('cluster');
if (cluster.isMaster) {
	cluster.fork();
	cluster.on('death', function(worker) {
		console.log('worker ' + worker.pid + ' died , restarting ...');
		cluster.fork();
	});
} else {
	connectMongbdb();
}
