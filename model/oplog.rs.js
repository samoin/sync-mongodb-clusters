var mongodb = require('mongodb');
var config = require("../server.config");
var server_clusters_info = config.server_clusters_info || "";
var conn;
var coll;
// console color
var colors = require('mailer/node_modules/colors');
mongodb.Db.connect(server_clusters_info,function(err, con) {
	if(!err){
		conn = con;
		conn.databaseName = "local";
		console.log(colors.magenta("server cluster connection inited ...."));
		conn.collection("oplog.rs", function(err2, col) {
			if(!err2){
				coll = col;
				console.log(colors.magenta("server cluster - collection(oplog.rs) inited ...."));
			}
		});
	}
});


exports.getConn = function(){
	return conn;
}

exports.getColl = function(){
	return coll;
}