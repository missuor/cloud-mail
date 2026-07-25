// D1/SQLite 的 LIKE pattern 上限是 50 个**字节**（SQLITE_LIMIT_LIKE_PATTERN_LENGTH
// 走 sqlite3_value_bytes 度量），不是 50 个字符——按字符截会漏：一个汉字 3 字节，
// 17 个汉字就是 51 字节，照样 500。而这是个中文项目，搜索框里粘一句短话就会撞上。
//
// 所以按最终 pattern 的字节数收口，预算 50 减去首尾两个 %。
// 顺带把 ASCII 的可用长度从 20 提到 48，减少「截断导致命中范围变大」的情况。
export function toLikeKeyword(keyword) {

	const encoder = new TextEncoder();
	let result = '';
	let bytes = 2; // 首尾两个 %

	// for...of 按码点迭代，代理对（emoji、扩展区汉字）不会被从中间切开；
	// 转义符与被转义字符作为一个整体追加，也就不会在末尾切出落单的反斜杠
	for (const ch of String(keyword ?? '')) {

		// % 和 _ 是 LIKE 的通配符，不转义的话 john_doe@ 里的下划线会被当成
		// 任意单字符，输入一个 % 更是直接匹配全部
		const piece = (ch === '\\' || ch === '%' || ch === '_') ? '\\' + ch : ch;
		const size = encoder.encode(piece).length;

		if (bytes + size > 50) {
			break;
		}

		result += piece;
		bytes += size;
	}

	return result;
}

// 判断一个**调用方自己提供的完整 pattern** 是否超出 D1 的 50 字节上限。
// 与 toLikeKeyword 的区别：那个用于我们自己包 %...% 的场景，要截断并转义；
// 这里用于开放 API——调用方有意自己控制通配符（toEmail=%@domain.com 是既有
// 契约），截断或转义都会打断它，所以只做检查、让调用方拿到一句人话而不是 500。
// 预算是完整的 50 字节，因为这里不额外包 %
export function isLikePatternTooLong(pattern) {
	return new TextEncoder().encode(String(pattern ?? '')).length > 50;
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
