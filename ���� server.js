var net = require("net")
	,sys = require("sys");
var mongoose = require("mongoose");
var oplogMongoose = require("./model/oplog.rs");
var config = require("./server.config") || {};
var PORT = config.port || 8081;
var HOST = config.host || "127.0.0.1";
var KEYS = config.keys || [];
var MAXSYNCPER = config.max_sync_count_per || 100;
var LOOPTIME = config.loop_time || 1;//unit(sec)
//key:name,val:keyobj
var KEYSOBJ = {};
for(var i=0 ; i<KEYS.length ; i++){
	var tmp = KEYS[i];
	KEYSOBJ[tmp.name  + "-" + tmp.key] = tmp;
}

// registed clientObjects
var regClientObj = {};

var regClientKeyObj = {};
//create server
var server = net.createServer(function(c){
	c.setEncoding("utf8");
	c.bufferSize = 16;

	c.on("connect",function(){
		console.log("client %s:%s connected, waiting for registe secrue key ..." , c.remoteAddress , c.remotePort);
	});

	c.on("data",function(data){
		//type: {1:secrue,2:msg},info:{}
		var result = eval("(" + data + ")");
		if(result.type == 1){
			var secrue = result.info;
			var key = secrue.name + "-" + secrue.key;
			if(!KEYSOBJ[key]){//secrue key error
				c.destroy();
				console.log("client %s:%s not allow connect, it's without secrue key ..." , c.remoteAddress , c.remotePort);
			}else if (regClientObj[key]){//secrue key used
				c.destroy();
				console.log("client %s:%s not allow connect, secrue key is in used ..." , c.remoteAddress , c.remotePort);
			}else{
				regClientObj[key] = c;
				regClientKeyObj[genderIPKey(c)] = key;
				for(var k in regClientObj){
					regClientObj[k].write("client " + c.remoteAddress + ":" + c.remotePort + " connected");
				}
				console.log("client %s:%s allow connect ..." , c.remoteAddress , c.remotePort);
			}
		}
		//c.write("data:" + data + "\0");
	});

	c.on("end",function(){
		// reset key in regClientObj to null
		regClientObj[regClientKeyObj[genderIPKey(c)]] = null;
		console.log("server disconnected %s:%s" , c.remoteAddress , c.remotePort);
	});
	c.pipe(c);
	console.log("server connected");
});
//listen server
server.listen(PORT , HOST , function(){	
	if((keysLen = KEYS.length) == 0){
		console.log("\nsync without key register ...");
	}else{
		console.log("\nsync with key register , allow %s clients ..." , keysLen);
	}
});
//create interval ,looping mongodb every n second
var intervals = setInterval(syncMongodb , LOOPTIME * 1000);
/**
* gender key ,for one client ,with ip and port
*/
function genderIPKey(c){
	return c.remoteAddress + ":" + c.remotePort;
}
var mongooses = {};
/**
* looping for sync mongodb
*/
function syncMongodb(){
	for(var k in regClientObj){
		var clusterinfo = KEYSOBJ[k].cluster_info;
		console.log(clusterinfo);
		if(!mongooses[clusterinfo]){
			mongoose.connectSet(clusterinfo); 
			mongoose.model(oplogMongoose.modelName,oplogMongoose.schema,oplogMongoose.collName);
		}else{

		}
		var OplogModel = mongoose.model(oplogMongoose.modelName,oplogMongoose.collName);
		OplogModel.find(null,null,null,function(err,data){
			if(!err){
				for(var k in mongoose){
					console.log(k );
				}
				mongoose.disconnect();
			}
			//console.log("_____" + err + ":" + data);
		});
		//regClientObj[k].write("client " + c.remoteAddress + ":" + c.remotePort + " connected");
	}
}