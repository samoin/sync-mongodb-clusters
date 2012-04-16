var net = require("net");
var mongodb = require('mongodb');
var config = require("./client.config");
var PORT = config.server_port || 8081;
var HOST = config.server_host || "127.0.0.1";
var KEY = config.secure_key || {};
var cluster_info = config.cluster_info || "";
var info_end_split_key = config.info_end_split_key || "\\0";
var info_type_split_key = config.info_type_split_key || "\\1";
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

function syncInfo(func){

}

client.connect(PORT , HOST , function(){
	console.log("client connected to server %s:%s" , HOST , PORT);
	//send secure info
	client.write('{type:1,info:' + JSON.stringify(KEY) + '}');
});
client.on("data", function(data){
	// unzip info ,and append it to clientInfo	
	zlib.unzip(data, function(err, buffer) {
	  if (!err) {
		  clientInfo += buffer.toString('utf8',0,buffer.legnth);
		  solveInfo();
	  }else{
			console.log(err);
	  }
	});
});
//client.bufferSize = 16;
client.on("end", function(){
	console.log("client disconnected");
});

// solve info 
function solveInfo(){
	var tmp = clientInfo.indexOf(info_end_split_key);
	console.log(clientInfo);
	if(tmp > -1){
		var str = clientInfo.substring(0,tmp);
		clientInfo = clientInfo.substring(tmp+2,clientInfo.length);
		//get buff info
		if(str.length > 1){
			var obj = eval("(" + str + ")");
			//sync info
			if(obj.type == 3){
				var arr = obj.info;
				sync_size = arr.length;
				for(var i=0;i<arr.length;i++){
					commandArr.push(arr[i]);
				}
				startCommand();
			}
		}
	}
}
var conn ;
mongodb.Db.connect(cluster_info,function(err, con) {
	conn = con;
});
var commandArr = [];
var syncedSize = 0;
var cmdFlag = true;
var unExcutedIndexArr = [];
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
			console.log(dbs);
			if(!isSyncedNamespace(dbs)){
				return ;
			}
			var o = oplog.o;//info
			var o2 = oplog.o2;//info2,when updata ,this appears
			switch(op){
				case "c":
					solveCmd(o,dbs,collections);
					break;
				case "i":
					solveInsert(dbs,collections,o);
					break;
				case "u":	
					solveUpdate(dbs,collections,o,o2);
					break;
				case "d":	
					solveDelete(dbs,collections,o);
					break;
				case "n":	
					unExcutedIndexArr.push(oplog.ts);// this command is not excuted , so push it to array
					resetSyncedSize2(oplog);
					break;
				default: 
					//unExcutedIndexArr.push(oplog);
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
		client.write('{type:3,state:0,info:' + JSON.stringify(KEY) + ',unExcutedArr:' + JSON.stringify(unExcutedIndexArr) + ',syncCount:' + sync_size +'}');
		unExcutedIndexArr = [];
		cmdFlag = true;
		console.log("waiting for server provide cmd ....");
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
function solveCmd(o,dbs,collections){
	// mongoose.connectSet(cluster_info);
	//	conn.close(true,function(){console.log("closed db");});
	conn.databaseName = dbs;
	if(collections === "$cmd"){
		if(o["create"]){	
			var tableName = o["create"];
			conn.createCollection(tableName,{},function(err, collection){
				console.log("create collection %s" , tableName);
				resetSyncedSize2();
			});
		}
		if(o["drop"]){	
			var tableName = o["drop"];
			conn.dropCollection(tableName,function(err, collection){
				console.log("drop collection %s" , tableName);
				resetSyncedSize2();			
			});
		}
		if(o["deleteIndexes"]){	// drop index
			var tableName = o["deleteIndexes"];
			var indexName = o["index"];
			conn.dropIndex(tableName,indexName,function(err, collection){
				console.log("drop collection %s" , tableName);
				resetSyncedSize2();			
			});
		}
		if(o["dropDatabase"]){	// drop database
			conn.dropDatabase(function(err, collection){
				console.log("dropDatabase %s" , dbs);
				resetSyncedSize2();			
			});
		}
	}
}
/**
* insert documents or index
*/
function solveInsert(dbs,collections,o){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			insertColl(coll,o);
		})
	}else{
		insertColl(coll,o);
	}
}	
function insertColl(coll,o){
	coll.insert(o,function(err,result){
		if(!err){
			resetSyncedSize2();
		}
	});
}
/**
* update
*/
function solveUpdate(dbs,collections,o,o2){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			updateColl(coll,o,o2);
		})
	}else{
		updateColl(coll,o,o2);
	}
}
function updateColl(coll,o,o2){
	coll.update(o2 , o ,function(err){
		if(!err){
			resetSyncedSize2();
		}
	});
}
/**
* delete
*/
function solveDelete(dbs,collections,o){
	conn.databaseName = dbs;
	var coll = myCollections[collections];
	if(!coll){
		conn.collection(collections,function(err, coll) {
			myCollections[collections] = coll;
			removeColl(coll,o);
		})
	}else{
		removeColl(coll,o);
	}
}
function removeColl(coll,o){
	coll.remove(o,function(err,result){
		if(!err){
			resetSyncedSize2();
		}
	});
}