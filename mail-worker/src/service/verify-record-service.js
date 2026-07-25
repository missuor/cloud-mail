import orm from '../entity/orm';
import verifyRecord from '../entity/verify-record';
import { eq, sql, and } from 'drizzle-orm';
import dayjs from 'dayjs';
import reqUtils from '../utils/req-utils';
import { verifyRecordType } from '../const/entity-const';
import constant from '../const/constant';

const verifyRecordService = {

	async selectListByIP(c) {
		const ip = reqUtils.getIp(c)
		return orm(c).select().from(verifyRecord).where(eq(verifyRecord.ip, ip)).all();
	},

	async clearRecord(c) {
		await orm(c).delete(verifyRecord).run();
	},

	async isOpenRegVerify(c, regVerifyCount) {

		const ip = reqUtils.getIp(c)

		const row = await orm(c).select().from(verifyRecord).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.REG))).get();

		if (row) {
			if (row.count >= regVerifyCount){
				return true
			}

		}

		return false

	},

	async isOpenAddVerify(c, addVerifyCount) {

		const ip = reqUtils.getIp(c)

		const row = await orm(c).select().from(verifyRecord).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.ADD))).get();

		if (row) {

			if (row.count >= addVerifyCount){
				return true
			}

		}

		return false

	},

	// 下面三个是登录防爆破用的带窗口计数。与注册/加邮箱那套的区别是：
	// 那套按天累计、靠每日 cron 清表；登录要的是 15 分钟滑动窗口，
	// 所以读的时候按 update_time 判过期，过期的旧记录当作 0 起算。
	async loginFailCount(c, key, type) {

		const row = await orm(c).select().from(verifyRecord)
			.where(and(eq(verifyRecord.ip, key), eq(verifyRecord.type, type))).get();

		if (!row) {
			return 0;
		}

		if (this.isExpired(row.updateTime)) {
			return 0;
		}

		return row.count;
	},

	async increaseLoginFail(c, key, type) {

		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const row = await orm(c).select().from(verifyRecord)
			.where(and(eq(verifyRecord.ip, key), eq(verifyRecord.type, type))).get();

		if (!row) {
			return orm(c).insert(verifyRecord).values({ ip: key, type, count: 1, updateTime: now }).run();
		}

		// 窗口已过就从 1 重新起算，否则会把几小时前的失败也算进来
		const count = this.isExpired(row.updateTime) ? 1 : row.count + 1;

		return orm(c).update(verifyRecord).set({ count, updateTime: now })
			.where(and(eq(verifyRecord.ip, key), eq(verifyRecord.type, type))).run();
	},

	async clearLoginFail(c, key, type) {
		return orm(c).delete(verifyRecord)
			.where(and(eq(verifyRecord.ip, key), eq(verifyRecord.type, type))).run();
	},

	isExpired(updateTime) {
		if (!updateTime) {
			return true;
		}
		// 登录记录的 update_time 一律由本服务用 dayjs().format() 写入，读回来仍用
		// dayjs() 比较，同一个时钟自洽，不依赖运行时时区，也不碰 utc 插件
		return dayjs(updateTime).add(constant.LOGIN_FAIL_WINDOW_MINUTE, 'minute').isBefore(dayjs());
	},

	async increaseRegCount(c) {

		const ip = reqUtils.getIp(c)

		const row = await orm(c).select().from(verifyRecord).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.REG))).get();
		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

		if (row) {
			return  orm(c).update(verifyRecord).set({
				count: sql`${verifyRecord.count}
		+ 1`, updateTime: now
			}).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.REG))).returning().get();
		} else {
			return  orm(c).insert(verifyRecord).values({ip, type: verifyRecordType.REG}).returning().run();
		}
	},

	async increaseAddCount(c) {

		const ip = reqUtils.getIp(c)

		const row = await orm(c).select().from(verifyRecord).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.ADD))).get();
		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

		if (row) {
			return orm(c).update(verifyRecord).set({
				count: sql`${verifyRecord.count}
		+ 1`, updateTime: now
			}).where(and(eq(verifyRecord.ip, ip),eq(verifyRecord.type,verifyRecordType.ADD))).returning().get();
		} else {
			return orm(c).insert(verifyRecord).values({ip, type: verifyRecordType.ADD}).returning().get();
		}
	}

};

export default verifyRecordService;
