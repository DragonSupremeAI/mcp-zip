# ZIP MCP Server

[中文](README_CN.md) | English

## Project Introduction

<a href="https://glama.ai/mcp/servers/@7gugu/zip-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@7gugu/zip-mcp/badge" />
</a>

ZIP MCP Server is a compression server based on fastMCP and zip.js, implementing the Model Context Protocol (MCP). This project provides fully parameter‑controlled ZIP compression, decompression, and query compression package information functions.
In addition to the default stdio transport (for local AI clients such as Cursor, Claude Desktop, etc.), this repository also supports **HTTP transport** to be consumed by remote AI services like Hugging Face Chat. When launched with an HTTP port environment variable the server exposes a small REST API with health, tool listing, and tool invocation endpoints. Tools now support both path‑based file operations and safe in‑memory operations via base64 encoded data.

## Features

- Supports compression and decompression of files and data
- Supports multi‑file packaging compression
- Provides compression level control (0‑9)
- Supports password protection and encryption strength settings
- Provides query function for compressed package metadata
 - **HTTP transport** always available, with health and invocation endpoints
- **Base64 tools** for safe remote operation without exposing the server filesystem

## Project Structure

```bash
zip-mcp
├── src
│   ├── index.ts               # Application entry point
│   ├── utils
│   │   └── compression.ts     # Compression and decompression implementation
│   └── transport/http.ts      # (inlined in index.ts) HTTP server utilities
├── tsconfig.json              # TypeScript configuration file
├── package.json               # npm configuration file
└── README.md                  # Project documentation
```

## Installation

You can install ZIP MCP Server globally using npm:

```bash
npm install -g zip-mcp
```

## MCP Configuration

After installation, you can configure ZIP MCP in your MCP JSON configuration:

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

## Configure the MCP JSON in the AI Client

- Claude Client: [https://modelcontextprotocol.io/quickstart/user](https://modelcontextprotocol.io/quickstart/user)
- Raycast: requires installing the MCP plugin
- Cursor: [https://docs.cursor.com/context/model-context-protocol#configuring-mcp-servers](https://docs.cursor.com/context/model-context-protocol#configuring-mcp-servers)

## MCP Tool Description

ZIP MCP Server provides the following tools, which can be called through the MCP protocol:

### Compression Tool (compress)

Compress local files or directories into a ZIP file.

**Parameters:**

- `input`: Path of the file or directory to be compressed (string or string array)
- `output`: Path of the output ZIP file
- `options`: Compression options (optional)
  - `level`: Compression level (0‑9, default is 5)
  - `password`: Password protection
  - `encryptionStrength`: Encryption strength (1‑3)
  - `overwrite`: Whether to overwrite existing files (boolean)

**Returns:**

- Success: Text content containing success information
- Failure: Text content containing error information

### Decompression Tool (decompress)

Decompress local ZIP files to the specified directory.

**Parameters:**

- `input`: Path of the ZIP file
- `output`: Path of the output directory
- `options`: Decompression options (optional)
  - `password`: Decompression password
  - `overwrite`: Whether to overwrite existing files (boolean)
  - `createDirectories`: Whether to create non‑existent directories (boolean)

**Returns:**

- Success: Text content containing decompression result information
- Failure: Text content containing error information

### ZIP Info Tool (getZipInfo)

Get metadata information of local ZIP files.

**Parameters:**

- `input`: Path of the ZIP file
- `options`: Options (optional)
  - `password`: Decompression password

**Returns:**

- Success: Text content containing detailed information of the ZIP file, including:
  - Total number of files
  - Total size
  - Compressed size
  - Compression ratio
  - Detailed information of each file
- Failure: Text content containing error information

### Test Tool (echo)

Returns the input message to test if the service is running normally.

**Parameters:**

- `message`: Message to be returned

**Returns:**

- Text content containing the input message and current timestamp

### Compression Tool with Base64 (compressBytes)

Compress multiple in‑memory files represented as base64 strings into a ZIP archive. Returns the ZIP archive as a base64 string.

**Parameters:**

- `files`: array of objects with `{ name: string, dataBase64: string }`
- `options`: Compression options (optional)
  - `level`: Compression level (0‑9, default is 5)
  - `password`: Password protection
  - `encryptionStrength`: Encryption strength (1‑3)

**Returns:**

- Base64 encoded ZIP archive (string)

### Decompression Tool with Base64 (decompressBytes)

Decompress a base64‑encoded ZIP archive and return an array of file objects with base64 data.

**Parameters:**

- `zipDataBase64`: Base64 encoded ZIP archive
- `options`: Decompression options (optional)
  - `password`: Decompression password

**Returns:**

- JSON stringified array of `{ name: string, dataBase64: string }`

### ZIP Info Tool with Base64 (getZipInfoBytes)

Get metadata information of a ZIP archive provided as a base64 string.

**Parameters:**

- `zipDataBase64`: Base64 encoded ZIP archive
- `options`: Options (optional)
  - `password`: Decompression password

**Returns:**

- JSON stringified metadata, including total files, total size, compressed size, compression ratio and details per file.

## Examples

Examples of calling tools using the MCP client:

```javascript
// Compress files
await client.executeTool("compress", {
  input: "/path/to/files/or/directory",
  output: "/path/to/output.zip",
  options: {
    level: 9,
    comment: "Test compression",
    password: "secret",
    overwrite: true,
  },
});

// Decompress files
await client.executeTool("decompress", {
  input: "/path/to/archive.zip",
  output: "/path/to/extract/directory",
  options: {
    password: "secret",
    overwrite: true,
    createDirectories: true,
  },
});

// Get ZIP info
await client.executeTool("getZipInfo", {
  input: "/path/to/archive.zip",
  options: {
    password: "secret",
  },
});

// Test service
await client.executeTool("echo", {
  message: "Hello, ZIP MCP Server!",
});

// Compress in‑memory files (base64)
await client.executeTool("compressBytes", {
  files: [
    { name: "a.txt", dataBase64: btoa("hello world") },
    { name: "b.txt", dataBase64: btoa("foo bar") },
  ],
});

// Decompress base64 archive
const zippedBase64 = "..."; // base64 string returned by compressBytes
await client.executeTool("decompressBytes", {
  zipDataBase64: zippedBase64,
});

// Get info of base64 archive
await client.executeTool("getZipInfoBytes", {
  zipDataBase64: zippedBase64,
});
```

## HTTP Mode

The server always starts an HTTP listener in addition to the default `stdio` transport. This makes the service available both as a local stdio MCP server and as a remote HTTP MCP server without any configuration. The HTTP port is determined by the following environment variables (checked in order):

- `PORT` – commonly provided by platforms such as Hugging Face Spaces and Cloud Run
- `MCP_HTTP_PORT` – custom override for the MCP server
- `HTTP_PORT` – legacy override
- If none are set, the default port `3000` is used

For example, to run the server on port `8080`:

```bash
# Start with HTTP listener on port 8080 (stdio remains enabled)
PORT=8080 npx tsx src/index.ts
```

The HTTP server exposes the following endpoints:

- `GET /health` – Returns the server name, version and list of tools
- `GET /tools` – Returns the list of registered tool names
- `POST /invoke/<toolName>` – Invokes a tool. The request body must be JSON containing the tool arguments. The response body contains the tool result.

These endpoints allow you to integrate ZIP MCP Server as a remote MCP tool provider in services like Hugging Face Chat. In the chat UI, users can add this server in the “MCP tools” section by specifying the URL (e.g. `https://your-space.hf.space`) where the service is deployed.
