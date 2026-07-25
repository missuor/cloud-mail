<template>
  <div class="account-box">
    <div class="head-opt">
      <Icon v-perm="'account:add'" class="icon add" icon="ion:add-outline" width="23" height="23" @click="add"/>
      <el-tooltip :content="$t('manageAccount')" placement="bottom">
        <Icon v-perm="'account:delete'" class="icon manage" icon="fluent:list-bar-16-filled" width="19" height="19"
              @click="openManage"/>
      </el-tooltip>
      <Icon class="icon refresh" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>
    <el-scrollbar class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <el-card class="item" :class="itemBg(item.accountId)" v-for="(item, index) in accounts" :key="item.accountId"
                 @click="changeAccount(item)">
          <div class="account">
            {{ item.email }}
          </div>
          <div class="opt">
            <div class="send-email" @click.stop>
              <Icon @click="setAllReceive(item)" v-if="!item.allReceive" icon="eva:email-fill" width="22" height="22" color="#fccb1a"/>
              <Icon @click="setAllReceive(item)" v-else icon="flat-color-icons:folder" width="22" height="22" color="#23c4f1" />
            </div>
            <div class="settings" @click.stop>
              <Icon icon="fluent-color:clipboard-24" width="22" height="22" @click.stop="copyAccount(item.email)"/>
              <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"
                    v-if="showNullSetting(item)"/>
              <el-dropdown v-else>
                <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item, index)">{{ $t('pin') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                      @click="remove(item)">{{ $t('delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </el-card>

        <!-- Initial Loading Skeleton -->
        <template v-if="loading">
          <el-skeleton v-for="i in skeletonRows" :key="i" animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 25px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <!-- Follow Loading Skeleton -->
        <template v-if="accounts.length > 0 && !noLoading">
          <el-skeleton animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <div class="noLoading" v-if="noLoading && accounts.length > 0">
          <div>{{ $t('noMoreData') }}</div>
        </div>
        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty :description="$t('noAccountFound')"/>
        </div>
      </div>

    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addAccount')">
      <div class="container">
        <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
      <div
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
          data-error-callback="onTurnstileError"
      >
        <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
      </div>
    </el-dialog>
    <el-dialog v-model="manageShow" class="manage-dialog" :title="$t('manageAccount')"
               @close="onManageClosing" @closed="onManageClosed">
      <div class="manage-box">
        <el-input v-model="manageKeyword" class="manage-search" clearable
                  :placeholder="$t('searchAccountPlaceholder')" @input="onKeywordInput">
          <template #prefix>
            <Icon icon="fluent:search-16-regular" width="16" height="16"/>
          </template>
        </el-input>

        <el-scrollbar class="manage-list" ref="manageScrollRef">
          <div v-infinite-scroll="getManageList" :infinite-scroll-distance="200"
               :infinite-scroll-immediate="false">
            <div v-for="item in manageAccounts" :key="item.accountId" class="manage-item"
                 :class="{ disabled: isSelf(item) }" @click="toggleOne(item)">
              <el-checkbox :model-value="selectedIds.has(item.accountId)" :disabled="isSelf(item)"
                           @click.stop @change="toggleOne(item)"/>
              <span class="manage-email">{{ item.email }}</span>
              <!-- 本人主邮箱不允许删除，标出来免得用户以为是 bug -->
              <span v-if="isSelf(item)" class="manage-tag">{{ $t('currentAccountTag') }}</span>
            </div>

            <div v-if="manageLoading" class="manage-tip">{{ $t('accountLoading') }}</div>
            <div v-else-if="manageAccounts.length === 0" class="manage-tip">{{ $t('noAccountFound') }}</div>
            <div v-else-if="manageNoMore" class="manage-tip">{{ $t('noMoreData') }}</div>
          </div>
        </el-scrollbar>

        <div class="manage-footer">
          <el-checkbox :model-value="pageAllChecked" :indeterminate="pageIndeterminate"
                       :disabled="selectablePage.length === 0" @change="togglePage">
            {{ $t('selectCurrentPage') }}
          </el-checkbox>
          <div class="manage-actions">
            <span class="manage-count">{{ $t('selectedCount', { msg: selectedIds.size }) }}</span>
            <el-button type="danger" :disabled="selectedIds.size === 0" :loading="batchDeleting"
                       @click="batchRemove">{{ $t('deleteSelected') }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')">
      <div class="container">
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off">
        </el-input>
        <el-button class="btn" type="primary" @click="setName" :loading="setNameLoading"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {
  accountList,
  accountAdd,
  accountDelete,
  accountBatchDelete,
  accountSetName,
  accountSetAllReceive,
  accountSetAsTop
} from "@/request/account.js";
import {sleep} from "@/utils/time-utils.js"
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";

const {t} = useI18n();
const userStore = useUserStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const showAdd = ref(false)
const addLoading = ref(false);
const domainList = computed(() => settingStore.domainList)
const accounts = reactive([])
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false);
const verifyShow = ref(false)
const setNameShow = ref(false)
const setNameLoading = ref(false)
const accountName = ref(null)
const addRef = ref({})
const scrollbarRef = ref({})
let account = null
let turnstileId = null
const botJsError = ref(false)
let verifyToken = ''
let verifyErrorCount = 0
let first = true
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
let skeletonRows = 10
const queryParams = {
  size: 30
}

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}

watch(() => accountStore.changeUserAccountName, () => {
  accounts[0].name = accountStore.changeUserAccountName
})

watch(() => settingStore.domainList, (list) => {
  if (!addForm.suffix && list.length > 0) {
    addForm.suffix = list[0]
  }
}, {immediate: true})


const openSelect = () => {
  mySelect.value.toggleMenu()
}

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

function getSkeletonRows() {
  if (accounts.length > 20) return skeletonRows = 20
  if (accounts.length === 0) return skeletonRows = 1
  skeletonRows = accounts.length
}

function setName() {

  let name = accountName.value

  if (name === account.name) {
    setNameShow.value = false
    return
  }

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameLoading.value = true
  accountSetName(account.accountId, name).then(() => {
    account.name = name
    setNameShow.value = false

    if (account.accountId === userStore.user.account.accountId) {
      userStore.user.name = name
    }

    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    setNameLoading.value = false
  })
}

function openSetName(accountItem) {
  accountName.value = accountItem.name
  account = accountItem
  setNameShow.value = true
}

function setAllReceive(account) {
  let allReceiveAccount = accounts.find(account => account.allReceive === AccountAllReceiveEnum.ENABLED);
  if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED;
  account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
  accountSetAllReceive(account.accountId).catch(() => {
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
    if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED;
  }).then(() => {
    if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
      ElMessage({
        message: t('setSuccess'),
        type: 'success',
        plain: true,
      })
    }
    changeAccount(account);
    emailStore.emailScroll?.refreshList();
    emailStore.sendScroll?.refreshList();
  })
}


function showNullSetting(item) {
  return !hasPerm('email:send') && !(item.accountId !== userStore.user.account.accountId && hasPerm('account:delete'))
}

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}



function remove(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const index = accounts.findIndex(item => item.accountId === account.accountId);
      accounts.splice(index, 1);
      if (accounts.length < queryParams.size) {
        getAccountList()
      }
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  loading.value = false
  followLoading.value = false
  noLoading.value = false
  queryParams.accountId = 0
  queryParams.lastSort = null
  getSkeletonRows();
  scrollbarRef.value.setScrollTop(0)
  accounts.splice(0, accounts.length)
  getAccountList()
}

// ===== 批量管理弹窗 =====
// 独立于侧栏那份列表：自己的游标、自己的搜索关键字，避免两边互相打架
const manageShow = ref(false)
const manageKeyword = ref('')
const manageAccounts = reactive([])
const manageLoading = ref(false)
const manageNoMore = ref(false)
const batchDeleting = ref(false)
const manageScrollRef = ref(null)
const selectedIds = ref(new Set())
let keywordTimer = null
// 请求序号。只比对关键字不够：关键字兜一圈回到原值时（a -> b -> 退格回 a），
// 旧请求回来比对相等就会被当成有效结果整页重复追加；分页请求在途时点删除、
// 列表被清空后那个响应也会塞进新列表冒出幽灵行。序号能同时挡住这两种
let reqSeq = 0

// 本人主邮箱删不掉（后端也会拒），这里直接禁选
function isSelf(item) {
  return item.accountId === userStore.user.account.accountId
}

const selectablePage = computed(() => manageAccounts.filter(item => !isSelf(item)))

const pageAllChecked = computed(() =>
    selectablePage.value.length > 0 && selectablePage.value.every(item => selectedIds.value.has(item.accountId)))

const pageIndeterminate = computed(() =>
    !pageAllChecked.value && selectablePage.value.some(item => selectedIds.value.has(item.accountId)))

function openManage() {
  manageShow.value = true
  manageKeyword.value = ''
  resetManageList()
}

// @close 在关闭动作一开始就触发，@closed 要等过渡结束（约 300ms）。
// 防抖也是 300ms，撤定时器必须放在 @close 才抢得赢，否则输入后立刻关闭
// 仍会白发一次请求
function onManageClosing() {
  clearTimeout(keywordTimer)
  reqSeq++ // 作废在途请求
}

function onManageClosed() {
  // 关掉就清干净，免得下次打开还留着上次的勾选
  manageAccounts.splice(0, manageAccounts.length)
  selectedIds.value = new Set()
  manageKeyword.value = ''
  manageNoMore.value = false
}

function resetManageList() {
  reqSeq++ // 作废所有在途请求
  manageAccounts.splice(0, manageAccounts.length)
  selectedIds.value = new Set()
  manageNoMore.value = false
  manageLoading.value = false
  nextTick(() => {
    manageScrollRef.value?.setScrollTop(0)
    getManageList()
  })
}

function onKeywordInput() {
  // 防抖：搜索框每敲一个字都发请求会打爆列表接口
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(resetManageList, 300)
}

function getManageList() {

  if (manageLoading.value || manageNoMore.value) return

  manageLoading.value = true

  const seq = ++reqSeq
  const accountId = manageAccounts.length > 0 ? manageAccounts.at(-1).accountId : 0
  const lastSort = manageAccounts.length > 0 ? manageAccounts.at(-1).sort : null
  const keyword = manageKeyword.value

  accountList(accountId, 30, lastSort, keyword).then(list => {
    // 过期响应直接丢弃。序号只会递增，所以「不是最新那次」的判断是可靠的
    if (seq !== reqSeq) return
    if (list.length < 30) manageNoMore.value = true
    manageAccounts.push(...list)
  }).finally(() => {
    // loading 标志归当前那次请求所有，过期响应不能替它清掉
    if (seq !== reqSeq) return
    manageLoading.value = false
  })
}

function toggleOne(item) {
  if (isSelf(item)) return
  const next = new Set(selectedIds.value)
  next.has(item.accountId) ? next.delete(item.accountId) : next.add(item.accountId)
  selectedIds.value = next
}

function togglePage(checked) {
  const next = new Set(selectedIds.value)
  selectablePage.value.forEach(item => checked ? next.add(item.accountId) : next.delete(item.accountId))
  selectedIds.value = next
}

function batchRemove() {

  const ids = [...selectedIds.value]

  if (ids.length === 0) return

  ElMessageBox.confirm(t('batchDelConfirm', { msg: ids.length }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    batchDeleting.value = true
    accountBatchDelete(ids).then(total => {
      ElMessage({ message: t('batchDelSuccessMsg', { msg: total }), type: 'success', plain: true })

      // 侧栏那份列表也得刷新，否则删掉的邮箱还留在上面
      const deleted = new Set(ids)
      refresh()

      // 当前正在看的邮箱被删了就切回第一个，不然右侧列表会停在一个不存在的邮箱上
      if (deleted.has(accountStore.currentAccountId)) {
        accountStore.currentAccountId = userStore.user.account.accountId
        accountStore.currentAccount = userStore.user.account
        emailStore.emailScroll?.refreshList()
        emailStore.sendScroll?.refreshList()
      }

      resetManageList()
    }).finally(() => {
      batchDeleting.value = false
    })
  })
}

function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
}

function add() {
  addForm.suffix = addForm.suffix || settingStore.domainList[0]
  showAdd.value = true
  setTimeout(() => {
    addRef.value.focus()
  }, 100)
}

function setAsTop(account, index) {
  accountSetAsTop(account.accountId).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })

    const [item] = accounts.splice(index, 1);
    accounts.splice(1, 0, item);

  });
}

async function copyAccount(account) {
  try {
    await navigator.clipboard.writeText(account);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function getAccountList() {

  if (loading.value || followLoading.value || noLoading.value) return;

  if (accounts.length === 0) {
    loading.value = true
  } else {
    followLoading.value = true
  }

  let start = Date.now();

  const accountId = accounts.length > 0 ? accounts.at(-1).accountId : 0;
  const lastSort = accounts.length > 0 ? accounts.at(-1).sort : null;

  accountList(accountId, queryParams.size, lastSort).then(async list => {

    let end = Date.now();
    let duration = end - start;
    if (duration < 300) {
      await sleep(300 - duration)
    }

    if (list.length < queryParams.size) {
      noLoading.value = true
    }
    if (accounts.length === 0) {
      // 原来是无条件顶成 list[0]，而 currentAccountId 不变，于是每次 refresh 后
      // 两者就不一致了（写信的默认发件人、allReceive 都会取错）。
      // 批量删除必调 refresh，这条会被撞得更频繁。
      // 选中项在首屏就用首屏那份刷新它；不在首屏可能是翻到后面去了，不能乱动
      const current = list.find(item => item.accountId === accountStore.currentAccountId)

      if (current) {
        accountStore.currentAccount = current
      } else if (!accountStore.currentAccount) {
        accountStore.currentAccount = list[0]
        accountStore.currentAccountId = list[0]?.accountId
      }
    }

    accounts.push(...list)

    loading.value = false
    followLoading.value = false
    first = false
  }).catch(() => {
    loading.value = false
    followLoading.value = false
  })
}


function submit() {

  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.email.length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.add-email-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  addLoading.value = true
  accountAdd(addForm.email + addForm.suffix, verifyToken).then(account => {
    addLoading.value = false
    showAdd.value = false
    addForm.email = ''
    accounts.push(account)
    verifyToken = ''
    settingStore.settings.addVerifyOpen = account.addVerifyOpen
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    verifyShow.value = false
    userStore.refreshUserInfo()
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.add-email-turnstile')
        })
      }
      verifyShow.value = true
    }
    addLoading.value = false
  })
}
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.manage-box {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .manage-list {
    height: 320px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
  }

  .manage-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &:hover {
      background-color: var(--el-fill-color-light);
    }

    &.disabled {
      cursor: default;
      opacity: .6;
    }
  }

  .manage-email {
    flex: 1;
    // 邮箱可能很长，撑破弹窗比截断更难受
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .manage-tag {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    border: 1px solid var(--el-border-color);
    border-radius: 3px;
    padding: 0 5px;
  }

  .manage-tip {
    text-align: center;
    padding: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .manage-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .manage-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .manage-count {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.account-box {

  border-right: 1px solid var(--el-border-color) !important;
  background-color: var(--el-bg-color);
  height: 100%;
  overflow: hidden;

  .head-opt {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 10px;
    padding-right: 10px;

    .icon {
      cursor: pointer;
    }

    .refresh {
      margin-left: 10px;
    }

    .add {
      margin-left: 2px;
    }

    .head-opt:not(.add) .refresh {
      margin-left: 5px;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 38px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 98px);
    }

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: var(--secondary-text-color);
    }
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .item {
    background-color: var(--el-bg-color);
    border-radius: 8px;
    padding: 12px 10px;
    margin-bottom: 10px;
    margin-left: 10px;
    margin-right: 10px;
    cursor: pointer;

    .account {
      font-weight: 600;
      margin-bottom: 20px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .opt {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;

      .settings {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .send-email {
        display: flex;
        align-items: center;
      }
    }

    :deep(.el-card__body) {
      padding: 0;
    }
  }

  .item:first-child {
    margin-top: 10px;
  }

  .item-choose {
    background: var(--choose-account-background);
  }
}


.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--el-bg-color);
}

.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

</style>
