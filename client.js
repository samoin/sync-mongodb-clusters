var net = require("net");
var mongoose = require('mongoose');
var repl_set_servers = require("mongodb/lib/mongodb/connection/repl_set_servers");
var mongodb = require('mongodb');
var config = require("./client.config");
var PORT = config.server_port || 8081;
var HOST = config.server_host || "127.0.0.1";
var KEY = config.secure_key || {};
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
		  //console.log(data.length + ":" + buffer.length);
		  clientInfo += buffer.toString('utf8',0,buffer.legnth);
		  solveInfo();
	  }
	});
});
//client.bufferSize = 16;
client.on("end", function(){
	console.log("client disconnected");
});

// solve info 
function solveInfo(){
	var tmp = clientInfo.indexOf("\\0");
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
var conn ;
mongodb.Db.connect(cluster_info,function(err, con) {
	conn = con;
});
var commandArr = [];
var syncedSize = 0;
var cmdFlag = true;
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
			var arr2 = ns.split(".");
			var dbs = arr2[0];
			var collections = "";
			if(arr2.length == 2){
				collections = arr2[1];
			}
			if(!isSyncedNamespace(dbs)){
				return ;
			}
			var o = oplog.o;//info
			var o2 = oplog.o2;//info2,when updata ,this appears
			console.log(o);
			switch(op){
				case "c":
					solveCmd(o,dbs,collections);
					break;
				case "i":
					solveInsert(ns,o);
					break;
				case "u":	
					solveUpdate(ns,o,o2);
					break;
				case "d":	
					solveDelete(ns,o);
					break;
				case "n":	
					resetSyncedSize2();
					break;
				default: 
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
		client.write('{type:3,state:0,info:' + JSON.stringify(KEY) + '}');
	}
}
/**
* shift from commandArr before judge wether synced over
*/
function resetSyncedSize2(){
	commandArr.shift();
	resetSyncedSize();
}
/**
* command
*/
function solveCmd(o,dbs,collections){
	// mongoose.connectSet(cluster_info);
	//	conn.close(true,function(){console.log("closed db");});
	conn.databaseName = dbs;
	if(collections === "$cmd"){
		for(var k in o){
			var tableName = o[k];
			if(k === "create"){	
				conn.createCollection(tableName,{},function(err, collection){
					console.log("create collection %s" , tableName);
					resetSyncedSize2();
				});
			}
			if(k === "drop"){	
				conn.dropCollection(tableName,function(err, collection){
					console.log("drop collection %s" , tableName);
					resetSyncedSize2();			
				});
			}
		}
	}
}
/**
* insert
*/
function solveInsert(ns,o){
	mongodb.connect(cluster_info,function(err, conn) {
			//conn.close(true,function(){console.log("closed db");});
				resetSyncedSize();
	});
	
}	
/**
* update
*/
function solveUpdate(ns,o,o2){
	resetSyncedSize();
}
/**
* delete
*/
function solveDelete(ns,o){
	resetSyncedSize();
}