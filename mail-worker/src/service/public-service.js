import BizError from '../error/biz-error';
import pwdPolicy from '../utils/pwd-policy';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import loginLimitService from './login-limit-service';
import constant from '../const/constant';
import KvConst from '../const/kv-const';

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		// 每个用户要算一次 PBKDF2，是纯 CPU 开销且随批量线性增长（实测 100 个约 542ms）。
		// 免费版每请求只有 10ms CPU，这个接口本来就需要付费版；加上限是为了让超大批次
		// 得到一条明确的错误，而不是跑到一半被 CPU 限制掐断
		if (list.length > constant.ADD_USER_BATCH_LIMIT) {
			throw new BizError(t('addUserBatchLimit', { msg: constant.ADD_USER_BATCH_LIMIT }));
		}

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			// 显式提供的口令要过强度策略；自动生成的是随机 12 位，本来就够强
			if (emailRow.password) {
				pwdPolicy.assertStrong(emailRow.password);
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd(), saltHashUtils.iterations(c)
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES (?, ?, 0);`;

			userList.push(c.env.db.prepare(userSql).bind(
				email, hash, salt, type, os, browser, activeIp, activeIp, device, activeTime, activeTime
			));
			userList.push(c.env.db.prepare(accountSql).bind(email, emailUtils.getName(email)));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password, token } = params

		// 这个接口免鉴权，校验的还是管理员口令。不套限流的话，绕过登录侧的
		// 防爆破根本不用费劲，直接打这里就行。
		// 但它是开放 API、由脚本调用，解不了人机验证，所以只对它保留硬锁那层：
		// 否则同一出口 IP 下有人网页登录失败几次，管理员的自动化就被卡死且无法自救
		const limitCount = await loginLimitService.assertAllowed(c, email, token, false);

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		// 这条分支不校验口令，本来就不是一次爆破尝试。给它计数只会白送一个
		// "不解人机验证就能把任意账号的计数灌满"的投毒入口——这个接口只服务 admin
		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			await loginLimitService.recordFail(c, email);
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			await loginLimitService.recordFail(c, email);
			throw new BizError(t('IncorrectPwd'));
		}

		if (limitCount && limitCount.accountCount > 0) {
			await loginLimitService.clear(c, email);
		}

		// 只用开放 API、从不登网页后台的部署，管理员口令否则会永远停在旧算法上
		await userService.upgradePasswordHash(c, userRow, password);
	}

}

export default publicService
