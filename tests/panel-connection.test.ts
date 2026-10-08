import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {PanelConnection, type PanelPort} from '../src/browser/panel-connection';

function setup() {
  const ports: Array<PanelPort & {ended: () => void}> = [];
  const runtime = {
    sendMessage: vi.fn(async (message: unknown) => (message as {action?: string}).action === 'session' ? {ok: true, value: 'fictitious-session'} : {ok: true, value: null}),
    connect: vi.fn(() => {
      const port = {ended: () => {}, onDisconnect: {addListener: (fn: () => void) => {port.ended = fn;}}, disconnect: vi.fn(() => port.ended())};
      ports.push(port); return port;
    })
  };
  const disconnected = vi.fn(), connection = new PanelConnection(runtime, disconnected);
  return {ports, runtime, disconnected, connection};
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {vi.clearAllTimers(); vi.useRealTimers();});
describe('conexão persistente e reconexão sem repetir gravações', () => {
  test('faz heartbeat autenticado enquanto aberto e para ao fechar', async () => {
    const {connection, runtime, disconnected} = setup(); await connection.connect();
    await vi.advanceTimersByTimeAsync(40000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith({session: 'fictitious-session', action: 'heartbeat'});
    connection.close(); await vi.advanceTimersByTimeAsync(40000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(3); expect(disconnected).not.toHaveBeenCalled();
  });
  test('reconecta depois de desconexão e ignora o evento do port antigo', async () => {
    const {connection, runtime, ports, disconnected} = setup(); await connection.connect();
    ports[0].ended(); expect(disconnected).toHaveBeenCalledTimes(1);
    await expect(connection.request({command: {op: 'write'}})).rejects.toThrow('Conexão encerrada');
    await connection.connect(); expect(runtime.connect).toHaveBeenCalledTimes(2);
    ports[0].ended(); expect(disconnected).toHaveBeenCalledTimes(1);
    await connection.request({command: {op: 'context'}});
    expect(runtime.sendMessage).toHaveBeenLastCalledWith({session: 'fictitious-session', command: {op: 'context'}});
  });
  test('erro de gravação é preservado e o comando nunca é reenviado', async () => {
    const {connection, runtime} = setup(); await connection.connect();
    runtime.sendMessage.mockRejectedValueOnce(new Error('Falha fictícia durante o envio'));
    await expect(connection.request({command: {op: 'write'}})).rejects.toThrow('Falha fictícia durante o envio');
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
  test('heartbeat que falha fecha o port e permite nova sessão', async () => {
    const {connection, runtime, disconnected, ports} = setup(); await connection.connect();
    runtime.sendMessage.mockRejectedValueOnce(new Error('Worker encerrado'));
    await vi.advanceTimersByTimeAsync(20000); expect(disconnected).toHaveBeenCalledTimes(1);
    expect(ports[0].disconnect).toHaveBeenCalledTimes(1);
    await connection.connect(); expect(runtime.connect).toHaveBeenCalledTimes(2);
  });
  test('reutiliza o mesmo port e rejeita sessão sem autenticação', async () => {
    const {connection, runtime} = setup(); await connection.connect(); await connection.connect();
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    runtime.sendMessage.mockResolvedValueOnce({ok: false, value: null});
    await expect(connection.connect()).rejects.toThrow('Não foi possível abrir a sessão');
  });
});
