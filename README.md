
# MCP ZIP Server

**MCP ZIP Server** is a **Model Context Protocol (MCP) tool server** that provides ZIP compression, decompression, and archive inspection for AI agents.

It is designed to work both:

- **Locally** (via MCP `stdio`, e.g. Cursor, Claude Desktop)
    
- **Remotely** (via HTTP, e.g. Hugging Face Chat MCP tools)
    

The server supports **safe in-memory base64 tools** for hosted environments and **filesystem-based tools** for local use.

---

**MCP-zip is:**

- A headless MCP tool server
    
- Suitable for Hugging Face Chat MCP tools
    
- Suitable for Docker-based deployment
    
- Stateless and model-friendly

---

## Features

- ZIP compression and decompression
    
- Multi-file and directory support
    
- Compression level control (0–9)
    
- Password-protected archives
    
- ZIP metadata inspection
    
- **Always-on HTTP transport** (for hosted MCP)
    
- **stdio transport** (for local MCP clients)
    
- **Base64 tools** for safe remote operation (no filesystem access required)
    

---

## Transports

MCP ZIP Server supports **two transports simultaneously**:

### 1. MCP stdio (local)

Used by:

- Cursor
    
- Claude Desktop
    
- Raycast MCP
    

### 2. HTTP (remote)

Used by:

- Hugging Face Chat MCP tools
    
- Hosted agents
    
- Docker / Kubernetes deployments
    

> The HTTP server **always starts by default**.

---

## HTTP Server Behavior

On startup, the server:

1. Starts MCP over `stdio`
    
2. Starts an HTTP server on a configurable port
    

### Port selection (in order):

1. `PORT` (Hugging Face Spaces standard)
    
2. `MCP_HTTP_PORT`
    
3. `HTTP_PORT`
    
4. Fallback: `3000`
    

---

## HTTP Endpoints

|Endpoint|Method|Description|
|---|---|---|
|`/health`|GET|Server name, version, tool list|
|`/tools`|GET|List of registered tools|
|`/invoke/<tool>`|POST|Invoke a tool with JSON arguments|

---

## Hugging Face Spaces (Docker) Setup

This is the **recommended way** to host the MCP Server for Hugging Face Chat.

### 1. Create a Docker Space

- Go to **Hugging Face → Spaces**
    
- Click **New Space**
    
- Select **Docker**
    
- Choose your repo branch (e.g. `hfdocker`)
    

---

### 2. Minimal Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "dist/index.js"]
```

> Hugging Face automatically injects `PORT`.

---

### 3. Space Settings

In **Space → Settings**:

- No secrets required
    
- No GPU required
    
- Visibility: public or private
    

---

### 4. Verify the Space

Once running, open:

```
https://<your-space>.hf.space/health
```

Expected response:

```json
{
  "name": "MCP ZIP Server",
  "version": "1.0.x",
  "tools": ["compress", "decompress", "getZipInfo", "compressBytes", ...]
}
```

---

### 5. Add to Hugging Face Chat MCP Tools

1. Open **Hugging Face Chat**
    
2. Go to **MCP Tools**
    
3. Click **Add server**
    
4. Enter:
    
    - **Name:** MCP ZIP
        
    - **URL:** `https://<your-space>.hf.space`
        
5. Save
    

ZIP tools are now available to models.

---

## Local MCP Setup (Cursor / Claude Desktop)

Install globally:

```bash
npm install -g mcp-zip
```

Add to MCP config:

```json
{
  "mcpServers": {
    "mcp-zip": {
      "command": "mcp-zip",
      "args": []
    }
  }
}
```

---

## Tool Overview

### Filesystem tools (local only)

- `compress`
    
- `decompress`
    
- `getZipInfo`
    

These operate on local paths and are intended for **local MCP clients only**.

---

### Base64 tools (safe for hosted use)

These are **recommended for Hugging Face Chat**.

#### `compressBytes`

Compress in-memory files.

```json
{
  "files": [
    { "name": "a.txt", "dataBase64": "aGVsbG8=" }
  ]
}
```

Returns: base64 ZIP archive.

---

#### `decompressBytes`

Decompress a base64 ZIP archive.

```json
{
  "zipDataBase64": "UEsDB..."
}
```

Returns: array of `{ name, dataBase64 }`.

---

#### `getZipInfoBytes`

Inspect a base64 ZIP archive.

```json
{
  "zipDataBase64": "UEsDB..."
}
```

Returns: metadata JSON.

---

## Security Notes

- Hosted deployments should **prefer base64 tools**
    
- Filesystem tools should not be exposed to untrusted users
    
- ZIP bomb protection and size limits are recommended at the platform level
    

---

## Versioning

- HTTP + base64 support: `>=1.0.3`
    
