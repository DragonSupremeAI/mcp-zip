import { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  compressData,
  decompressData,
  getZipInfo,
  DecompressionOptions,
  ZipInfo,
} from "./utils/compression.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as http from "http";
import { Buffer } from "buffer";

// Create FastMCP server instance
const server = new FastMCP({
  name: "ZIP MCP Server",
  version: "1.0.3",
});

// Registry of tools for HTTP transport
interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: any) => Promise<any>;
}
const toolRegistry: Record<string, ToolDefinition> = {};

/**
 * Helper wrapper around server.addTool to also record the tool in our registry.
 * This allows the HTTP server to dispatch requests without relying on private
 * internals of the FastMCP server.
 */
const addTool = (tool: {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}) => {
  server.addTool(tool);
  toolRegistry[tool.name] = {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: tool.execute,
  };
};

/**
 * Execute a tool by name. Throws an error if the tool is not registered.
 */
const executeTool = async (name: string, args: any) => {
  const tool = toolRegistry[name];
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return await tool.execute(args);
};

/**
 * List all registered tool names.
 */
const listTools = () => Object.keys(toolRegistry);

/**
 * Start a simple HTTP server that exposes the registered tools over HTTP.
 * - GET /health returns basic service information.
 * - GET /tools returns the list of tool names.
 * - POST /invoke/:toolName invokes a tool with JSON arguments and returns the result.
 */
function startHttpServer(port: number) {
  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Health check endpoint
    if (req.method === "GET" && url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          name: (server as any)["name"],
          version: (server as any)["version"],
          tools: listTools(),
        })
      );
      return;
    }
    // List tools
    if (req.method === "GET" && url.pathname === "/tools") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ tools: listTools() }));
      return;
    }
    // Invoke tool
    if (req.method === "POST" && url.pathname.startsWith("/invoke/")) {
      const parts = url.pathname.split("/");
      const toolName = parts[2];
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const args = body ? JSON.parse(body) : {};
          const result = await executeTool(toolName, args);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
      });
      return;
    }
    // Unknown endpoint
    res.statusCode = 404;
    res.end();
  });
  httpServer.listen(port, () => {
    console.log(`HTTP MCP server listening on port ${port}`);
  });
}

// General error handling function
const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  } else {
    return "Unknown error";
  }
};

// Check if file or directory exists
const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// Get file list (including subdirectories)
const getAllFiles = async (
  dirPath: string,
  fileList: string[] = [],
  basePath: string = dirPath
): Promise<string[]> => {
  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      fileList = await getAllFiles(filePath, fileList, basePath);
    } else {
      // Store relative path
      fileList.push(path.relative(basePath, filePath));
    }
  }

  return fileList;
};

// Compression tool - Compress local files
addTool({
  name: "compress",
  description: "Compress local files or directories into a ZIP file",
  parameters: z.object({
    input: z.union([
      z.string(), // Single file or directory path
      z.array(z.string()), // Multiple file or directory paths
    ]),
    output: z.string(), // Output ZIP file path
    options: z
      .object({
        level: z.number().min(0).max(9).optional(),
        comment: z.string().optional(),
        password: z.string().optional(),
        encryptionStrength: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional(),
        overwrite: z.boolean().optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const outputPath = args.output;
      // Separate CompressionOptions and other options
      const { overwrite, ...compressionOptions } = args.options || {};
      const shouldOverwrite = overwrite ?? false;

      // Check if output path already exists
      if ((await exists(outputPath)) && !shouldOverwrite) {
        throw new Error(
          `Output file ${outputPath} already exists. Set overwrite: true to overwrite.`
        );
      }

      // Create output directory (if it doesn't exist)
      const outputDir = path.dirname(outputPath);
      if (!(await exists(outputDir))) {
        await fs.mkdir(outputDir, { recursive: true });
      }

      // Prepare input files
      const inputPaths = Array.isArray(args.input) ? args.input : [args.input];
      const filesToCompress: { name: string; data: Uint8Array }[] = [];

      // Process each input path
      for (const inputPath of inputPaths) {
        if (!(await exists(inputPath))) {
          throw new Error(`Input path not found: ${inputPath}`);
        }

        const stats = await fs.stat(inputPath);

        if (stats.isDirectory()) {
          // Process directory
          const baseDir = path.basename(inputPath);
          const files = await getAllFiles(inputPath);

          for (const relPath of files) {
            const fullPath = path.join(inputPath, relPath);
            const data = await fs.readFile(fullPath);
            // Maintain relative path structure
            filesToCompress.push({
              name: path.join(baseDir, relPath),
              data: new Uint8Array(data),
            });
          }
        } else {
          // Process single file
          const data = await fs.readFile(inputPath);
          filesToCompress.push({
            name: path.basename(inputPath),
            data: new Uint8Array(data),
          });
        }
      }

      if (compressionOptions?.level && compressionOptions.level > 9) {
        compressionOptions.level = 9;
      }
      if (compressionOptions?.level && compressionOptions.level < 0) {
        compressionOptions.level = 0;
      }

      // Execute compression
      const result = await compressData(filesToCompress, compressionOptions);

      // Write result to file
      await fs.writeFile(outputPath, result);

      return {
        content: [
          {
            type: "text",
            text: `Compression completed. Created ${outputPath} file containing ${filesToCompress.length} files.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Compression failed: ${formatError(error)}` },
        ],
      };
    }
  },
});

// Decompression tool - Decompress local ZIP file
addTool({
  name: "decompress",
  description: "Decompress local ZIP file to specified directory",
  parameters: z.object({
    input: z.string(), // ZIP file path
    output: z.string(), // Output directory path
    options: z
      .object({
        password: z.string().optional(),
        overwrite: z.boolean().optional(),
        createDirectories: z.boolean().optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const inputPath = args.input;
      const outputPath = args.output;
      const options: DecompressionOptions & {
        overwrite?: boolean;
        createDirectories?: boolean;
      } = args.options || {};
      const overwrite = options.overwrite ?? false;
      const createDirectories = options.createDirectories ?? true;

      // Check if input file exists
      if (!(await exists(inputPath))) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      // Check output directory
      if (await exists(outputPath)) {
        const stats = await fs.stat(outputPath);
        if (!stats.isDirectory()) {
          throw new Error(`Output path is not a directory: ${outputPath}`);
        }
      } else {
        if (createDirectories) {
          await fs.mkdir(outputPath, { recursive: true });
        } else {
          throw new Error(`Output directory does not exist: ${outputPath}`);
        }
      }

      // Read ZIP file
      const zipData = await fs.readFile(inputPath);

      // Decompress file
      const resultFiles = await decompressData(new Uint8Array(zipData), options);

      // Extract files to output directory
      const extractedFiles: string[] = [];
      for (const file of resultFiles) {
        const outputFilePath = path.join(outputPath, file.name);
        const outputFileDir = path.dirname(outputFilePath);

        // Create directory (if needed)
        if (!(await exists(outputFileDir))) {
          await fs.mkdir(outputFileDir, { recursive: true });
        }

        // Check if file already exists
        if ((await exists(outputFilePath)) && !overwrite) {
          console.warn(`Skipping existing file: ${outputFilePath}`);
          continue;
        }

        // Write file
        await fs.writeFile(outputFilePath, file.data);
        extractedFiles.push(file.name);
      }

      return {
        content: [
          {
            type: "text",
            text: `Decompression completed. Extracted ${extractedFiles.length} files to ${outputPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Decompression failed: ${formatError(error)}` },
        ],
      };
    }
  },
});

// Get ZIP info tool - Get local ZIP file information
addTool({
  name: "getZipInfo",
  description: "Get metadata information of a local ZIP file",
  parameters: z.object({
    input: z.string(), // ZIP file path
    options: z
      .object({
        password: z.string().optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const inputPath = args.input;
      const options: DecompressionOptions = args.options || {};

      // Check if input file exists
      if (!(await exists(inputPath))) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      // Read ZIP file
      const zipData = await fs.readFile(inputPath);

      // Get ZIP information
      const metadata = await getZipInfo(new Uint8Array(zipData), options);

      const compressionRatio =
        metadata.totalSize > 0
          ? ((1 - metadata.totalCompressedSize / metadata.totalSize) * 100).toFixed(2) + "%"
          : "0%";

      // File size formatting
      const formatSize = (size: number): string => {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        if (size < 1024 * 1024 * 1024)
          return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      };

      // Build file information text
      const filesInfo = metadata.files
        .map((file: ZipInfo) =>
          `- ${file.filename}: Original size=${formatSize(file.size)}, Compressed=${formatSize(
            file.compressedSize
          )}, Modified date=${new Date(file.lastModDate).toLocaleString()}, Encrypted=${
            file.encrypted ? "Yes" : "No"
          }`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `ZIP file "${path.basename(inputPath)}" information overview:`,
          },
          { type: "text", text: `Total files: ${metadata.files.length}` },
          { type: "text", text: `Total size: ${formatSize(metadata.totalSize)}` },
          {
            type: "text",
            text: `Compressed size: ${formatSize(metadata.totalCompressedSize)}`,
          },
          { type: "text", text: `Compression ratio: ${compressionRatio}` },
          {
            type: "text",
            text: metadata.comment ? `Comment: ${metadata.comment}` : "",
          },
          { type: "text", text: `\nFile details:\n${filesInfo}` },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get ZIP information: ${formatError(error)}`,
          },
        ],
      };
    }
  },
});

// Test tool - Simple echo function to test if the service is running properly
addTool({
  name: "echo",
  description: "Return the input message (for testing)",
  parameters: z.object({
    message: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        { type: "text", text: args.message },
        { type: "text", text: new Date().toISOString() },
      ],
    };
  },
});

// Compress bytes tool - compress files provided as base64 strings
addTool({
  name: "compressBytes",
  description:
    "Compress base64 input files and return ZIP archive as a base64 string",
  parameters: z.object({
    files: z.array(
      z.object({
        name: z.string(),
        dataBase64: z.string(),
      })
    ),
    options: z
      .object({
        level: z.number().min(0).max(9).optional(),
        comment: z.string().optional(),
        password: z.string().optional(),
        encryptionStrength: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const inputFiles = args.files.map((item: any) => {
        const buffer = Buffer.from(item.dataBase64, "base64");
        return {
          name: item.name,
          data: new Uint8Array(buffer),
        };
      });
      const compressionOptions = args.options || {};
      const resultZip = await compressData(inputFiles, compressionOptions);
      const base64 = Buffer.from(resultZip).toString("base64");
      return {
        content: [
          {
            type: "text",
            text: base64,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Compression failed: ${formatError(error)}` },
        ],
      };
    }
  },
});

// Decompress bytes tool - decompress a ZIP archive provided as a base64 string
addTool({
  name: "decompressBytes",
  description:
    "Decompress a base64 ZIP archive and return files with names and base64 data",
  parameters: z.object({
    zipDataBase64: z.string(),
    options: z
      .object({
        password: z.string().optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const buffer = Buffer.from(args.zipDataBase64, "base64");
      const files = await decompressData(
        new Uint8Array(buffer),
        args.options || {}
      );
      const outputFiles = files.map((f) => ({
        name: f.name,
        dataBase64: Buffer.from(f.data).toString("base64"),
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(outputFiles),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Decompression failed: ${formatError(error)}` },
        ],
      };
    }
  },
});

// Get ZIP info from base64 tool - returns metadata for a base64 ZIP archive
addTool({
  name: "getZipInfoBytes",
  description:
    "Get metadata information of a ZIP archive provided as a base64 string",
  parameters: z.object({
    zipDataBase64: z.string(),
    options: z
      .object({
        password: z.string().optional(),
      })
      .optional(),
  }),
  execute: async (args) => {
    try {
      const buffer = Buffer.from(args.zipDataBase64, "base64");
      const metadata = await getZipInfo(
        new Uint8Array(buffer),
        args.options || {}
      );
      const compressionRatio =
        metadata.totalSize > 0
          ? ((1 - metadata.totalCompressedSize / metadata.totalSize) * 100).toFixed(2) + "%"
          : "0%";
      const resultInfo = {
        totalFiles: metadata.files.length,
        totalSize: metadata.totalSize,
        totalCompressedSize: metadata.totalCompressedSize,
        compressionRatio,
        comment: metadata.comment,
        files: metadata.files.map((file: ZipInfo) => ({
          filename: file.filename,
          size: file.size,
          compressedSize: file.compressedSize,
          lastModDate: file.lastModDate,
          encrypted: file.encrypted,
          comment: file.comment,
        })),
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultInfo),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get ZIP information: ${formatError(error)}`,
          },
        ],
      };
    }
  },
});

// Start server with stdio transport by default
// Preserve backwards compatibility by always starting the stdio transport. Tools
// like local MCP clients will still be able to connect via stdio without any
// configuration. When running in environments like Hugging Face Spaces, an
// HTTP listener is also started automatically on a configurable port so that
// external clients can discover and invoke tools over the network.
const transportType =
  process.env.MCP_TRANSPORT_TYPE || process.env.TRANSPORT_TYPE || "stdio";
// Always start the stdio transport. This call is inexpensive if nothing
// attaches to stdio, but allows local usage when desired.
server.start({ transportType: "stdio" });

// Determine the HTTP port. Hugging Face Spaces typically injects a PORT
// environment variable. Fall back to the custom MCP_HTTP_PORT/HTTP_PORT or
// default to 3000 when none are provided.  Note that the transportType is
// ignored here; the HTTP server starts unconditionally to make hosted
// deployments simpler and more predictable.
const portEnv =
  process.env.PORT ||
  process.env.MCP_HTTP_PORT ||
  process.env.HTTP_PORT ||
  "3000";
const port = parseInt(portEnv, 10);

// Always start an HTTP server for remote invocation. This exposes the
// /health, /tools and /invoke endpoints regardless of the transport type and
// allows tools to be consumed via network requests (e.g. by Hugging Face Chat
// MCP support). If the port is already in use the server will throw when
// binding to the port.
startHttpServer(port);

console.log(
  `ZIP MCP Server started (stdio transport and HTTP listener on port ${port})`
);