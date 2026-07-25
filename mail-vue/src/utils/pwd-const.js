// 与后端 mail-worker/src/const/constant.js 及 utils/pwd-policy.js 保持一致。
// 前端只镜像「长度」这部分做即时提示；弱口令表**不**放到前端——那等于把字典
// 送给攻击者，强度判断以后端为准。
export const PWD_MIN_LENGTH = 10
export const PWD_MIN_CODE_POINTS = 6

// 有效长度：非 ASCII 字符按 2 个算。不这样算的话，8 个汉字的口令（约 94 bit，
// 远强于 10 位 ASCII）会被前端按 length=8 挡死，而后端其实是接受的
// 与后端 weak-password.js 的 normalizeForLength 一致：用 NFC 统一 NFC/NFD 写法、
// 剔除零宽等格式字符。不用 NFKC——兼容性展开会被反向利用来凑长度
// （㍿ 一个字符展开成「株式会社」四个码点）
// 剔除格式字符必须在归一化之前，否则函数不幂等：零宽字符原本隔开了基字符与
// 组合符，剔除后两者相邻、再归一化一次就会被合成，导致「归一化一次」与「两次」
// 的码点数不同。前端 isTooShort 内部会再调 effectiveLength（又归一化一次），
// 顺序错了就会和后端给出相反的判定
export function normalizeForLength(value) {
  return String(value ?? '').replace(/\p{Cf}/gu, '').normalize('NFC')
}

export function effectiveLength(value) {
  let length = 0
  for (const ch of normalizeForLength(value)) {
    length += ch.codePointAt(0) > 0x7f ? 2 : 1
  }
  return length
}

// 与后端 pwdPolicy.assertStrong 的长度判断等价
export function isTooShort(value) {
  const str = normalizeForLength(value)
  return effectiveLength(str) < PWD_MIN_LENGTH || [...str].length < PWD_MIN_CODE_POINTS
}
