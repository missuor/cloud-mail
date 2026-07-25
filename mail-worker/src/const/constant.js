const constant = {
	TOKEN_HEADER: 'Authorization',
	JWT_UID: 'user_id:',
	JWT_TOKEN: 'token:',
	TOKEN_EXPIRE: 60 * 60 * 24 * 30,
	ATTACHMENT_PREFIX: 'attachments/',
	BACKGROUND_PREFIX: 'static/background/',
	// 登录防爆破：失败次数在窗口内累计，达到 VERIFY 要求人机验证，达到 LOCK 直接拒绝
	LOGIN_FAIL_WINDOW_MINUTE: 15,
	LOGIN_VERIFY_COUNT: 5,
	LOGIN_LOCK_COUNT: 30,
	ADMIN_ROLE: {
		name: 'admin',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0
	}
}

export default constant
