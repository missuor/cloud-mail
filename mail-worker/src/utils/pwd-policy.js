import BizError from '../error/biz-error';
import constant from '../const/constant';
import { isWeakPassword } from '../const/weak-password';
import { t } from '../i18n/i18n.js';

// 口令强度校验。凡是设置/修改口令的入口都要过这里：注册、自助改密、
// 管理员重置他人口令、管理员建户、开放 API 批量建户。
// 只作用于「新设置的口令」，存量用户不受影响，直到他们下次改密
const pwdPolicy = {

	assertStrong(password) {

		const value = String(password ?? '');

		if (value.length < constant.PWD_MIN_LENGTH) {
			throw new BizError(t('pwdMinLength', { msg: constant.PWD_MIN_LENGTH }));
		}

		// 光有长度挡不住字典攻击：password123 正好 11 位也能过
		if (isWeakPassword(value)) {
			throw new BizError(t('pwdTooCommon'));
		}
	}

};

export default pwdPolicy;
