const EXTENSION_ID = 'xcratchLineWebhook';
const EXTENSION_NAME = 'LINE Webhook';
const EXTENSION_DESCRIPTION = 'Xcratch から LINE にメッセージを送る';
const STATUS_READY = 'ready';
const STATUS_NOT_READY = 'not ready';

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
  lastStatus: STATUS_NOT_READY,
  lastResponse: ''
});

class ExtensionBlocks {
  constructor(runtime) {
    this.runtime = runtime;
    this.state = defaultState();
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
          opcode: 'setClassPassword',
          func: 'setClassPassword',
          blockType: 'command',
          text: '利用パスワードを [PASSWORD] にする',
          arguments: {
            PASSWORD: {
              type: 'string',
              defaultValue: 'class-2026-a'
            }
          }
        },
        {
          opcode: 'setUserCode',
          func: 'setUserCode',
          blockType: 'command',
          text: '自分の利用コードを [USER_CODE] にする',
          arguments: {
            USER_CODE: {
              type: 'string',
              defaultValue: 's8k2mz4q'
            }
          }
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
          text: '[MESSAGE] を 利用コード [USER_CODE] に送る',
          arguments: {
            MESSAGE: {
              type: 'string',
              defaultValue: '実験成功'
            },
            USER_CODE: {
              type: 'string',
              defaultValue: 's8k2mz4q'
            }
          }
        },
        {
          opcode: 'isReady',
          func: 'isReady',
          blockType: 'boolean',
          text: 'LINE送信の準備ができている'
        },
        {
          opcode: 'getLastStatus',
          func: 'getLastStatus',
          blockType: 'reporter',
          text: 'LINE送信の状態'
        },
        {
          opcode: 'getLastResponse',
          func: 'getLastResponse',
          blockType: 'reporter',
          text: 'LINE送信の応答'
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

  setUserCode(args) {
    this.state.userCode = String(args.USER_CODE || '').trim().toLowerCase();
    this.#refreshStatus();
  }

  async sendMessage(args) {
    return this.#postMessage(String(args.MESSAGE || ''), this.state.userCode);
  }

  async sendMessageToCode(args) {
    return this.#postMessage(
      String(args.MESSAGE || ''),
      String(args.USER_CODE || '').trim().toLowerCase()
    );
  }

  isReady() {
    return this.#isConfigured();
  }

  getLastStatus() {
    return this.state.lastStatus;
  }

  getLastResponse() {
    return this.state.lastResponse;
  }

  async #postMessage(message, userCode) {
    if (!this.#isConfigured()) {
      this.state.lastStatus = 'error';
      this.state.lastResponse = 'Webhook URL / password / userCode が未設定です';
      return;
    }

    if (!userCode) {
      this.state.lastStatus = 'error';
      this.state.lastResponse = '利用コードが空です';
      return;
    }

    try {
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
      this.state.lastStatus = response.ok ? 'sent' : 'error';
      this.state.lastResponse = data.message || response.statusText || 'unknown';
    } catch (error) {
      this.state.lastStatus = 'error';
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
