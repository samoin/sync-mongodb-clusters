var mongodb = require('mongodb');
var config = require("../server.config");
var server_clusters_info = config.server_clusters_info || "";
var conn;
var coll;
mongodb.Db.connect(server_clusters_info,function(err, con) {
	if(!err){
		conn = con;
		conn.databaseName = "local";
		console.log("server cluster connection inited ....");
		conn.collection("oplog.rs", function(err2, col) {
			if(!err2){
				coll = col;
				console.log("server cluster - collection(oplog.rs) inited ....");
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