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

	// 必须是原子自增。select 再 update 的写法在并发下会大量少记：
	// 一批并发请求读到同一个旧值，各自 +1 写回，几十次失败只记成个位数，
	// 等于给攻击者一个数量级的放大。靠 (ip,type) 唯一索引 + upsert 由 SQLite 保证。
	async increaseLoginFail(c, key, type) {

		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
		const windowStart = dayjs().subtract(constant.LOGIN_FAIL_WINDOW_MINUTE, 'minute').format('YYYY-MM-DD HH:mm:ss');

		// 窗口判断也放进同一条语句，否则「读到过期 -> 决定重置」之间同样有竞态
		try {
			return await c.env.db.prepare(
				`INSERT INTO verify_record (ip, type, count, update_time) VALUES (?, ?, 1, ?)
				 ON CONFLICT(ip, type) DO UPDATE SET
				   count = CASE WHEN verify_record.update_time < ? THEN 1 ELSE verify_record.count + 1 END,
				   update_time = ?`
			).bind(key, type, now, windowStart, now).run();
		} catch (e) {
			// 唯一索引由 v3_1 迁移建立。若升级后没访问过 /api/init，ON CONFLICT 会直接报错，
			// 那样每次登录失败都会变成 500 而不是"密码错误"。退回非原子写法保证可用，
			// 并发下会少记，但总比登录页整个坏掉强
			if (!String(e.message || '').includes('ON CONFLICT')) {
				throw e;
			}
			console.error('verify_record 缺少 (ip,type) 唯一索引，限流退化为非原子计数，请访问 /api/init/<jwt_secret> 执行迁移');
			return this.increaseLoginFailFallback(c, key, type, now);
		}
	},

	async increaseLoginFailFallback(c, key, type, now) {

		const row = await orm(c).select().from(verifyRecord)
			.where(and(eq(verifyRecord.ip, key), eq(verifyRecord.type, type))).get();

		if (!row) {
			return orm(c).insert(verifyRecord).values({ ip: key, type, count: 1, updateTime: now }).run();
		}

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
		// dayjs() 比较，同一个时钟自洽，不依赖运行时时区，也不碰 utc 插件。
		// 注意：这里不能依赖 DB 的 DEFAULT CURRENT_TIMESTAMP —— 那个是 UTC，
		// 与 dayjs() 的本地时区可能差好几个小时，会把没过期的记录判成过期。
		// 所以 LOGIN 类型的行必须永远显式写 updateTime
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
