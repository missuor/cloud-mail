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
	ADMIN_ROLE: {
		name: 'admin',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0
	}
}

export default constant
