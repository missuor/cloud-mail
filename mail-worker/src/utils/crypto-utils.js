import constant from '../const/constant';

const encoder = new TextEncoder();

// 口令哈希格式：pbkdf2$<迭代次数>$<base64>
// 迭代次数写进哈希本身，这样调整配置后老记录仍能被正确校验，
// 并在下次登录时按新配置重算，不需要停机迁移
const PBKDF2_PREFIX = 'pbkdf2$';

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	// Workers 免费版每请求 CPU 上限是 10ms，而 PBKDF2 是纯 CPU 开销。
	// 实测（workerd）：5 万次约 5.2ms、10 万次约 10.6ms、31 万次约 32.8ms。
	// 所以默认值取在免费版能跑的区间，付费部署可以用 pwd_iterations 调高
	iterations(c) {
		const configured = Number(c?.env?.pwd_iterations);

		if (!Number.isFinite(configured) || configured < constant.PWD_ITERATIONS_MIN) {
			return constant.PWD_ITERATIONS;
		}

		// 必须夹上限。误配成 1e9 这种值不会报错，只会闷头算约 110 秒 CPU，
		// 连付费版默认的 30s 上限都超；而 CPU 超限是运行时终止、JS 里 catch 不到，
		// 结果就是配置改错一次、全站再也登不进去
		return Math.min(Math.floor(configured), constant.PWD_ITERATIONS_MAX);
	},

	async hashPassword(password, iterations = constant.PWD_ITERATIONS) {
		const salt = this.generateSalt();
		const hash = await this.derive(password, salt, iterations);
		return { salt, hash };
	},

	async derive(password, salt, iterations) {
		const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' }, key, 256);
		const b64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
		return PBKDF2_PREFIX + iterations + '$' + b64;
	},

	// 旧格式：单轮 SHA-256(salt + password)。只用于校验存量口令，不再产出
	async legacyHash(password, salt) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(salt + password));
		return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
	},

	async verifyPassword(inputPassword, salt, storedHash) {

		if (typeof storedHash !== 'string') {
			return false;
		}

		if (!storedHash.startsWith(PBKDF2_PREFIX)) {
			return this.timingSafeEqual(await this.legacyHash(inputPassword, salt), storedHash);
		}

		const iterations = Number(storedHash.slice(PBKDF2_PREFIX.length).split('$')[0]);

		if (!Number.isFinite(iterations) || iterations < 1) {
			return false;
		}

		return this.timingSafeEqual(await this.derive(inputPassword, salt, iterations), storedHash);
	},

	// 存量口令是单轮 SHA-256，拖库即等于明文，必须换掉。但没有明文就无法离线重算，
	// 只能在用户下次登录、拿到明文的那一刻重算一次。配置调高迭代次数后同理
	needsRehash(storedHash, iterations) {

		if (typeof storedHash !== 'string' || !storedHash.startsWith(PBKDF2_PREFIX)) {
			return true;
		}

		return Number(storedHash.slice(PBKDF2_PREFIX.length).split('$')[0]) !== iterations;
	},

	timingSafeEqual(a, b) {
		if (typeof a !== 'string' || typeof b !== 'string') return false;
		if (a.length !== b.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) {
			diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}
		return diff === 0;
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const bytes = new Uint8Array(length);
		crypto.getRandomValues(bytes);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(bytes[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
