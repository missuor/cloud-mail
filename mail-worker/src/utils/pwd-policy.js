import BizError from '../error/biz-error';
import constant from '../const/constant';
import { isWeakPassword, stripFormatChars } from '../const/weak-password';
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
	rawEffectiveLength(value) {
		let length = 0;

		for (const ch of value) {
			length += ch.codePointAt(0) > 0x7f ? 2 : 1;
		}

		return length;
	},

	// 两个度量都取「归一化前」与「归一化后」的较小值。
	//
	// 归一化在这里的目的是防规避——全角、零宽都会让长度变小，取 min 保留了这个
	// 收益。而展开是唯一让长度变大的方向，全都被 min 挡掉：先归一化再拿结果测长
	// 的话，任何让码点变多的归一化路径都能被用来凑长度。NFKC 的兼容性展开
	// （㍿ -> 株式会社、ﷺ -> 18 码点）只是最显眼的一种，NFC 对 Unicode 组合
	// 排除表里的字符（如 U+0958）同样会拆开且不再合回去，5 次按键能撑到 10 码点。
	// 取 min 一次堵死整类，不必逐个 Unicode 特性打补丁。
	measure(password) {
		const raw = stripFormatChars(password);
		const nfc = raw.normalize('NFC');

		return {
			effectiveLength: Math.min(this.rawEffectiveLength(raw), this.rawEffectiveLength(nfc)),
			codePoints: Math.min([...raw].length, [...nfc].length)
		};
	},

	assertStrong(password) {

		const { effectiveLength, codePoints } = this.measure(password);

		if (effectiveLength < constant.PWD_MIN_LENGTH || codePoints < constant.PWD_MIN_CODE_POINTS) {
			throw new BizError(t('pwdMinLength', { msg: constant.PWD_MIN_LENGTH }));
		}

		// 光有长度挡不住字典攻击：password123 正好 11 位也能过
		if (isWeakPassword(password)) {
			throw new BizError(t('pwdTooCommon'));
		}
	}

};

export default pwdPolicy;
