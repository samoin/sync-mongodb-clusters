/** that seems mongoose don't suport more than one datasource,
* so i copy mongoose ,an renamed "mongoose2" , so they can provide two datasource.
* is there any other way ? help...
*/
var net = require("net")
	,sys = require("sys");
var config = require("./server.config") || {};
var PORT = config.port || 8081;
var HOST = config.host || "127.0.0.1";
var KEYS = config.keys || [];
var MAXSYNCPER = config.max_sync_count_per || 100;
var SERVER_CLUSTER = config.server_clusters_info || "";
var LOOPTIME = config.loop_time || 1;//unit(sec)
var oplog = require("./model/oplog")
	,oplogDao = oplog.dao;
var oplogRs = require("./model/oplog.rs");
oplogRs.mongoose.connectSet(SERVER_CLUSTER);
oplogRs.mongoose.model(oplogRs.modelName,oplogRs.schema,oplogRs.collName);
//key:name,val:keyobj
var KEYSOBJ = {};
for(var i=0 ; i<KEYS.length ; i++){
	var tmp = KEYS[i];
	KEYSOBJ[tmp.name  + "-" + tmp.key] = tmp;
}
// registed clientObjects
var regClientObj = {};
var regClientKeyObj = {};
// call zip before send buff
var zlib = require('zlib');
var clientState = {};


//create server
var server = net.createServer(function(c){
	c.setEncoding("utf8");
	c.bufferSize = 16;

	c.on("connect",function(){
		console.log("client %s:%s connected, waiting for registe secrue key ..." , c.remoteAddress , c.remotePort);
	});

	c.on("data",function(data){
		console.log(data);
		//type: {1:secrue,2:msg,3:syncInfo},info:{}
		var result = eval("(" + data + ")");
		// first time ,register
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
				clientState[key] = "wait for sync";
				//for(var k in regClientObj){
					//sendData("client " + c.remoteAddress + ":" + c.remotePort + " connected" , regClientObj[k]);
				//}
				console.log("client %s:%s allow connect ..." , c.remoteAddress , c.remotePort);
			}
		}
		// after synced info
		if(result.type == 3){
			var state = result.state;
			var secrue = result.info;
			var key = secrue.name + "-" + secrue.key;
			if(state == 0){
				clientState[key] = "wait for sync";
			}
		}
		//c.write("data:" + data + "\0");
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
			if(clientState[k] === "wait for sync"){
				oplogDao.find({"cluster_name" : k},null,function(err,data){
					if(!err){
						var isNew = false;
						var dao = new oplogDao();
						if((!data && !data.cluster_name) || data == ""){
							dao.cluster_name = k;
							dao.last_flag = 0;	
							isNew = true;
						}
						dao.cluster_ischanged = false;
						dao._id = data._id;
						
						if(isNew){
							dao.save(function(err){
								if(!err){//null
									startSync(k , dao.last_flag);
								}
							});
						}else{
							oplogDao.update({_id:dao._id},{cluster_ischanged : false},function(err, numAffected){
								if(!err){//null:0
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
	//var cluster_info = SERVER_CLUSTER;
	console.log(SERVER_CLUSTER);
	var oplogRsDao = oplogRs.mongoose.model(oplogRs.modelName,oplogRs.collName);
	/**var Timestamp = require('mongolian').Timestamp  // == Long {limit : MAXSYNCPER} {ts :  {$gt : new Timestamp(1,1333091520) }} var t = new oplogRsDao();
	t.ns = "ss";
	t.save(function(err){
		console.log(err);
	});*/
	//console.log(cluster_name + "___" + new Timestamp(1,1333091520));
	/***/
	clientState[cluster_name] = "syncing";	
	oplogRsDao.find(null , null , {limit : MAXSYNCPER , skip : last_flag} , function(err,data){
		if(!err){
			// because of replica set:
			// i need to disconnect every time ,otherwise , it will throw exception
			// Error: db object already connecting, open cannot be called multiple times
			// at Db.open (/cygdrive/e/nodespace/sync-mongodb-cluster/node_modules/mongoose...
			var result = {type:3,info:data};//JSON.stringify(result) + "\\0"
			//var buff = new Buffer(str+ "\\0", 'utf8');
			
			
			sendData(JSON.stringify(result) , regClientObj[cluster_name] , cluster_name);
			//var buff = new Buffer(JSON.stringify(result)+ "\\0", 'utf8');
			//console.log( buff.length + ":" + JSON.stringify(result).length);
			//regClientObj[cluster_name].write(buff);
			//regClientObj[cluster_name].write("\0");
			//console.log(result);
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
/**
			var fs = require('fs');
			var fileName = "./tmp/" + cluster_name + ".record";
			var zipFileName = fileName + ".zip";
			var gzip = zlib.createGzip();
			fs.writeFile(zipFileName , buffer , function(err){
				if(!err){
					console.log("ok");
					//inp.pipe(gzip).pipe(out);
				}
			});*/