import { UAParser } from 'ua-parser-js';
const reqUtils = {
	getIp(c) {
		return  c.req.header('CF-Connecting-IP') ||
			c.req.header('X-Forwarded-For') ||
			'Unknown';
	},

	// 限流专用的来源标识：只认 CF-Connecting-IP。X-Forwarded-For 是客户端可写的，
	// 拿它当限流身份等于让攻击者每次请求自选一个新桶。取不到时所有请求落到同一个桶，
	// 宁可误伤也不放行
	getLimitIp(c) {
		return c.req.header('CF-Connecting-IP') || 'unknown-ip';
	},

	getUserAgent(c) {
		const ua = c.req.header('user-agent') || '';

		const parser = new UAParser(ua);
		const { browser, device, os } = parser.getResult();

		let browserInfo = null;
		let osInfo = null;

		if (browser.name) {
			browserInfo = browser.name + ' ' + browser.version;
		}

		if (os.name) {
			osInfo = os.name + os.version;
		}

		let deviceInfo = 'Desktop';

		const hasVendor = !!device?.vendor;
		const hasModel = !!device?.model;

		if (hasVendor || hasModel) {
			const vendor = device.vendor || '';
			const model = device.model || '';
			const type = device.type || '';

			const namePart = [vendor, model].filter(Boolean).join(' ');
			const typePart = type ? ` (${type})` : '';
			deviceInfo = (namePart + typePart).trim();
		}

		return {browser: browserInfo || '', device: deviceInfo || '', os: osInfo || ''}
	}
}

export default reqUtils
