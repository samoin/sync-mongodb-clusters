/** that seems mongoose don't suport more than one datasource,
* so i copy mongoose ,an renamed "mongoose2" , so they can provide two datasource.
* is there any other way ? help...
*/
// call zip before send buff
var zlib = require('zlib');
var clientState = {};
// net
var net = require("net")
	,sys = require("sys");
var config = require("./server.config") || {};
var PORT = config.port || 8081;
var HOST = config.host || "127.0.0.1";
var KEYS = config.keys || [];
var MAXSYNCPER = config.max_sync_count_per || 100;
var SERVER_CLUSTER = config.server_clusters_info || "";
var LOOPTIME = config.loop_time || 1;//unit(sec)
// mongodb
var oplog = require("./model/oplog")
	,oplogDao = oplog.dao;
var oplogDetail = require("./model/oplogDetail")
	,oplogDetailDao = oplogDetail.dao;
var oplogRs = require("./model/oplog.rs");
oplogRs.mongoose.connectSet(SERVER_CLUSTER);
oplogRs.mongoose.model(oplogRs.modelName,oplogRs.schema,oplogRs.collName);
var KEYSOBJ = {};//key:name,val:keyobj
for(var i=0 ; i<KEYS.length ; i++){
	var tmp = KEYS[i];
	KEYSOBJ[tmp.name  + "-" + tmp.key] = tmp;
}
// registed clientObjects
var regClientObj = {};
var regClientKeyObj = {};
var regClientLastFlag = {};

var debugFlag = false;
function debugs(){
	if(debugFlag){
		console.log("debug >>>");
		console.log(arguments);
	}
}

//create server
var server = net.createServer(function(c){
	c.setEncoding("utf8");
	c.bufferSize = 16;
	c.on("connect",function(){
		console.log("client %s:%s connected, waiting for registe secrue key ..." , c.remoteAddress , c.remotePort);
	});
	c.on("data",function(data){
		//type: {1:secrue,2:msg,3:syncInfo},info:{}
		var result = eval("(" + data + ")");
		var secrue = result.info;
		var key = secrue.name + "-" + secrue.key;
		console.log("client \"" + key + "\" say :\n " + data);
		var syncCount = result.syncCount;
		// first time ,register
		if(result.type == 1){
			if(!KEYSOBJ[key]){//secrue key error
				c.destroy();
				console.log("client %s:%s not allow connect, it's without secrue key ..." , c.remoteAddress , c.remotePort);
			}else if (regClientObj[key]){//secrue key used
				c.destroy();
				console.log("client %s:%s not allow connect, secrue key is in used ..." , c.remoteAddress , c.remotePort);
			}else{
				regClientObj[key] = c;
				regClientKeyObj[genderIPKey(c)] = key;
				clientState[key] = "wait for sync";
				console.log("client %s:%s allow connect ..." , c.remoteAddress , c.remotePort);
			}
		}
		// after synced info
		if(result.type == 3){
			var state = result.state;
			if(state == 0){
				clientState[key] = "wait for sync";
				var unExcutedArr = result.unExcutedArr;
				// resize synced size
				oplogDao.update({"cluster_name" : key}, {$inc:{last_flag:syncCount}}, function(err, numAffected){
					if(!err){
						var dao = new oplogDetailDao();
						dao.cluster_name = key;
						dao.update_time = new Date();	
						dao.server_oplog_index_from = parseInt(regClientLastFlag[key]);
						dao.server_oplog_index_to = dao.server_oplog_index_from + syncCount;
						dao.client_oplog_update_count = syncCount - unExcutedArr.length;
						dao.client_oplog_error_array = JSON.stringify(unExcutedArr);
						debugs(dao.cluster_name + ":" + dao.update_time + ":" + dao.server_oplog_index_from + ":" + dao.server_oplog_index_to + ":" + dao.client_oplog_update_count);
						dao.save(function(err){
							if(!err){//null
								debugs("oplogdetail is sited");
								clientState[key] = "wait for sync";
							}
						});
					}
				});
			}
		}
	});
	c.on("end",function(){
		// reset key in regClientObj to null
		regClientObj[regClientKeyObj[genderIPKey(c)]] = null;
		regClientKeyObj[genderIPKey(c)] = null;
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
/**
* add dbName to configued cluster_info,for example
* clusterInfo --> mongodb://127.0.0.1:27017/,mongodb://127.0.0.1:27018/ 
* dbName --> local
* return mongodb://127.0.0.1:27017/local,mongodb://127.0.0.1:27018/local
*/
function addDbToClustersinfo(dbName,clusterInfo){
	return (clusterInfo + dbName).replace(/,/gim , dbName + ",");
}

/**
* looping for sync mongodb
*/
function syncMongodb(){
	for(var k in regClientObj){
		if(regClientObj[k] != null){
			console.log(clientState[k]);
			if(clientState[k] === "wait for sync"){
				oplogDao.find({"cluster_name" : k},null,function(err,data){
					if(!err){
						var isNew = false;
						var dao = new oplogDao();
						if(data.length == 0){
							dao.cluster_name = k;
							dao.last_flag = 0;	
							isNew = true;
						}
						if(data.length > 0){
							data = data[0];
						}
						dao.cluster_ischanged = false;
						dao._id = data._id;
						if(isNew){
							dao.save(function(err){
								if(!err){//null
									regClientLastFlag[k] = 0;
									startSync(k , dao.last_flag);
								}
							});
						}else{
							oplogDao.update({_id:dao._id},{cluster_ischanged : false},function(err, numAffected){
								if(!err){//null:0
									regClientLastFlag[k] = data.last_flag;
									startSync(k , dao.last_flag);
								}
							});
						}
					}
				});
			}else{
				console.log(k + " not synced , loop it next time ....");
			}
		}
	}
}
/**
* start sync with cluster_name
*/
function startSync(cluster_name,last_flag){
	var oplogRsDao = oplogRs.mongoose.model(oplogRs.modelName,oplogRs.collName);
	var last_flag = regClientLastFlag[cluster_name];
	clientState[cluster_name] = "syncing";	
	debugs(MAXSYNCPER + ":" + last_flag);
	oplogRsDao.find(null , null , {limit : MAXSYNCPER , skip : last_flag} , function(err,data){
		clientState[cluster_name] = "wait for sync";
		if(!err){
			// because of replica set:
			// i need to disconnect every time ,otherwise , it will throw exception
			// Error: db object already connecting, open cannot be called multiple times
			// at Db.open (/cygdrive/e/nodespace/sync-mongodb-cluster/node_modules/mongoose...
			if(data.length > 0){
				var result = {type:3,info:data};
				sendData(JSON.stringify(result) , regClientObj[cluster_name] , cluster_name);
			}else{
				clientState[cluster_name] === "wait for sync";
				
				console.log("client \"%s\"  synced all info over ,wait for next change ...", cluster_name);
			}
		}
	});

}
/**
* zip buffer before send to client
*/
function sendData(str,client,cluster_name){
	var buff = new Buffer(str + "\\0", 'utf8');
	zlib.gzip(buff, function(err, buffer) {
		if (!err) {
			console.log("before zip size : %s , after zip size : %s" , buff.length , buffer.length);
			//console.log(str);
			try{
				client.write(buffer);
			}catch(e){
				//TODO 这里要处理socke断掉的问题
				console.log(e);
				regClientObj[cluster_name] = null;
			}
		}
	});
}