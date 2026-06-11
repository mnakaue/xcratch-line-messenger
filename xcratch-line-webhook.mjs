const EXTENSION_ID = 'xcratchLineWebhook';
const EXTENSION_NAME = 'LINE Webhook';
const EXTENSION_DESCRIPTION = 'Xcratch から LINE にメッセージを送る';
const STATUS_READY = '設定OK';
const STATUS_NOT_READY = '未設定';
const STATUS_AUTH_CHECKING = '認証確認中';
const STATUS_AUTH_OK = '認証OK';
const STATUS_AUTH_ERROR = '認証エラー';
const STATUS_SENDING = '送信中';
const STATUS_SENT = '送信成功';
const STATUS_ERROR = '送信エラー';

let extensionURL = 'https://mnakaue.github.io/xcratch-line-messenger/dist/lineWebhook.mjs';

const iconURL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='18' fill='%2306C755'/%3E%3Cpath d='M22 24h36a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8H43l-9 8v-8H22a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z' fill='white'/%3E%3Cpath d='M30 34h20M30 42h14' stroke='%2306C755' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

const entry = {
  name: EXTENSION_NAME,
  extensionId: EXTENSION_ID,
  extensionURL,
  collaborator: 'mnakaue',
  iconURL,
  insetIconURL: iconURL,
  description: EXTENSION_DESCRIPTION,
  tags: ['communication', 'line'],
  featured: false,
  disabled: false,
  bluetoothRequired: false,
  internetConnectionRequired: true
};

const defaultState = () => ({
  webhookUrl: '',
  classPassword: '',
  userCode: '',
  authOk: false,
  lastSendSucceeded: false,
  lastStatus: STATUS_NOT_READY,
  lastResponse: ''
});

class ExtensionBlocks {
  constructor(runtime) {
    this.runtime = runtime;
    this.state = defaultState();
    this.pendingMessages = [];
    this.isSending = false;
  }

  getInfo() {
    return {
      id: EXTENSION_ID,
      name: EXTENSION_NAME,
      extensionURL,
      blockIconURI: iconURL,
      showStatusButton: false,
      blocks: [
        {
          opcode: 'setWebhookUrl',
          func: 'setWebhookUrl',
          blockType: 'command',
          text: 'Webhook URL を [URL] にする',
          arguments: {
            URL: {
              type: 'string',
              defaultValue: 'https://patient-wave-5f0e.toshishyun.workers.dev/api/send'
            }
          }
        },
        {
          opcode: 'setCredentials',
          func: 'setCredentials',
          blockType: 'command',
          text: '利用パスワード [PASSWORD]、個人コード [USER_CODE] に設定する',
          arguments: {
            PASSWORD: {
              type: 'string',
              defaultValue: 'class-2026-a'
            },
            USER_CODE: {
              type: 'string',
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'checkCredentials',
          func: 'checkCredentials',
          blockType: 'command',
          text: '認証の確認'
        },
        {
          opcode: 'sendMessage',
          func: 'sendMessage',
          blockType: 'command',
          text: '[MESSAGE] を LINE に送る',
          arguments: {
            MESSAGE: {
              type: 'string',
              defaultValue: 'こんにちは'
            }
          }
        },
        {
          opcode: 'sendMessageToCode',
          func: 'sendMessageToCode',
          blockType: 'command',
          text: '[MESSAGE] を 個人コード [USER_CODE] に送る',
          arguments: {
            MESSAGE: {
              type: 'string',
              defaultValue: 'こんにちは'
            },
            USER_CODE: {
              type: 'string',
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'isConfigured',
          func: 'isConfigured',
          blockType: 'Boolean',
          text: 'LINE送信の設定ができている'
        },
        {
          opcode: 'isAuthenticated',
          func: 'isAuthenticated',
          blockType: 'Boolean',
          text: '利用パスワードと個人コードが正しい'
        },
        {
          opcode: 'didLastSendSucceed',
          func: 'didLastSendSucceed',
          blockType: 'Boolean',
          text: '最後のLINE送信に成功した'
        },
        {
          opcode: 'getLastStatus',
          func: 'getLastStatus',
          blockType: 'reporter',
          text: 'LINE送信の状態'
        }
      ],
      menus: {}
    };
  }

  setWebhookUrl(args) {
    this.state.webhookUrl = String(args.URL || '').trim();
    this.#refreshStatus();
  }

  setClassPassword(args) {
    this.state.classPassword = String(args.PASSWORD || '').trim();
    this.#refreshStatus();
  }

  async setCredentials(args) {
    this.state.classPassword = String(args.PASSWORD || '').trim();
    this.state.userCode = String(args.USER_CODE || '').trim().toLowerCase();
    this.#refreshStatus();
    await this.#verifyCredentials();
  }

  setUserCode(args) {
    this.state.userCode = String(args.USER_CODE || '').trim().toLowerCase();
    this.#refreshStatus();
  }

  async sendMessage(args) {
    this.#enqueueMessage(
      String(args.MESSAGE || ''),
      this.state.userCode
    );
  }

  async sendMessageToCode(args) {
    this.#enqueueMessage(
      String(args.MESSAGE || ''),
      String(args.USER_CODE || '').trim().toLowerCase()
    );
  }

  isConfigured() {
    return this.#isConfigured();
  }

  isAuthenticated() {
    return this.state.authOk;
  }

  didLastSendSucceed() {
    return this.state.lastSendSucceeded;
  }

  getLastStatus() {
    return this.state.lastStatus;
  }

  getLastResponse() {
    return this.state.lastResponse;
  }

  async checkCredentials() {
    await this.#verifyCredentials();
  }

  #enqueueMessage(message, userCode) {
    this.pendingMessages.push({message, userCode});
    if (!this.isSending) {
      this.#drainQueue();
    }
  }

  async #drainQueue() {
    this.isSending = true;
    while (this.pendingMessages.length > 0) {
      const next = this.pendingMessages.shift();
      await this.#postMessage(next.message, next.userCode);
    }
    this.isSending = false;
  }

  async #postMessage(message, userCode) {
    if (!this.#isConfigured()) {
      this.state.lastStatus = STATUS_ERROR;
      this.state.lastSendSucceeded = false;
      this.state.lastResponse = 'Webhook URL / 利用パスワード / 個人コード が未設定です';
      return;
    }

    if (!userCode) {
      this.state.lastStatus = STATUS_ERROR;
      this.state.lastSendSucceeded = false;
      this.state.lastResponse = '個人コードが空です';
      return;
    }

    try {
      this.state.lastStatus = STATUS_SENDING;
      this.state.lastResponse = this.pendingMessages.length > 0
        ? `送信中（待ち ${this.pendingMessages.length} 件）`
        : '送信中';
      const response = await fetch(this.state.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          classPassword: this.state.classPassword,
          userCode,
          message
        })
      });

      const data = await response.json().catch(() => ({}));
      this.state.lastStatus = response.ok ? STATUS_SENT : STATUS_ERROR;
      this.state.lastSendSucceeded = response.ok;
      this.state.lastResponse = data.message || response.statusText || 'unknown';
    } catch (error) {
      this.state.lastStatus = STATUS_ERROR;
      this.state.lastSendSucceeded = false;
      this.state.lastResponse = error instanceof Error ? error.message : String(error);
    }
  }

  async #verifyCredentials() {
    if (!this.#isConfigured()) {
      this.state.authOk = false;
      this.state.lastStatus = STATUS_NOT_READY;
      this.state.lastResponse = 'Webhook URL / 利用パスワード / 個人コード が未設定です';
      return;
    }

    try {
      this.state.lastStatus = STATUS_AUTH_CHECKING;
      const response = await fetch(this.state.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'check',
          classPassword: this.state.classPassword,
          userCode: this.state.userCode
        })
      });

      const data = await response.json().catch(() => ({}));
      this.state.authOk = response.ok;
      this.state.lastStatus = response.ok ? STATUS_AUTH_OK : STATUS_AUTH_ERROR;
      this.state.lastResponse = response.ok
        ? '利用パスワードと個人コードは使えます'
        : data.message || response.statusText || '認証確認に失敗しました';
    } catch (error) {
      this.state.authOk = false;
      this.state.lastStatus = STATUS_AUTH_ERROR;
      this.state.lastResponse = error instanceof Error ? error.message : String(error);
    }
  }

  #isConfigured() {
    return Boolean(
      this.state.webhookUrl &&
      this.state.classPassword &&
      this.state.userCode
    );
  }

  #refreshStatus() {
    this.state.lastStatus = this.#isConfigured() ? STATUS_READY : STATUS_NOT_READY;
    this.state.lastSendSucceeded = false;
    if (!this.#isConfigured()) {
      this.state.authOk = false;
    }
  }

  static get EXTENSION_ID() {
    return EXTENSION_ID;
  }

  static get EXTENSION_NAME() {
    return EXTENSION_NAME;
  }

  static get extensionURL() {
    return extensionURL;
  }

  static set extensionURL(url) {
    extensionURL = url;
    entry.extensionURL = url;
  }
}

export {ExtensionBlocks as blockClass, entry};
