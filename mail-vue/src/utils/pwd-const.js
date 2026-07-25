// 与后端 mail-worker/src/const/constant.js 及 utils/pwd-policy.js 保持一致。
// 前端只镜像「长度」这部分做即时提示；弱口令表**不**放到前端——那等于把字典
// 送给攻击者，强度判断以后端为准。
export const PWD_MIN_LENGTH = 10
export const PWD_MIN_CODE_POINTS = 6

// 剔除零宽等格式字符：不可见、零熵，却会被按 2 计来凑长度
function stripFormatChars(value) {
  return String(value ?? '').replace(/\p{Cf}/gu, '')
}

// 非 ASCII 字符按 2 个算。不这样算的话，8 个汉字的口令（约 94 bit，远强于
// 10 位 ASCII）会被前端按 length=8 挡死，而后端其实是接受的
function rawEffectiveLength(value) {
  let length = 0
  for (const ch of value) {
    length += ch.codePointAt(0) > 0x7f ? 2 : 1
  }
  return length
}

// 两个度量都取归一化前后的较小值，与后端 pwdPolicy.measure 一致。
// 归一化的目的是防规避（全角、零宽都让长度变小），取 min 只保留这个方向；
// 展开是唯一让长度变大的方向，必须挡掉——否则任何让码点变多的归一化路径
// 都能被用来凑长度（NFKC 的 ㍿ -> 株式会社，NFC 对组合排除表字符同样会展开）
export function measure(value) {
  const raw = stripFormatChars(value)
  const nfc = raw.normalize('NFC')
  return {
    effectiveLength: Math.min(rawEffectiveLength(raw), rawEffectiveLength(nfc)),
    codePoints: Math.min([...raw].length, [...nfc].length),
  }
}

// 与后端 pwdPolicy.assertStrong 的长度判断等价
export function isTooShort(value) {
  const { effectiveLength, codePoints } = measure(value)
  return effectiveLength < PWD_MIN_LENGTH || codePoints < PWD_MIN_CODE_POINTS
}
