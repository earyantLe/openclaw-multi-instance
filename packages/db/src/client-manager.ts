import { Model } from 'objection';
import { Instance } from './index';

// Client Model - 定义支持的 AI 客户端类型
export class Client extends Model {
  id!: string;
  tenantId!: string;
  name!: string;
  clientType!: string;
  command!: string;
  configDir?: string;
  workspaceDir?: string;
  profileSupport!: boolean;
  profileFormat?: string;
  gatewayCommand?: string;
  envTemplate?: Record<string, any>;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'clients';
  static idColumn = 'id';

  static relationMappings = {
    instances: {
      relation: Model.HasManyRelation,
      modelClass: () => Instance,
      join: {
        from: 'clients.id',
        to: 'instances.clientId'
      }
    }
  };
}

// ClientManager - 管理不同客户端的启动和配置
export class ClientManager {
  private clients: Map<string, Client> = new Map();

  /**
   * 注册客户端配置
   */
  async registerClient(client: Client): Promise<void> {
    this.clients.set(client.name, client);
  }

  /**
   * 加载所有客户端配置
   */
  async loadClients(tenantId?: string): Promise<void> {
    try {
      const query = Client.query().where({ is_active: true });
      if (tenantId) {
        query.andWhere({ tenantId });
      }
      const clients = await query;
      clients.forEach((c) => this.clients.set(c.name, c));
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  }

  /**
   * 获取客户端配置
   */
  async getClient(clientNameOrType: string): Promise<Client | undefined> {
    // 先按名称查找
    const byName = this.clients.get(clientNameOrType);
    if (byName) return byName;

    // 再按类型查找
    try {
      const byType = await Client.query().findOne({
        client_type: clientNameOrType,
        is_active: true
      });
      return byType || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 构建启动命令
   */
  async buildCommand(instance: Instance): Promise<string> {
    const client = await this.getClient(instance.clientType);

    if (!client) {
      // 默认使用 Claude Code 格式
      const profileName = `instance_${instance.id}`;
      return `openclaw --profile ${profileName} gateway --port ${instance.port} --allow-unconfigured`;
    }

    const profileName = instance.profile || `instance_${instance.id}`;
    const port = instance.port;

    if (client.profileSupport && client.profileFormat) {
      const profileArg = client.profileFormat.replace('{name}', profileName);
      const gateway = client.gatewayCommand
        ? client.gatewayCommand.replace('{port}', String(port))
        : '';
      return `${client.command} ${profileArg} ${gateway}`.trim();
    }

    // 不支持 profile 的客户端，使用环境变量
    return `${client.command} ${client.gatewayCommand || ''}`.trim();
  }

  /**
   * 构建环境变量
   */
  async buildEnv(instance: Instance): Promise<Record<string, string>> {
    const client = await this.getClient(instance.clientType);

    const baseEnv: Record<string, string> = {
      OPENCLAW_PORT: String(instance.port),
      OPENCLAW_INSTANCE_ID: String(instance.id),
      OPENCLAW_INSTANCE_NAME: instance.name,
      OPENCLAW_WORKSPACE: instance.workspace || ''
    };

    // 合并客户端特定的环境变量
    const templateEnv = client?.envTemplate || {};
    const instanceEnv = instance.envConfig || {};

    // 替换模板变量
    const processedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateEnv)) {
      if (typeof value === 'string') {
        processedEnv[key] = value
          .replace('{port}', String(instance.port))
          .replace('{workspace}', instance.workspace || '')
          .replace('{profile}', instance.profile);
      } else {
        processedEnv[key] = String(value);
      }
    }

    return { ...baseEnv, ...processedEnv, ...instanceEnv };
  }

  /**
   * 获取客户端配置模板
   */
  static getDefaultClients(): Array<{
    tenantId: string;
    name: string;
    clientType: string;
    command: string;
    profileSupport: boolean;
    profileFormat: string | null;
    gatewayCommand: string | null;
    configDir: string;
    workspaceDir: string;
    envTemplate: Record<string, string> | {};
    isActive: boolean;
  }> {
    return [
      {
        tenantId: '',
        name: 'Claude Code',
        clientType: 'claude-code',
        command: 'openclaw',
        profileSupport: true,
        profileFormat: '--profile {name}',
        gatewayCommand: 'gateway --port {port} --allow-unconfigured',
        configDir: '~/.claude',
        workspaceDir: '~/.claude/projects',
        envTemplate: {},
        isActive: true
      },
      {
        tenantId: '',
        name: 'Qclaw',
        clientType: 'qclaw',
        command: 'qclaw',
        profileSupport: true,
        profileFormat: '--profile {name}',
        gatewayCommand: 'serve --port {port}',
        configDir: '~/.qclaw',
        workspaceDir: '~/.qclaw/workspaces',
        envTemplate: {},
        isActive: true
      },
      {
        tenantId: '',
        name: 'WorkBuddy',
        clientType: 'workbuddy',
        command: 'workbuddy',
        profileSupport: false,
        profileFormat: null,
        gatewayCommand: 'start --port {port}',
        configDir: '~/.workbuddy',
        workspaceDir: '~/.workbuddy/projects',
        envTemplate: {
          WORKBUDDY_PORT: '{port}',
          WORKBUDDY_WORKSPACE: '{workspace}'
        },
        isActive: true
      },
      {
        tenantId: '',
        name: 'Aider',
        clientType: 'aider',
        command: 'aider',
        profileSupport: true,
        profileFormat: '--model {model} --dir {workspace}',
        gatewayCommand: null,
        configDir: '~/.aider',
        workspaceDir: 'project-specific',
        envTemplate: {},
        isActive: true
      }
    ];
  }
}

// 导出 ClientManager
export default {
  Client,
  Instance,
  ClientManager
};
