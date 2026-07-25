// 常见弱口令的「词干」。
//
// 不用字面量口令表，是因为那样得为 password123 / password1234 / p@ssw0rd123
// 各存一条，几百条也盖不住长尾。这里改成先把口令归一化（转小写、还原 leet
// 替换、去掉首尾的数字和符号）再比对词干，一条 password 就能覆盖上面全部变体。
export const WEAK_STEMS = new Set([
	// 口令本身
	'password', 'passwd', 'pass', 'mypassword', 'newpassword', 'oldpassword',
	'passwordpassword', 'changeme', 'defaultpassword', 'temppassword', 'testpassword',
	// 账号/角色
	'admin', 'administrator', 'root', 'guest', 'user', 'test', 'demo', 'temp',
	'login', 'welcome', 'letmein', 'secret', 'manager', 'operator', 'service',
	// 键盘走位
	'qwerty', 'qwertyuiop', 'qwertyui', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
	'qazwsx', 'qazwsxedc', 'qweasdzxc', 'qwertz', 'azerty',
	// 字母序
	'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh', 'abcdefghij',
	'abcabc', 'aabbcc',
	// 经典泄露榜常客
	'iloveyou', 'loveyou', 'lovely', 'sunshine', 'princess', 'monkey', 'dragon',
	'master', 'shadow', 'superman', 'batman', 'football', 'baseball', 'basketball',
	'soccer', 'hockey', 'computer', 'internet', 'freedom', 'whatever', 'trustno',
	'starwars', 'pokemon', 'minecraft', 'fortnite', 'playstation', 'nintendo',
	'chocolate', 'cookie', 'flower', 'butterfly', 'angel', 'babygirl', 'sweetie',
	'summer', 'winter', 'spring', 'autumn', 'forever', 'nothing', 'midnight',
	'hello', 'helloworld', 'welcomehome', 'happy', 'lucky', 'money', 'love',
	// 常见服务/品牌
	'google', 'facebook', 'myspace', 'twitter', 'instagram', 'linkedin', 'samsung',
	'apple', 'microsoft', 'yahoo', 'gmail', 'hotmail', 'outlook',
	// 本项目相关（部署者容易顺手用的）
	'cloudmail', 'mail', 'email', 'mailbox', 'webmail', 'skymail',
	// 中文拼音常见
	'woaini', 'nihao', 'zhongguo', 'beijing', 'shanghai', 'xiaoming', 'wangyi',
]);

// leet 还原：p@ssw0rd -> password
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

// 把口令归一化成词干：转小写 -> 去掉首尾数字与符号 -> 还原 leet -> 再去一次首尾非字母
export function toStem(password) {
	let s = String(password).toLowerCase();
	s = s.replace(/^[^a-z@$!]+/, '').replace(/[^a-z]+$/, '');
	s = s.replace(/[0134579@$!]/g, ch => LEET[ch] || ch);
	return s.replace(/[^a-z]/g, '');
}

// 结构性弱口令：整串同一个字符、纯数字、连续序列。这几类无论多长都不该放行
export function isStructurallyWeak(password) {

	const s = String(password);

	if (/^(.)\1+$/.test(s)) {
		return true;
	}

	// 纯数字：短的确实弱（10 位约 33 bit，当前迭代数下约一天可破），
	// 但 16 位以上有 53 bit 以上，一刀切拒掉是过头了
	if (/^\d+$/.test(s) && s.length < 16) {
		return true;
	}

	const seq = '0123456789abcdefghijklmnopqrstuvwxyz';
	const lower = s.toLowerCase();
	const reversed = seq.split('').reverse().join('');

	return seq.includes(lower) || reversed.includes(lower);
}

export function isWeakPassword(password) {

	if (isStructurallyWeak(password)) {
		return true;
	}

	const stem = toStem(password);

	// 词干太短说明口令基本由数字/符号构成，判断权交给上面的结构性规则
	if (stem.length < 3) {
		return false;
	}

	return WEAK_STEMS.has(stem);
}
