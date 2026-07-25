// 与后端 mail-worker/src/const/constant.js 及 utils/pwd-policy.js 保持一致。
// 前端只镜像「长度」这部分做即时提示；弱口令表**不**放到前端——那等于把字典
// 送给攻击者，强度判断以后端为准。
export const PWD_MIN_LENGTH = 10
export const PWD_MIN_CODE_POINTS = 6

// 有效长度：非 ASCII 字符按 2 个算。不这样算的话，8 个汉字的口令（约 94 bit，
// 远强于 10 位 ASCII）会被前端按 length=8 挡死，而后端其实是接受的
export function effectiveLength(value) {
  let length = 0
  for (const ch of String(value ?? '')) {
    length += ch.codePointAt(0) > 0x7f ? 2 : 1
  }
  return length
}

// 与后端 pwdPolicy.assertStrong 的长度判断等价
export function isTooShort(value) {
  const str = String(value ?? '')
  return effectiveLength(str) < PWD_MIN_LENGTH || [...str].length < PWD_MIN_CODE_POINTS
}
