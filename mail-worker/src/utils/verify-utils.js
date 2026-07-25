// D1 的 LIKE pattern 长度上限是 50，超过直接抛 SQLITE_ERROR。pattern 由
// 关键字加首尾两个 % 组成，而 % 和 _ 转义后最坏会翻倍，所以原始关键字截到
// 20 字符：最坏 20*2 + 2 = 42，稳在上限内。
// 截断只会让匹配范围变大（前缀仍然命中），比粘一个长邮箱地址进来就 500 好得多。
export function toLikeKeyword(keyword) {
	return String(keyword ?? '')
		.slice(0, 20)
		// % 和 _ 是 LIKE 的通配符。不转义的话 john_doe@ 里的下划线会被当成
		// 任意单字符，输入一个 % 更是直接匹配全部
		.replace(/[\\%_]/g, ch => '\\' + ch);
}

const verifyUtils = {
	isEmail(str) {
		return  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
	},
	isDomain(str) {
		return /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
	}
}

export default  verifyUtils
