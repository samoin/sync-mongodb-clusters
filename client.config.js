/**
* configure client
* @server_port server socket port
* @server_host server socket host
* @secure_key  idcard info configure 
* @sync_db_namespace the namespace of what need to sync , if want sync all , site empty string("") here ,if want sync servral , split it with ","
*
*/
module.exports = {
	server_port : 8081,
	server_host : "127.0.0.1",
	secure_key : {name : "ty2" , key : "1234567890ty2"}
};