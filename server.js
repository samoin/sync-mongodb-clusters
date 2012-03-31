var net = require("net")
	,sys = require("sys");
var config = require("./server.config");
var PORT = config.port || 8081;
var HOST = config.host || "127.0.0.1";
var KEYS = config.keys || [];
//key:name,val:keyobj
var KEYSOBJ = {};
for(var i=0 ; i<KEYS.length ; i++){
	var tmp = KEYS[i];
	KEYSOBJ[tmp.name  + "-" + tmp.key] = tmp;
}
// all clients
var CLIENTS = [];
// registed clientObjects
var regClientObj = {};
//create server
var server = net.createServer(function(c){
	c.setEncoding("utf8");
	c.bufferSize = 16;

	c.on("connect",function(){
		
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
				CLIENTS.push(c);
				for(var k in regClientObj){
					regClientObj[k].write("client " + c.remoteAddress + ":" + c.remotePort + " connected\0");
				}
				console.log("client %s:%s allow connect ..." , c.remoteAddress , c.remotePort);
			}
		}
		//c.write("data:" + data + "\0");
	});

	c.on("end",function(){
		console.log("server disconnected");
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