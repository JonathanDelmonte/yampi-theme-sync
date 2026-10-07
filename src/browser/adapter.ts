import type {Adapter, Context} from '../core/model';
import type {Command} from './bridge';
export type RPC = (request: {action?: string; command?: Command}) => Promise<unknown>;
export class BrowserAdapter implements Adapter {
  private expected?: Context;
  constructor(readonly rpc: RPC) {}
  async context(): Promise<Context> {
    const context = await this.rpc({command: {op: 'context', context: this.expected}}) as Context;
    this.expected = context;
    return context;
  }
  async inventory(): Promise<string[]> {return await this.rpc({command: {op: 'inventory', context: this.expected}}) as string[];}
  async read(path: string): Promise<string> {return await this.rpc({command: {op: 'read', context: this.expected, path}}) as string;}
  async readAsset(path: string): Promise<Uint8Array> {
    const encoded = await this.rpc({command: {op: 'readAsset', context: this.expected, path}}) as string;
    return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  }
  async write(path: string, expected: string, content: string): Promise<void> {
    // An open editor tab can hold an old server version. Fetch again before each write.
    await this.refresh();
    await this.rpc({command: {op: 'write', context: this.expected, path, expected, content}});
  }
  async refresh(): Promise<void> {
    await this.context(); // Refuse a reload when the editor has unsaved changes or changed shops.
    await this.rpc({action: 'refresh'});
    const start = Date.now();
    for (;;) {
      try {await this.context(); return;} catch (e) {
        if (Date.now() - start > 25000) throw e;
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }
}
