import BizError from '../error/biz-error';
import constant from '../const/constant';
import reqUtils from '../utils/req-utils';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import verifyRecordService from './verify-record-service';
import { verifyRecordType } from '../const/entity-const';
import { t } from '../i18n/i18n.js';

// 口令校验的防爆破。凡是拿用户口令做校验的入口都要过这里，
// 不只是 /login —— /public/genToken 校验的还是管理员口令。
const loginLimitService = {

	// 账号维度的计数 key。查账号用的是 COLLATE NOCASE，大小写不同是同一个账号，
	// 计数 key 不归一化的话换个大小写就是一个全新的桶，等于没限流
	accountKey(email) {
		return String(email || '').trim().toLowerCase();
	},

	// 返回本次读到的两个计数，调用方可据此判断要不要做清理，省掉必然空转的写。
	// canSolveCaptcha=false 用于机器对机器的入口（开放 API）：那边是脚本在调，
	// 解不了人机验证，升级到 Turnstile 等于把人卡死且无自救路径，只对它保留硬锁
	async assertAllowed(c, email, token, canSolveCaptcha = true) {

		const ip = reqUtils.getLimitIp(c);
		const account = this.accountKey(email);

		const [ipCount, accountCount] = await Promise.all([
			verifyRecordService.loginFailCount(c, ip, verifyRecordType.LOGIN_IP),
			verifyRecordService.loginFailCount(c, account, verifyRecordType.LOGIN_ACCOUNT)
		]);

		// IP 维度硬锁：挡单机高频爆破
		if (ipCount >= constant.LOGIN_LOCK_COUNT) {
			throw new BizError(t('loginTooManyAttempts'), 429);
		}

		if (ipCount < constant.LOGIN_VERIFY_COUNT && accountCount < constant.LOGIN_VERIFY_COUNT) {
			return { ipCount, accountCount };
		}

		const { secretKey } = await settingService.query(c);

		// 解不了人机验证的调用方，与"没配 Turnstile"走同一条降级路径：只认硬锁
		if (!secretKey || !canSolveCaptcha) {
			// 降级模式：没配 Turnstile，升级不到人机验证。此时账号维度也必须能硬拦，
			// 否则攻击者换个 IP（一个 IPv6 /64 就是海量合法来源）即可无限猜同一个账号。
			// 代价是攻击者能把某个账号锁 15 分钟——两害相权，无限猜口令更糟，
			// 且锁定是有时限、自愈的
			if (accountCount >= constant.LOGIN_LOCK_COUNT) {
				throw new BizError(t('loginTooManyAttempts'), 429);
			}
			return { ipCount, accountCount };
		}

		// 过不了人机验证的请求同样是一次失败尝试，必须计数。否则计数会永远停在
		// 验证阈值上，硬锁那层根本够不着
		try {
			await turnstileService.verify(c, token);
		} catch (e) {
			await this.recordFail(c, email);
			throw e;
		}

		return { ipCount, accountCount };
	},

	async recordFail(c, email) {
		const ip = reqUtils.getLimitIp(c);
		await Promise.all([
			verifyRecordService.increaseLoginFail(c, ip, verifyRecordType.LOGIN_IP),
			verifyRecordService.increaseLoginFail(c, this.accountKey(email), verifyRecordType.LOGIN_ACCOUNT)
		]);
	},

	// 登录成功只清账号维度，绝不清 IP 维度。IP 那行的 key 是 IP、与登入哪个账号无关，
	// 一并清掉的话，攻击者只要手里有任意一个有效账号（注册开放就随手注册一个），
	// 猜几十次再登一次自己的号就能把 IP 计数清零，唯一的硬锁被架空成摆设。
	// IP 计数交给 15 分钟窗口自然过期。
	async clear(c, email) {
		await verifyRecordService.clearLoginFail(c, this.accountKey(email), verifyRecordType.LOGIN_ACCOUNT);
	}

};

export default loginLimitService;
