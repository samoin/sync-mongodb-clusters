module.exports = {
	port : 8081,
	host : "127.0.0.1",
	loop_time : 5,
	max_sync_count_per : 100,
	keys : [
			{name : "ty1" , key : "1234567890ty1" , cluster_info : "mongodb://127.0.0.1:47011/,mongodb://127.0.0.1:47012/"},
			{name : "ty2" , key : "1234567890ty2" , cluster_info : "mongodb://127.0.0.1:47017/,mongodb://127.0.0.1:47018/,mongodb://127.0.0.1:47019/"},
			{name : "sh" , key : "9876543210sh"}
			]
};