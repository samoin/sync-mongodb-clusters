/**
* configure client
* @server_port server socket port
* @server_host server socket host
* @start_from_local_oplog_ts whether start from local oplog flag, if you just copyed db ,site false here ,otherwise site true
* @cluster_info cluster info
* @secure_key  idcard info configure 
* @sync_db_namespace the namespace of what need to sync , if want sync all , site empty string("") here ,if want sync servral , split it with ","
*
*/
module.exports = {
	server_port : 8081,
	server_host : "127.0.0.1",
	start_from_local_oplog_ts : false,
	cluster_info : "mongodb://172.16.9.117:47017,172.16.9.117:47018,172.16.9.117:47019",//
	secure_key : {name : "ty2" , key : "1234567890ty2"},
	sync_db_namespace : ""
};