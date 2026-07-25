import BizError from '../error/biz-error';
import constant from '../const/constant';
import { isWeakPassword } from '../const/weak-password';
import { t } from '../i18n/i18n.js';

// 口令强度校验。凡是设置/修改口令的入口都要过这里：注册、自助改密、
// 管理员重置他人口令、管理员建户、开放 API 批量建户。
// 只作用于「新设置的口令」，存量用户不受影响，直到他们下次改密
const pwdPolicy = {

	// 有效长度：非 ASCII 字符按 2 个算。
	// 常用汉字约 3500 个、每字约 11.8 bit，而 ASCII 可打印字符约 94 个、每字约
	// 6.55 bit，比值约 1.8，取 2 是保守的。不这样算的话，「我的密码很安全啊」
	// 这种 8 字中文口令（约 94 bit，远强于 10 位 ASCII 的 65 bit）会被下限误拒，
	// 而本项目的主要用户就是中文用户。
	// 同时保留一个码点数下限，防止靠掺一个汉字把短口令抬过线（如「密a1234」）
	effectiveLength(value) {
		let length = 0;

		for (const ch of value) {
			length += ch.codePointAt(0) > 0x7f ? 2 : 1;
		}

		return length;
	},

	assertStrong(password) {

		const value = String(password ?? '');
		const codePoints = [...value].length;

		if (this.effectiveLength(value) < constant.PWD_MIN_LENGTH
			|| codePoints < constant.PWD_MIN_CODE_POINTS) {
			throw new BizError(t('pwdMinLength', { msg: constant.PWD_MIN_LENGTH }));
		}

		// 光有长度挡不住字典攻击：password123 正好 11 位也能过
		if (isWeakPassword(value)) {
			throw new BizError(t('pwdTooCommon'));
		}
	}

};

export default pwdPolicy;
