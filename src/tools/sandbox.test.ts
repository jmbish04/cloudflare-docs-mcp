import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sandboxMethods, getSandbox } = vi.hoisted(() => {
  const sandboxMethods = {
    exec: vi.fn(),
    execStream: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    mkdir: vi.fn(),
    deleteFile: vi.fn(),
    startProcess: vi.fn(),
    listProcesses: vi.fn(),
    killProcess: vi.fn(),
    killAllProcesses: vi.fn(),
    exposePort: vi.fn(),
    unexposePort: vi.fn(),
    createCodeContext: vi.fn(),
    runCode: vi.fn(),
    deleteCodeContext: vi.fn(),
    gitCheckout: vi.fn(),
  };
  const getSandbox = vi.fn(() => sandboxMethods);
  return { sandboxMethods, getSandbox };
});

vi.mock('@cloudflare/sandbox', () => ({ getSandbox }));

const { SandboxTool } = await import('./sandbox');

const namespace = {} as any;

describe('SandboxTool', () => {
  beforeEach(() => {
    Object.values(sandboxMethods).forEach((method) => (method as any).mockReset());
  });

  it('requires namespace and id', () => {
    expect(() => new SandboxTool(namespace, '')).toThrowError('Sandbox namespace and ID are required.');
  });

  it('delegates exec calls', async () => {
    sandboxMethods.exec.mockResolvedValue({ stdout: 'ok' });
    const tool = new SandboxTool(namespace, 'id');
    const result = await tool.exec('ls');
    expect(getSandbox).toHaveBeenCalledWith(namespace, 'id');
    expect(sandboxMethods.exec).toHaveBeenCalledWith('ls');
    expect(result).toEqual({ stdout: 'ok' });
  });

  it('forwards runScript and cleans up', async () => {
    sandboxMethods.exec.mockResolvedValue({ stdout: 'done' });
    const tool = new SandboxTool(namespace, 'id');
    const result = await tool.runScript('script.js', 'console.log(1);');
    expect(sandboxMethods.writeFile).toHaveBeenCalledWith('script.js', 'console.log(1);', undefined);
    expect(sandboxMethods.exec).toHaveBeenCalledWith('node script.js');
    expect(sandboxMethods.deleteFile).toHaveBeenCalledWith('script.js');
    expect(result).toEqual({ stdout: 'done' });
  });

  it('exposes all helpers', async () => {
    const tool = new SandboxTool(namespace, 'id');
    await tool.execStream('ls');
    await tool.writeFile('file.txt', 'data', { encoding: 'utf8' });
    await tool.readFile('file.txt');
    await tool.mkdir('dir');
    await tool.deleteFile('file.txt');
    await tool.startProcess('npm start', { cwd: '/tmp' });
    await tool.listProcesses();
    await tool.killProcess('123');
    await tool.killAllProcesses();
    await tool.exposePort(8080, { name: 'app' });
    await tool.unexposePort(8080);
    await tool.createCodeContext({ language: 'javascript' });
    await tool.runCode('ctx', 'code');
    await tool.deleteCodeContext('ctx');
    await tool.cloneRepo('https://example.com', { branch: 'main' });

    expect(sandboxMethods.execStream).toHaveBeenCalledWith('ls');
    expect(sandboxMethods.writeFile).toHaveBeenCalledWith('file.txt', 'data', { encoding: 'utf8' });
    expect(sandboxMethods.readFile).toHaveBeenCalledWith('file.txt', undefined);
    expect(sandboxMethods.mkdir).toHaveBeenCalledWith('dir', { recursive: true });
    expect(sandboxMethods.startProcess).toHaveBeenCalledWith('npm start', { cwd: '/tmp' });
    expect(sandboxMethods.listProcesses).toHaveBeenCalled();
    expect(sandboxMethods.killProcess).toHaveBeenCalledWith('123');
    expect(sandboxMethods.killAllProcesses).toHaveBeenCalled();
    expect(sandboxMethods.exposePort).toHaveBeenCalledWith(8080, { name: 'app' });
    expect(sandboxMethods.unexposePort).toHaveBeenCalledWith(8080);
    expect(sandboxMethods.createCodeContext).toHaveBeenCalledWith({ language: 'javascript' });
    expect(sandboxMethods.runCode).toHaveBeenCalledWith('ctx', 'code');
    expect(sandboxMethods.deleteCodeContext).toHaveBeenCalledWith('ctx');
    expect(sandboxMethods.gitCheckout).toHaveBeenCalledWith('https://example.com', { branch: 'main' });
  });
});
