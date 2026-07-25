// 常见弱口令的「词干」。
//
// 不用字面量口令表，是因为那样得为 password123 / password1234 / p@ssw0rd123
// 各存一条，几百条也盖不住长尾。这里改成先把口令归一化（NFKC、转小写、还原
// leet 替换、去掉非字母）再比对词干，一条 password 就能覆盖上面全部变体。
export const WEAK_STEMS = new Set([
	// 口令本身
	'password', 'passwd', 'pass', 'mypassword', 'newpassword', 'oldpassword',
	'changeme', 'defaultpassword', 'temppassword', 'testpassword',
	// 账号/角色
	'admin', 'administrator', 'root', 'guest', 'user', 'test', 'demo', 'temp',
	'login', 'welcome', 'letmein', 'secret', 'manager', 'operator', 'service',
	// 键盘走位（不成行的整段，成行的交给 KEYBOARD_ROWS 的子串判断）
	'qazwsx', 'qazwsxedc', 'zaqwsx', 'zaqwsxcde', 'qweasd', 'qweasdzxc',
	'qwertz', 'azerty', 'asdzxc',
	// 字母序
	'abcabc', 'aabbcc',
	// 经典泄露榜常客
	'iloveyou', 'loveyou', 'lovely', 'sunshine', 'princess', 'monkey', 'dragon',
	'master', 'shadow', 'superman', 'batman', 'football', 'baseball', 'basketball',
	'soccer', 'hockey', 'computer', 'internet', 'freedom', 'whatever', 'trustno',
	'starwars', 'pokemon', 'minecraft', 'fortnite', 'playstation', 'nintendo',
	'chocolate', 'cookie', 'flower', 'butterfly', 'angel', 'babygirl', 'sweetie',
	'summer', 'winter', 'spring', 'autumn', 'forever', 'nothing', 'midnight',
	'hello', 'helloworld', 'happy', 'lucky', 'money', 'love', 'ninja', 'killer',
	'hunter', 'ranger', 'buster', 'harley', 'jordan', 'tigger', 'pepper', 'ginger',
	'hammer', 'silver', 'golden', 'orange', 'purple', 'yellow', 'cheese', 'chicken',
	// 常见英文名。现实字典里命中率最高的一类就是「名字 + 数字」，
	// 而这类恰恰不会出现在上面任何一组里，必须单独列
	'michael', 'jennifer', 'jessica', 'ashley', 'amanda', 'nicole', 'melissa',
	'matthew', 'joshua', 'daniel', 'david', 'james', 'robert', 'john', 'william',
	'thomas', 'charlie', 'andrew', 'anthony', 'joseph', 'richard', 'charles',
	'steven', 'kevin', 'brian', 'jason', 'justin', 'ryan', 'nathan', 'jacob',
	'sarah', 'emily', 'hannah', 'samantha', 'elizabeth', 'megan', 'lauren',
	'rachel', 'victoria', 'natalie', 'maggie', 'jasmine', 'taylor', 'morgan',
	// 球队/品牌
	'liverpool', 'arsenal', 'chelsea', 'barcelona', 'realmadrid', 'manchester',
	'juventus', 'yankees', 'cowboys', 'mustang', 'corvette', 'ferrari',
	'google', 'facebook', 'myspace', 'twitter', 'instagram', 'linkedin', 'samsung',
	'apple', 'microsoft', 'yahoo', 'gmail', 'hotmail', 'outlook',
	// 本项目相关（部署者容易顺手用的）
	'cloudmail', 'mail', 'email', 'mailbox', 'webmail', 'skymail',
	// 中文拼音常见
	'woaini', 'nihao', 'zhongguo', 'beijing', 'shanghai', 'xiaoming', 'wangyi',
]);

// 中文弱口令。中文口令的英文词干恒为空串、会走 stem.length < 3 直接放行，
// 等于整个中文形态拿不到任何字典检查——对一个中文为主的项目，这相当于
// 弱口令表里没有 password。
// 只做「完全相等」（含按短周期折叠后相等）判断，不做包含判断：
// 「我的密码很安全啊」也含「密码」但本身不弱，包含判断会误伤它。
// 代价是「我的密码是密码」这类短语挡不住——那需要真正的短语词典，超出本表范围。
const CJK_WEAK_STEMS = new Set([
	'密码', '我的密码', '密码密码', '新密码', '旧密码', '默认密码',
	'管理员', '管理员密码', '用户', '登录', '邮箱', '邮件',
	'我爱你', '你好', '中国', '北京', '上海', '广州', '深圳',
	'生日快乐', '新年快乐', '恭喜发财', '天天开心', '平安喜乐',
	'测试', '测试密码', '张三', '李四', '王五',
]);

// 中文数字序列：一二三四五六七八 这类
const CJK_SEQUENCES = ['零一二三四五六七八九十', '一二三四五六七八九十'];

// 只保留汉字。中文口令的词干就靠这个取
export function toCjkStem(password) {
	return normalizeForPolicy(password).replace(/[^\p{Script=Han}]/gu, '');
}

function isCjkWeak(password) {

	const stem = toCjkStem(password);

	if (stem.length < 2) {
		return false;
	}

	if (CJK_WEAK_STEMS.has(stem) || CJK_WEAK_STEMS.has(collapseRepeat(stem))) {
		return true;
	}

	return stem.length >= 4 && CJK_SEQUENCES.some(seq => seq.includes(stem));
}

// 键盘走位：按行/列的连续段。用子串判断，能一次盖住 qwert / asdfg / zxcvb
// 这类任意长度的截取，不必逐条硬编码
const KEYBOARD_ROWS = [
	'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
	'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz',
];

// leet 还原：p@ssw0rd -> password
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

// 长度与词干两侧必须共用同一份归一化输入，否则会出现「词干那边认得、
// 长度那边算错」的不一致。
// - NFKC：全角 ｐａｓｓｗｏｒｄ 折成半角，且统一 NFC/NFD（café 的两种写法
//   码点数不同，不统一的话同一个口令时而过时而不过）
// - 去掉 \p{Cf} 格式字符：零宽空格不可见、零熵，却会被按 2 计来凑长度
export function normalizeForPolicy(password) {
	return String(password ?? '').normalize('NFKC').replace(/\p{Cf}/gu, '');
}

function normalize(password) {
	return normalizeForPolicy(password).toLowerCase();
}

// 词干：先剥掉首尾的数字与符号，再还原 leet，最后只留字母。
// 剥这一步不能省——password123 若直接还原 leet，末尾 123 会变成 ie 混进词干
// （passwordie），反而查不到表
export function toStem(password) {
	let s = normalize(password).replace(/^[^a-z@$!]+/, '').replace(/[^a-z]+$/, '');
	s = s.replace(/[0134579@$!]/g, ch => LEET[ch] || ch);
	return s.replace(/[^a-z]/g, '');
}

// 另一种归一：先丢掉数字再取字母。专门对付 1q2w3e4r5t 这类数字与字母交替的
// 键盘走位——它们走 leet 还原会被拆成无意义的串
export function toStemNoDigits(password) {
	return normalize(password).replace(/[^a-z]/g, '');
}

// adminadmin / testtesttest：整串是某个短串的重复，取那个短串再判
function collapseRepeat(stem) {
	for (let size = 1; size <= stem.length / 2; size++) {
		if (stem.length % size !== 0) {
			continue;
		}
		const base = stem.slice(0, size);
		if (base.repeat(stem.length / size) === stem) {
			return base;
		}
	}
	return stem;
}

function isKeyboardRun(stem) {
	return stem.length >= 4 && KEYBOARD_ROWS.some(row => row.includes(stem));
}

// 短周期重复：1234512345123451 这类。长度不必被周期整除，按前缀铺满即可
function isPeriodic(s) {
	for (let size = 1; size <= 6 && size < s.length; size++) {
		const base = s.slice(0, size);
		if (base.repeat(Math.ceil(s.length / size)).slice(0, s.length) === s) {
			return true;
		}
	}
	return false;
}

// 最长的连续递增/递减段。1234567890123456 里有一段长 9 的顺子
function longestSequentialRun(s) {
	let best = 1;
	let current = 1;

	for (let i = 1; i < s.length; i++) {
		const step = s.charCodeAt(i) - s.charCodeAt(i - 1);
		if (step === 1 || step === -1) {
			current++;
			best = Math.max(best, current);
		} else {
			current = 1;
		}
	}

	return best;
}

// 结构性弱口令：整串同一个字符、短纯数字、连续序列
export function isStructurallyWeak(password) {

	const s = normalizeForPolicy(password);

	// u 标志不能少：不带 u 时 . 匹配单个 UTF-16 码元，代理对（emoji、生僻字
	// 扩展区）永远匹配不上「整串同一字符」，这条规则会对它们静默失效
	if (/^(.)\1+$/u.test(s)) {
		return true;
	}

	// 纯数字：短的确实弱（10 位约 33 bit，当前迭代数下约一天可破），
	// 但 16 位以上有 53 bit 以上，一刀切拒掉是过头了。
	// 不过长度本身不等于随机——放行前还得排掉有明显模式的：数字种类太少、
	// 短周期重复、以及像 1234567890123456 这种顺子拼接
	if (/^\d+$/.test(s)) {
		return s.length < 16
			|| new Set(s).size < 5
			|| isPeriodic(s)
			|| longestSequentialRun(s) >= 8;
	}

	const seq = '0123456789abcdefghijklmnopqrstuvwxyz';
	const lower = s.toLowerCase();
	const reversed = seq.split('').reverse().join('');

	if (seq.includes(lower) || reversed.includes(lower)) {
		return true;
	}

	// 整串里只要有一段 8 位以上的顺子，剩下部分通常也没多少熵
	// （abcd12345678 就是「4 位字母 + 8 位顺子」）
	return longestSequentialRun(lower) >= 8;
}

export function isWeakPassword(password) {

	if (isStructurallyWeak(password)) {
		return true;
	}

	if (isCjkWeak(password)) {
		return true;
	}

	for (const stem of new Set([toStem(password), toStemNoDigits(password)])) {

		// 词干太短说明口令基本由数字/符号构成，判断权交给上面的结构性规则
		if (stem.length < 3) {
			continue;
		}

		const collapsed = collapseRepeat(stem);

		if (WEAK_STEMS.has(stem) || WEAK_STEMS.has(collapsed)
			|| isKeyboardRun(stem) || isKeyboardRun(collapsed)) {
			return true;
		}
	}

	return false;
}
