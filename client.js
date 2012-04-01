var net = require("net");
var config = require("./client.config");
var PORT = config.server_port || 8081;
var HOST = config.server_host || "127.0.0.1";
var KEY = config.secure_key || {};
var client = new net.Socket();
client.connect(PORT , HOST , function(){
	console.log("client connected to server %s:%s" , HOST , PORT);
	//send secure info
	client.write('{type:1,info:' + JSON.stringify(KEY) + '}');
});
client.on("data", function(data){
	console.log(data);
	//get buff info

	//decode buff info

	//sync info
});
client.on("end", function(){
	console.log("client disconnected");
});