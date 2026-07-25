import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne, or, lt, desc } from 'drizzle-orm';
import {accountConst, isDel, settingConst} from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import constant from '../const/constant';

const accountService = {

	async add(c, params, userId) {

		const { addEmailVerify , addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'),403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	list(c, params, userId) {

		let { accountId, size, lastSort, email } = params;

		accountId = Number(accountId);
		size = Number(size);
		lastSort = Number(lastSort);

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}

		if(Number.isNaN(lastSort)) {
			lastSort = 9999999999;
		}

		const conditions = [
			eq(account.userId, userId),
			eq(account.isDel, isDel.NORMAL),
			or(
				lt(account.sort, lastSort),
				and(
					eq(account.sort, lastSort),
					gt(account.accountId, accountId)
				)
			)
		];

		// 关键字搜索。邮箱多的时候要靠它把目标筛出来再批量处理，
		// 与库里其它按邮箱查的地方一致用 COLLATE NOCASE
		if (email) {
			conditions.push(sql`${account.email} COLLATE NOCASE LIKE ${'%' + email + '%'}`);
		}

		return orm(c).select().from(account).where(and(...conditions))
			.orderBy(desc(account.sort), asc(account.accountId))
			.limit(size)
			.all();
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	// 批量删除。校验全部先做完再写库，保证全有或全无——删到一半再报错，
	// 用户既不知道删掉了哪些，也没法安全重试
	async batchDelete(c, params, userId) {

		const accountIds = String(params.accountIds || '')
			.split(',')
			.map(id => Number(id))
			.filter(id => Number.isInteger(id) && id > 0);

		if (accountIds.length === 0) {
			throw new BizError(t('emptyAccountIds'));
		}

		// 去重后再判上限，否则重复 id 会白占额度
		const uniqueIds = [...new Set(accountIds)];

		if (uniqueIds.length > constant.ACCOUNT_BATCH_DELETE_LIMIT) {
			throw new BizError(t('accountBatchLimit', { msg: constant.ACCOUNT_BATCH_DELETE_LIMIT }));
		}

		const user = await userService.selectById(c, userId);

		const rows = await orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
				inArray(account.accountId, uniqueIds)))
			.all();

		// 查不全说明夹带了别人的邮箱或已删除的 id，整批拒绝而不是静默跳过——
		// 静默跳过会让前端显示「已删除 N 个」而实际删了更少
		if (rows.length !== uniqueIds.length) {
			throw new BizError(t('noUserAccount'));
		}

		if (rows.some(row => row.email === user.email)) {
			throw new BizError(t('delMyAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(
				eq(account.userId, userId),
				inArray(account.accountId, uniqueIds)))
			.run();

		return uniqueIds.length;
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({name}).where(and(eq(account.userId, userId),eq(account.accountId, accountId))).run();
	},

	async allAccount(c, params) {

		let { userId, num, size } = params

		userId = Number(userId)

		num = Number(num)
		size = Number(size)

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId),ne(account.email,userRow.email))).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list, total }
	},

	async physicsDelete(c, params) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		let a = null
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, accountId)).run();
	},

	async setAsTop(c, params, userId) {
		const { accountId } = params;
		const userRow = await userService.selectById(c, userId);
		const mainAccountRow = await accountService.selectByEmailIncludeDel(c, userRow.email);
		let mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(eq(account.email, userRow.email )).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, accountId),eq(account.userId,userId))).run();
	}
};

export default accountService;
