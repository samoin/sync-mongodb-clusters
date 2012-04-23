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
	loop_time : 1,
	max_sync_count_per : 100,
	info_limit_size : 128,
	keys : [
			{name : "ty2" , key : "1234567890ty2"},
			{name : "sh" , key : "9876543210sh"}
			],
	server_clusters_info : "mongodb://172.16.9.117:47011,172.16.9.117:47012",
	server_db_info : "mongodb://172.16.9.117:47020/node"
};