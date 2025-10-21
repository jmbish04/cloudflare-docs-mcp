declare module '../../tools.config.json' {
  interface ToolConfigEntry {
    type: string;
    description: string;
    endpoint?: string;
    command?: string;
    args?: string[];
    env_vars?: string[];
  }

  interface ToolsConfigFile {
    comment?: string;
    tools: Record<string, ToolConfigEntry>;
  }

  const value: ToolsConfigFile;
  export default value;
}
