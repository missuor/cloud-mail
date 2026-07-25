const constant = {
	TOKEN_HEADER: 'Authorization',
	JWT_UID: 'user_id:',
	JWT_TOKEN: 'token:',
	TOKEN_EXPIRE: 60 * 60 * 24 * 30,
	ATTACHMENT_PREFIX: 'attachments/',
	BACKGROUND_PREFIX: 'static/background/',
	// 登录防爆破：失败次数在窗口内累计，达到 VERIFY 要求人机验证，达到 LOCK 直接拒绝。
	// 两个维度的硬锁阈值不同：
	// - 账号维度归一化后攻击者换不掉 key，是精确信号，30 次足够；
	// - IP 维度是粗粒度的共享标识，公司 NAT / 校园网 / CGNAT 后面几十上百人共用一个
	//   出口，15 分钟内自然产生几十次失败（记错密码、客户端拿过期 token 反复重试）
	//   毫不稀奇，阈值定低了不用攻击者就能自己把自己锁掉。
	LOGIN_FAIL_WINDOW_MINUTE: 15,
	LOGIN_VERIFY_COUNT_IP: 20,
	LOGIN_VERIFY_COUNT_ACCOUNT: 5,
	LOGIN_LOCK_COUNT_IP: 100,
	LOGIN_LOCK_COUNT_ACCOUNT: 30,
	// 口令最小长度。6 位小写+数字在当前迭代数下单张 4090 约 5.5 小时可破，
	// 10 位同字符集约 800 年——这个杠杆比在 CPU 预算里抠迭代次数大得多
	PWD_MIN_LENGTH: 10,
	// 码点数下限：防止靠掺一个汉字把短口令抬过有效长度线（如「密a1234」）
	PWD_MIN_CODE_POINTS: 6,
	// PBKDF2-HMAC-SHA256 的迭代次数。默认值受 Workers 免费版每请求 10ms CPU
	// 上限约束（实测 5 万次约 5.2ms，10 万次已 10.6ms 会直接超限）。
	// 付费部署可用 pwd_iterations 变量调高，OWASP 对 PBKDF2-SHA256 建议 60 万
	PWD_ITERATIONS: 50000,
	PWD_ITERATIONS_MIN: 1000,
	// 上限。1e9 这种误配不会报错，只会闷头算约 110 秒 CPU，连付费版默认 30s 都超；
	// 100 万约合 110ms，付费版跑得动，免费版本来也不该调这个值
	PWD_ITERATIONS_MAX: 1000000,
	// 批量建户的单批上限。每个用户要算一次 PBKDF2，是纯 CPU 开销：
	// 50000 迭代下实测每个约 5ms，100 个约 542ms。付费版 30s 上限下绰绰有余，
	// 但免费版每请求只有 10ms，实际上只够 1 个——这个接口需要付费版
	ADD_USER_BATCH_LIMIT: 100,
	// 单次批量删除邮箱的上限。id 走 query 传递，太多会顶到 URL 长度限制。
	// 前端一次性发全部选中项、不分批：分批会破坏「全有或全无」（前面的批次已删、
	// 后面的批次失败），超限时后端返回带上限值的提示，勾选保留可直接重试
	ACCOUNT_BATCH_DELETE_LIMIT: 100,
	ADMIN_ROLE: {
		name: 'admin',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0
	}
}

export default constant
