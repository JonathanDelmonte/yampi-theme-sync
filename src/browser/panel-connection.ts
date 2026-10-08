import type {RPC} from './adapter';
type Reply = {ok: boolean; value?: unknown; error?: string};
export interface PanelPort {
  disconnect(): void;
  onDisconnect: {addListener(listener: () => void): void};
}
export interface PanelRuntime {
  sendMessage(message: unknown): Promise<Reply>;
  connect(info: {name: string}): PanelPort;
}
export class PanelConnection {
  token?: string;
  private port?: PanelPort;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private runtime: PanelRuntime, private disconnected: () => void) {}
  async connect(): Promise<void> {
    const reply = await this.runtime.sendMessage({action: 'session'});
    if (!reply?.ok || typeof reply.value !== 'string') throw new Error(reply?.error || 'Não foi possível abrir a sessão.');
    if (this.port && this.token === reply.value) return;
    this.close(); this.token = reply.value;
    const port = this.runtime.connect({name: `panel:${this.token}`}); this.port = port;
    const ended = () => {
      if (this.port !== port) return;
      this.close(); this.disconnected();
    };
    port.onDisconnect.addListener(ended);
    // Opening a port alone does not keep a MV3 worker alive. Ping only while its panel is open.
    this.timer = setInterval(() => {void this.request({action: 'heartbeat'}).catch(ended);}, 20000);
  }
  request: RPC = async request => {
    if (!this.port || !this.token) throw new Error('Conexão encerrada. Tente conectar novamente no painel.');
    const reply = await this.runtime.sendMessage({session: this.token, ...request});
    if (!reply?.ok) throw new Error(reply?.error || 'Não foi possível comunicar com a aba do editor.');
    return reply.value;
  };
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const port = this.port; this.port = undefined;
    port?.disconnect();
  }
}
