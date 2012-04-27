/**
* configure server
* @port server socket port
* @host server socket host
* @loop_time how many seconds to loop sync once time
* @max_sync_count_per how many records can loop sync once time
* @info_limit_size if data is more than this bytes,it will ziped
* @max_fail_times if data is errored more than this ,it will mail to alert
* @keys idcards info configure for every allowed client
* @mailer configue mail 
* @server_clusters_info the clusters info of the server
* @server_db_info mongodb info that record the synced client info
*
*/
module.exports = {
	port : 8081,
	host : "172.16.9.117",
	loop_time : 1,
	max_sync_count_per : 100,
	info_limit_size : 128,
	max_fail_times : 3,
	keys : [
			{name : "ty2" , key : "1234567890ty2"},
			{name : "sh" , key : "9876543210sh"}
			],
	mailer : {
		host : "mail.sohu.com",
		domain : "sohu.com",
		port : "25",
		from : "jrjcErrorSender@sohu.com",
		to : "jrjcErrorSender@sohu.com",
		passport : "jrjcErrorSender",
		password : "1234567890"
		},
	server_clusters_info : "mongodb://172.16.9.117:47011,172.16.9.117:47012",
	server_db_info : "mongodb://172.16.9.117:47020/node"
};