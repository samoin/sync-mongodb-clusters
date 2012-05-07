/** that seems mongoose don't suport more than one datasource,
* so i used "mongo" , so they can provide two datasource.
* is there any other way ? help...
*/
var zlib = require('zlib');
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
var LOOPTIME = config.loop_time || 2;//unit(sec)
var maxFailed = config.max_fail_times || 10;

var mailer = config.mailer || {};
var email = require("mailer/lib/node_mailer");

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
var clientState = {};
var regClientObj = {};
var regClientKeyObj = {};
var regClientFromFlag = {};
var regClientToFlag = {};
var regClientZipInfo = {};
var regClientStartFlag = {};
var regFailedTimeFlag = {};

// console color
var colors = require('mailer/node_modules/colors');


/**
* add listener to catch uncaughtException , as socket error

process.on('uncaughtException', function (err) {
 console.log('Caught exception: ' + err);
});
*/
/**
* sendMail
*/
function sendMail(toMail,subject,tempName,data){
	email.send({
      host : mailer.host,               // smtp server hostname
      port : mailer.port,                     // smtp server port
      domain : mailer.domain,             // domain used by client to identify itself to server
      to : toMail,
      from : mailer.from,
      subject : subject,
      template : tempName + "",   // path to template name
      data : data,
      authentication : "login",        // auth login is supported; anything else is no auth
      username : mailer.passport,        // username
      password : mailer.password         // password
    },
    function(err, result){
      if(err){ 
       console.error(colors.red("[mailer] : failed with sending mail from : %s  to : %s, it will sended later...\n error is " + err , mailer.from , toMail));
      } else {
        console.log(colors.green("[mailer] : mail sended ,state ok ,from : %s ,to : %s", mailer.from,toMail));
      }
    });
}

function solveInfo(data,c){
	//type: {1:secrue,2:msg,3:syncInfo,4:client synced,5:askSecrue},info:{}
	var result = eval("(" + data + ")");
	var secrue = result.info;
	var key = secrue.name + "-" + secrue.key;
	var syncCount = result.syncCount;
	// first time ,register
	if(result.type == 1){
		var remoteAddress = c.remoteAddress;
		var remotePort = c.remotePort;
		if(!KEYSOBJ[key]){//secrue key error
			c.destroy();
			console.log(colors.red("client %s:%s not allow connect, it's without secrue key ...") , remoteAddress , remotePort);
		}else if (regClientObj[key]){//secrue key used
			c.destroy();
			console.log(colors.red("client %s:%s not allow connect, secrue key is in used ...") , remoteAddress , remotePort);
		}else{
			regClientStartFlag[key] = result.ts;
			regClientObj[key] = c;
			if(c){
				regClientKeyObj[genderIPKey(c)] = key;
				console.log(colors.green("client %s:%s[%s] allow connect ...") , remoteAddress , remotePort , key);
			}
			clientState[key] = "wait for sync";
		}
	}
	// after synced info
	if(result.type == 4){
		var state = result.state;
		if(state == 0){
			regFailedTimeFlag[key] = 0;
			var unExcutedArr = result.unExcutedArr;
			var errArr = result.errArr;
			// resize synced size
			oplogDao.update({"cluster_name" : key}, {$set:{last_flag : regClientToFlag[key]}}, function(err, numAffected){
				if(!err){
					var dao = new oplogDetailDao();
					dao.cluster_name = key;
					dao.update_time = new Date();	
					dao.server_oplog_ts_from = regClientFromFlag[key];
					dao.server_oplog_ts_to = regClientToFlag[key];
					dao.client_oplog_update_count = syncCount - unExcutedArr.length;
					dao.client_oplog_unExcuteError_array = JSON.stringify(unExcutedArr);
					dao.client_oplog_error_array = JSON.stringify(errArr);
					var zipInfo = regClientZipInfo[key];
					if(zipInfo){
						dao.before_zip = zipInfo.before;
						dao.after_zip = zipInfo.after;
					}
					dao.save(function(err){
						if(!err){//null
							regClientFromFlag[key] = regClientToFlag[key];
							clientState[key] = "wait for sync";
						}
					});
				}
			});
		}else{
			if(!regFailedTimeFlag[key]){
				regFailedTimeFlag[key] = 0;
			}
			regFailedTimeFlag[key] = regFailedTimeFlag[key] + 1;
			if(regFailedTimeFlag[key] >= maxFailed){
				// mail to user
				sendMail(mailer.to,"sync-error: key >> " + key , __dirname + "/templates/sync-error-html.txt" , {key:key,data:data});
			}
			clientState[key] = "wait for sync";
		}
	}
}
//create server
var server ;
var intervals;
function createServers(){
	server = net.createServer(function(c){
		c.setEncoding(common_code);
		c.bufferSize = 16 * 1024;
		c.on("connect",function(){
			console.log(colors.green("client %s:%s connected, waiting for registe secrue key ...") , c.remoteAddress , c.remotePort);
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
			console.log(colors.red("server disconnected %s:%s") , c.remoteAddress , c.remotePort);
		});
		/**c.on("drain", function(){
			console.log("drain %s",genderIPKey(c));
		});*/
		c.on("close",function(){
			var ipKey = c._peername.address + ":" + c._peername.port;
			console.log(colors.red("client %s(ip:%s) disconnected, removed it from loop") , regClientKeyObj[ipKey],ipKey);
			regClientObj[regClientKeyObj[ipKey]] = null;
			regClientKeyObj[ipKey] = null;		
		});
		c.on("error",function(e){
			console.log(colors.red("error: %s ") , e );
		});
		c.pipe(c);
		console.log(colors.green("server connected"));
	});
	//listen server
	server.listen(PORT , HOST , function(){	
		if((keysLen = KEYS.length) == 0){
			console.log(colors.red("\nsync without key register ..."));
		}else{
			console.log(colors.green("\nsync with key register , allow %s clients ...") , keysLen);
		}
	});
	//create interval ,looping mongodb every n second
	intervals = setInterval(syncMongodb , LOOPTIME * 1000);
}

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
	var index = 0;
	for(k in regClientObj){
		if(regClientObj[k] != null){
			if(regFailedTimeFlag[k] >= maxFailed){
				//console.log("index >> %s [%s]  same records errored more than %sth times ,no more result send ,this sync stopped , a mail has sended..." , index , k , regFailedTimeFlag[k]);
				continue;
			}
			if(clientState[k] == "wait for sync"){
				changeOplogInfo(k);
			}else{
				console.log(colors.grey("index >> %s [%s] not synced , loop it next time ....") , index , k);
			}
		}
		index++;
	}
}

function changeOplogInfo(k){
	oplogDao.find({"cluster_name" : k},null,function(err,data){
		if(!err){
			var clientStartFlag = regClientStartFlag[k];
			var isClientStartFlagEmpty = clientStartFlag && clientStartFlag != "";
			if(isClientStartFlagEmpty){
				console.log(colors.green("client %s ask to sync from %s") , k , clientStartFlag);
			}
			var isNew = false;
			var dao = new oplogDao();
			if(data.length == 0){
				dao.cluster_name = k;
				dao.last_flag = (isClientStartFlagEmpty ? clientStartFlag : "0");	
				isNew = true;
			}else{
				data = data[0];
			}
			dao.cluster_ischanged = false;
			dao._id = data._id;
			if(isNew){
				dao.save(function(err){
					if(!err){//null
						startSync(k , dao.last_flag);
						regClientStartFlag[k] = null;
					}
				});
			}else{
				oplogDao.update({_id:dao._id},{cluster_ischanged : false},function(err, numAffected){
					if(!err){//null:0
						startSync(k , isClientStartFlagEmpty? clientStartFlag : data.last_flag);
						regClientStartFlag[k] = null;
					}
				});
			}
			
		}
	});
}
var Timestamp = require('mongodb').Timestamp;
/**
* start sync with cluster_name
*/
function startSync(cluster_name,last_flag){
	clientState[cluster_name] = "syncing";	
	regClientFromFlag[cluster_name] = last_flag;
	if(coll){
		console.log(colors.green("connection initing...."));
		return;
	}
	var coll = oplogRs.getColl();

	coll.find({ts : {$gt : Timestamp.fromString(last_flag)}}).sort({ts : 1}).limit(MAXSYNCPER).toArray(function(err, data) {
		if(!err){
			var dataLen = data.length;
			if(dataLen > 0){
				regClientFromFlag[cluster_name] = data[0].ts.toString();
				regClientToFlag[cluster_name] = data[dataLen - 1].ts.toString();
				console.log(colors.green("get oplog for %s from %s to %s") , cluster_name,regClientFromFlag[cluster_name],regClientToFlag[cluster_name]);
				var result = {type:3,info:data};
				console.log(colors.green("sending sync info to client \"%s\""),cluster_name);
				sendData(JSON.stringify(result) , regClientObj[cluster_name] , cluster_name);
			}else{
				clientState[cluster_name] = "wait for sync";
				console.log(colors.cyan("client \"%s\"  synced all info over ,wait for next change ..."), cluster_name);
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
	var buff = new Buffer(str, common_code);
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
	console.log(colors.green("send to %s, before zip size : %s , after zip size : %s") , cluster_name , buff.length , buffer.length);
	var msgInfo = type + "" + getLen(buffer,type == type_normal?str.length:null);
	var tmp = new Buffer(msgInfo, common_code);
	if(cluster_name){
		regClientZipInfo[cluster_name] = {before : buff.length , after : buffer.length };
	}
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

var cluster = require('cluster');
if (cluster.isMaster) {
	cluster.fork();
	cluster.on('death', function(worker) {
		console.log(colors.red('worker ' + worker.pid + ' died , restarting ...'));
		cluster.fork();
	});
} else {
	createServers();
}
