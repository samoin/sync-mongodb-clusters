var net = require("net");
var config = require("./client.config");
var PORT = config.server_port || 8081;
var HOST = config.server_host || "127.0.0.1";
var KEY = config.secure_key || {};
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
		console.log(str);
		//sync info
		if(obj.type == 3){
			var arr = obj.info;
			for(var i=0;i<arr.length;i++){
				var oplog = arr[i];
				var op = oplog.op;//command type(c:create , i:insert , u:update , d:delete , n: initiating set)
				var ns = oplog.ns;//command dbs or collection
				var arr = ns.split(".");
				var dbs = arr[0];
				var collections = "";
				if(arr.length == 2){
					collections = arr[1];
				}
				if(!isSyncedNamespace(dbs)){
					continue;
				}
				var o = oplog.o;//info
				var o2 = oplog.o2;//info2,when updata ,this appears
				switch(op){
					case "c":
						//console.log("c");
						// command£¬as create or drop collections
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
						//console.log("n");
						// like start replica set ,not used

						break;
					default: 
					 break;
				}
				
			}
			// synced over , record to db
			client.write('{type:3,state:0,info:' + JSON.stringify(KEY) + '}');
		}
	}
}
/**
* insert
*/
function solveInsert(ns,o){
	
}
/**
* update
*/
function solveUpdate(ns,o,o2){

}
/**
* delete
*/
function solveDelete(ns,o){

}