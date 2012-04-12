/**
* configure server
* @port server socket port
* @host server socket host
* @loop_time how many seconds to loop sync once time
* @max_sync_count_per how many records can loop sync once time
* @keys idcards info configure for every allowed client
* @server_clusters_info the clusters info of the server
* @server_db_info mongodb info that record the synced client info
*
*/
module.exports = {
	port : 8081,
	host : "127.0.0.1",
	loop_time : 5,
	max_sync_count_per : 3,
	keys : [
			{name : "ty2" , key : "1234567890ty2" , cluster_info : "mongodb://127.0.0.1:47017/test,mongodb://127.0.0.1:47018/test,mongodb://127.0.0.1:47019/test"},
			{name : "sh" , key : "9876543210sh"}
			],
	server_clusters_info : "mongodb://127.0.0.1:47011/local,mongodb://127.0.0.1:47012/local",
	server_db_info : "mongodb://127.0.0.1:47020/node",
	sync_db_namespace : ""
};