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
var common_code = "utf8";
var config = require("./server.config") || {};
var PORT = config.port || 8081;
var HOST = config.host || "127.0.0.1";
var KEYS = config.keys || [];
var info_limit_size = config.info_limit_size || 1024;
var MAXSYNCPER = config.max_sync_count_per || 100;
var SERVER_CLUSTER = config.server_clusters_info || "";
var LOOPTIME = config.loop_time || 1;//unit(sec)
var info_end_split_key = config.info_end_split_key || "\\0";
var info_type_split_key = config.info_type_split_key || "\\0";
// mongodb
var oplog = require("./model/oplog")
	,oplogDao = oplog.dao;
var oplogDetail = require("./model/oplogDetail")
	,oplogDetailDao = oplogDetail.dao;
var oplogRs = require("./model/oplog.rs");
var KEYSOBJ = {};//key:name,val:keyobj
for(var i=0 ; i<KEYS.length ; i++){
	var tmp = KEYS[i];
	KEYSOBJ[tmp.name  + "-" + tmp.key] = tmp;
}
// registed clientObjects
var regClientObj = {};
var regClientKeyObj = {};
var regClientLastFlag = {};
var regClientZipInfo = {};

var debugFlag = false;
function debugs(){
	if(debugFlag){
		console.log("debug >>>");
		console.log(arguments);
	}
}
/**
* add listener to catch uncaughtException , as socket error

process.on('uncaughtException', function (err) {
 console.log('Caught exception: ' + err);
});
*/
function solveInfo(data,c){
	//type: {1:secrue,2:msg,3:syncInfo,4:client synced,5:askSecrue},info:{}
	var result = eval("(" + data + ")");
	var secrue = result.info;
	var key = secrue.name + "-" + secrue.key;
	//console.log("client \"" + key + "\" say :\n " + data);
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
				if(c){
					regClientKeyObj[genderIPKey(c)] = key;
					console.log("client %s:%s allow connect ..." , c.remoteAddress , c.remotePort);
				}
				clientState[key] = "wait for sync";
		}
	}
	// after synced info
	if(result.type == 4){
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
					var zipInfo = regClientZipInfo[key];
					if(zipInfo){
						dao.before_zip = zipInfo.before;
						dao.after_zip = zipInfo.after;
					}
					//debugs(dao.cluster_name + ":" + dao.update_time + ":" + dao.server_oplog_index_from + ":" + dao.server_oplog_index_to + ":" + dao.client_oplog_update_count);
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
}
//create server
var server = net.createServer(function(c){
	c.setEncoding(common_code);
	c.bufferSize = 16;
	c.on("connect",function(){
		console.log("client %s:%s connected, waiting for registe secrue key ..." , c.remoteAddress , c.remotePort);
		sendData("{type:5}",c);
	});
	c.on("data",function(data){
		if(!Buffer.isBuffer(data)){
			data = new Buffer(data,common_code);
		}
		var typeBuff = data.slice(0,type_len);
		lastType = typeBuff.toString(common_code,0,typeBuff.length);
		// i always get info that client send to server,so strange,here need to solve
		var	infoLenBuff = data.slice(type_len,base_info_len);
		infoLen = Number(infoLenBuff.toString(common_code,0,infoLenBuff.length));
		var infoBuff = data.slice(base_info_len,base_info_len + infoLen);
		if(lastType == type_zip){
			zlib.gunzip(infoBuff, function(err, buffer) {
				if (!err) {
					var info = buffer.toString(common_code,0,buffer.legnth);
					solveInfo(info,c);
				}else{
					console.log(err);
				}
			});
		}
		if(lastType == type_normal){
			var info = infoBuff.toString(common_code,0,infoBuff.length);
			solveInfo(info,c);
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
	if(coll){
		console.log("connection initing....");
		return;
	}
	var coll = oplogRs.getColl();
	var last_flag = regClientLastFlag[cluster_name];
	clientState[cluster_name] = "syncing";	
	debugs(MAXSYNCPER + ":" + last_flag);
	coll.find().limit(MAXSYNCPER).skip(last_flag).toArray(function(err, data) {
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
/**
* zip buffer before send to client
*/
function sendData(str,client,cluster_name){
	var buff = new Buffer(str, 'utf8');
	if(buff.length > info_limit_size){
		zlib.gzip(buff, function(err, buffer) {
			if (!err) {
				sendData2(str,client,cluster_name,buff,buffer,type_zip);
			}
		});
	}else{
		sendData2(str,client,cluster_name,buff,buff,type_normal);
	}
}
function sendData2(str,client,cluster_name,buff,buffer,type){
	console.log("before zip size : %s , after zip size : %s" , buff.length , buffer.length);
	var msgInfo = type + "" + getLen(buffer,type == type_normal?str.length:null);
	var tmp = new Buffer(msgInfo, common_code);
	if(cluster_name){
		regClientZipInfo[cluster_name] = {before : buff.length , after : buffer.length };
	}
	// i don't know why :
	// from client when i sendData to server as Buffer , i't can't reach , but client get this message ,
	// but if change this to String , server can get it , strange...
	// maybe client is disconnected here , have to solve this problem
	if(type === type_normal){
		client.write(msgInfo + str);
	}else{
		client.write(tmp);
		client.write(buffer);
	}
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