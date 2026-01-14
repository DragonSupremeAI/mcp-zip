# ZIP MCP Server

中文 | [English](README.md)

## 项目简介

<a href="https://glama.ai/mcp/servers/@7gugu/zip-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@7gugu/zip-mcp/badge" />
</a>

ZIP MCP Server 是一个基于 fastMCP 和 zip.js 的压缩服务器，实现了 Model Context Protocol (MCP) 协议。本项目提供了全参数可控的 ZIP 压缩、解压缩和查询压缩包信息功能。
 除了默认的 `stdio` 传输模式（适用于 Cursor、Claude Desktop 等本地客户端），现在始终启用 **HTTP 传输**，可部署为远程服务供 Hugging Face Chat 等模型调用。服务启动时自动启动一个 HTTP 监听器，并暴露 REST API，包括健康检查、工具列举和调用接口。工具同时支持基于路径的文件操作和通过 base64 字符串进行的安全内存操作。

## 功能特点

- 支持文件和数据的压缩与解压缩
- 支持多文件打包压缩
- 提供压缩级别控制 (0‑9)
- 支持密码保护和加密强度设置
- 提供压缩包元数据查询功能
 - **HTTP 传输**（始终启用），提供 health 和调用端点
- **base64 工具**，适合远程调用时安全传输数据

## 项目结构

```bash
zip-mcp
├── src
│   ├── index.ts               # 应用程序入口点
│   ├── utils
│   │   └── compression.ts     # 压缩和解压缩功能实现
│   └── transport/http.ts      # （在 index.ts 中内嵌）HTTP 服务工具
├── tsconfig.json              # TypeScript 配置文件
├── package.json               # npm 配置文件
└── README.md                  # 项目文档
```

## 安装

您可以通过 npm 全局安装 ZIP MCP Server：

```bash
npm install -g zip-mcp
```

## MCP 配置

安装后，您可以在 MCP JSON 配置文件中配置 ZIP MCP：

```json
{
  "mcpServers": {
    "zip-mcp": {
      "command": "zip-mcp",
      "args": []
    }
  }
}
```

## 将 MCP JSON 配置到 AI 客户端 中

- Claude 客户端: [https://modelcontextprotocol.io/quickstart/user](https://modelcontextprotocol.io/quickstart/user)
- Raycast: 需要安装 MCP 插件
- Cursor: [https://docs.cursor.com/context/model-context-protocol#configuring-mcp-servers](https://docs.cursor.com/context/model-context-protocol#configuring-mcp-servers)

## MCP 工具说明

ZIP MCP Server 提供了以下工具，可通过 MCP 协议调用：

### 压缩工具 (compress)

将本地文件或目录压缩为 ZIP 文件。

**参数:**

- `input`: 要压缩的文件或目录路径（字符串或字符串数组）
- `output`: 输出 ZIP 文件的路径
- `options`: 压缩选项（可选）
  - `level`: 压缩级别 (0‑9，默认为 5)
  - `password`: 密码保护
  - `encryptionStrength`: 加密强度 (1‑3)
  - `overwrite`: 是否覆盖现有文件 (布尔值)

**返回:**

- 成功: 包含成功信息的文本内容
- 失败: 包含错误信息的文本内容

### 解压工具 (decompress)

解压本地 ZIP 文件到指定目录。

**参数:**

- `input`: ZIP 文件路径
- `output`: 输出目录路径
- `options`: 解压选项（可选）
  - `password`: 解压密码
  - `overwrite`: 是否覆盖现有文件 (布尔值)
  - `createDirectories`: 是否创建不存在的目录 (布尔值)

**返回:**

- 成功: 包含解压结果信息的文本内容
- 失败: 包含错误信息的文本内容

### ZIP 信息工具 (getZipInfo)

获取本地 ZIP 文件的元数据信息。

**参数:**

- `input`: ZIP 文件路径
- `options`: 选项（可选）
  - `password`: 解压密码

**返回:**

- 成功: 包含 ZIP 文件详细信息的文本内容
- 失败: 包含错误信息的文本内容

### 测试工具 (echo)

返回输入的消息，用于测试服务是否正常运行。

**参数:**

- `message`: 要返回的消息

**返回:**

- 包含输入消息和当前时间戳的文本内容

### base64 压缩工具 (compressBytes)

将多个内存中的文件（以 base64 表示）压缩为 ZIP 档案，返回 base64 字符串。

**参数:**

- `files`: 由 `{ name: string, dataBase64: string }` 组成的数组
- `options`: 压缩选项（可选）
  - `level`: 压缩级别 (0‑9，默认为 5)
  - `password`: 密码保护
  - `encryptionStrength`: 加密强度 (1‑3)

**返回:**

- base64 编码的 ZIP 字符串

### base64 解压工具 (decompressBytes)

将 base64 编码的 ZIP 档案解压，返回文件数组，文件数据以 base64 表示。

**参数:**

- `zipDataBase64`: base64 编码的 ZIP 文件
- `options`: 解压选项（可选）
  - `password`: 解压密码

**返回:**

- JSON 字符串数组，其中每项包含 `{ name: string, dataBase64: string }`

### base64 ZIP 信息工具 (getZipInfoBytes)

获取 base64 ZIP 档案的元数据信息。

**参数:**

- `zipDataBase64`: base64 编码的 ZIP 文件
- `options`: 选项（可选）
  - `password`: 解压密码

**返回:**

- JSON 字符串的元数据，包括总文件数、总大小、压缩后大小、压缩率和各文件详情

## 示例

使用 MCP 客户端调用工具示例：

```javascript
// 压缩文件
await client.executeTool("compress", {
  input: "/path/to/files/or/directory",
  output: "/path/to/output.zip",
  options: {
    level: 9,
    comment: "测试压缩",
    password: "secret",
    overwrite: true,
  },
});

// 解压文件
await client.executeTool("decompress", {
  input: "/path/to/archive.zip",
  output: "/path/to/extract/directory",
  options: {
    password: "secret",
    overwrite: true,
    createDirectories: true,
  },
});

// 获取 ZIP 信息
await client.executeTool("getZipInfo", {
  input: "/path/to/archive.zip",
  options: {
    password: "secret",
  },
});

// 测试服务
await client.executeTool("echo", {
  message: "Hello, ZIP MCP Server!",
});

// 内存文件压缩 (base64)
await client.executeTool("compressBytes", {
  files: [
    { name: "a.txt", dataBase64: btoa("hello world") },
    { name: "b.txt", dataBase64: btoa("foo bar") },
  ],
});

// 解压 base64 ZIP
const zippedBase64 = "...";
await client.executeTool("decompressBytes", {
  zipDataBase64: zippedBase64,
});

// 获取 base64 ZIP 信息
await client.executeTool("getZipInfoBytes", {
  zipDataBase64: zippedBase64,
});
```

## HTTP 模式

服务器在启动时始终启用一个 HTTP 监听器，并保持默认的 `stdio` 传输。无论是否配置环境变量，HTTP 接口都会自动开放。这使得服务既可以作为本地 MCP 服务器运行，也可以通过网络供 Hugging Face Chat 等远程客户端调用。

HTTP 服务监听的端口通过以下环境变量按顺序决定：

- `PORT` – 平台（如 Hugging Face Spaces、Cloud Run）通常提供此变量
- `MCP_HTTP_PORT` – 用于自定义 MCP 服务端口
- `HTTP_PORT` – 传统端口配置
- 如果都未设置，默认使用 `3000`

例如，将服务器运行在端口 8080：

```bash
# 在端口 8080 启动 HTTP 监听（stdio 仍然可用）
PORT=8080 npx tsx src/index.ts
```

HTTP 模式下可用的端点包括：

- `GET /health` – 返回服务名称、版本和工具列表
- `GET /tools` – 返回注册的工具名称
- `POST /invoke/<toolName>` – 调用指定工具，请求体为 JSON，包含工具参数；响应体为工具结果

这些端点使得将 ZIP MCP Server 作为远程 MCP 服务器集成到 Hugging Face Chat 成为可能。用户可以在聊天界面的 “MCP tools” 部分添加服务的 URL（例如 `https://your-space.hf.space`）。

## 联系方式

- 邮箱: [gz7gugu@qq.com](mailto:gz7gugu@qq.com)
- 博客: [https://7gugu.com](https://7gugu.com)