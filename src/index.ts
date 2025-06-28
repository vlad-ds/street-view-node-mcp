#!/usr/bin/env node

/**
 * Street View Explorer MCP Server (Desktop Extension)
 *
 * A Model Context Protocol server for Google Street View API that enables AI models 
 * to fetch and display street view imagery and create virtual tours.
 * 
 * This server runs as a Desktop Extension (DXT) and requires a Google Maps API key
 * with Street View Static API enabled.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosResponse } from "axios";
import sharp from "sharp";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get API key from environment
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BASE_URL = "https://maps.googleapis.com/maps/api/streetview";
const METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";

// Output directories
const OUTPUT_DIR = join(process.cwd(), "output");
const HTML_DIR = join(process.cwd(), "html");

// Enhanced logging for DXT environment
function log(level: 'info' | 'error' | 'warn', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] StreetView-MCP: ${message}`;
  
  if (data) {
    console.error(`${logMessage} ${JSON.stringify(data)}`);
  } else {
    console.error(logMessage);
  }
}

// Define Zod schemas for tool inputs
const GetStreetViewSchema = z.object({
  filename: z.string().min(1, "Filename cannot be empty"),
  location: z.string().optional(),
  lat_lng: z.string().optional(),
  pano_id: z.string().optional(),
  size: z.string().optional().default("600x400"),
  heading: z.number().int().min(0).max(360).optional().default(0),
  pitch: z.number().int().min(-90).max(90).optional().default(0),
  fov: z.number().int().min(10).max(120).optional().default(90),
  radius: z.number().int().min(1).optional().default(50),
  source: z.enum(["default", "outdoor"]).optional().default("default"),
}).refine((data) => {
  const locationMethods = [data.location, data.lat_lng, data.pano_id].filter(Boolean).length;
  return locationMethods === 1;
}, {
  message: "Exactly one of location, lat_lng, or pano_id must be provided",
});

const GetMetadataSchema = z.object({
  location: z.string().optional(),
  lat_lng: z.string().optional(),
  pano_id: z.string().optional(),
  radius: z.number().int().min(1).optional().default(50),
  source: z.enum(["default", "outdoor"]).optional().default("default"),
}).refine((data) => {
  const locationMethods = [data.location, data.lat_lng, data.pano_id].filter(Boolean).length;
  return locationMethods === 1;
}, {
  message: "Exactly one of location, lat_lng, or pano_id must be provided",
});

const CreateHtmlPageSchema = z.object({
  filename: z.string().min(1, "Filename cannot be empty"),
  title: z.string().optional().default("Street View Tour"),
  html_elements: z.array(z.string()).min(1, "HTML elements cannot be empty"),
});

const ListSavedImagesSchema = z.object({});

// Types for API responses
interface StreetViewMetadata {
  status: string;
  copyright?: string;
  date?: string;
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

// Configuration constants
const REQUEST_TIMEOUT = 30000; // 30 second timeout for API requests

// Create the MCP server
const server = new Server({
  name: "street-view-node-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// Utility function to ensure directories exist
async function ensureDirectoryExists(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Utility function to parse lat_lng string
function parseLatLng(latLng: string): [number, number] {
  try {
    const [lat, lng] = latLng.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error("Invalid coordinates");
    }
    return [lat, lng];
  } catch {
    throw new Error("Invalid lat_lng format. Use format: '40.714728,-73.998672'");
  }
}

// Enhanced API request wrapper with error handling
async function makeApiRequest(url: string, params: Record<string, any>): Promise<Buffer> {
  try {
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY not found in environment variables. Please set your Google Maps API key.");
    }

    log('info', 'Making API request', { url, params });

    const response: AxiosResponse<Buffer> = await axios.get(url, {
      params: {
        ...params,
        key: GOOGLE_API_KEY,
      },
      timeout: REQUEST_TIMEOUT,
      responseType: 'arraybuffer',
    });

    log('info', 'API request successful', { status: response.status });
    return Buffer.from(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        log('error', 'API request failed with response', {
          status: error.response.status,
          statusText: error.response.statusText,
        });
        throw new Error(`API request failed: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        log('error', 'API request failed - no response received', { message: error.message });
        throw new Error(`Network error: ${error.message}`);
      }
    }
    log('error', 'Unexpected error during API request', { error: error instanceof Error ? error.message : error });
    throw new Error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Enhanced metadata API request
async function makeMetadataRequest(url: string, params: Record<string, any>): Promise<StreetViewMetadata> {
  try {
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY not found in environment variables. Please set your Google Maps API key.");
    }

    log('info', 'Making metadata API request', { url, params });

    const response: AxiosResponse<StreetViewMetadata> = await axios.get(url, {
      params: {
        ...params,
        key: GOOGLE_API_KEY,
      },
      timeout: REQUEST_TIMEOUT,
    });

    log('info', 'Metadata API request successful', { status: response.status });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        log('error', 'Metadata API request failed with response', {
          status: error.response.status,
          statusText: error.response.statusText,
        });
        throw new Error(`Metadata API request failed: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        log('error', 'Metadata API request failed - no response received', { message: error.message });
        throw new Error(`Network error: ${error.message}`);
      }
    }
    log('error', 'Unexpected error during metadata API request', { error: error instanceof Error ? error.message : error });
    throw new Error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_street_view",
        description: "Fetch a Street View image based on location, coordinates, or panorama ID and save to file.",
        inputSchema: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Required filename to save the image (must not already exist in output directory)",
            },
            location: {
              type: "string",
              description: "The address to get Street View image for (e.g., 'Empire State Building, NY')",
            },
            lat_lng: {
              type: "string",
              description: "Comma-separated latitude and longitude (e.g., '40.748817,-73.985428')",
            },
            pano_id: {
              type: "string",
              description: "Specific panorama ID to fetch",
            },
            size: {
              type: "string",
              description: "Image dimensions as 'widthxheight' (e.g., '600x400')",
              default: "600x400"
            },
            heading: {
              type: "number",
              description: "Camera heading in degrees (0-360)",
              default: 0
            },
            pitch: {
              type: "number",
              description: "Camera pitch in degrees (-90 to 90)",
              default: 0
            },
            fov: {
              type: "number",
              description: "Field of view in degrees (zoom level, 10-120)",
              default: 90
            },
            radius: {
              type: "number",
              description: "Search radius in meters when using location or coordinates",
              default: 50
            },
            source: {
              type: "string",
              enum: ["default", "outdoor"],
              description: "Limit Street View searches to selected sources",
              default: "default"
            },
          },
          required: ["filename"],
        },
      },
      {
        name: "get_metadata",
        description: "Fetch metadata about a Street View panorama.",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The address to check for Street View imagery",
            },
            lat_lng: {
              type: "string",
              description: "Comma-separated latitude and longitude (e.g., '40.748817,-73.985428')",
            },
            pano_id: {
              type: "string",
              description: "Specific panorama ID to fetch metadata for",
            },
            radius: {
              type: "number",
              description: "Search radius in meters when using location or coordinates",
              default: 50
            },
            source: {
              type: "string",
              enum: ["default", "outdoor"],
              description: "Limit Street View searches to selected sources",
              default: "default"
            },
          },
          required: [],
        },
      },
      {
        name: "create_html_page",
        description: "Create an HTML page that displays multiple Street View images as a virtual tour.",
        inputSchema: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Name of the HTML file to create (without directory path)",
            },
            title: {
              type: "string",
              description: "Title for the HTML page",
              default: "Street View Tour"
            },
            html_elements: {
              type: "array",
              items: { type: "string" },
              description: "List of content HTML elements (just the body content, no need for HTML structure). When including Street View images, use path '../output/filename.jpg'",
            },
          },
          required: ["filename", "html_elements"],
        },
      },
      {
        name: "list_saved_images",
        description: "List all saved Street View images in the output directory.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_street_view": {
        const validatedArgs = GetStreetViewSchema.parse(args);
        const { filename, location, lat_lng, pano_id, size, heading, pitch, fov, radius, source } = validatedArgs;
        
        try {
          // Ensure output directory exists
          await ensureDirectoryExists(OUTPUT_DIR);
          
          // Check if file already exists
          const filePath = join(OUTPUT_DIR, filename);
          try {
            await fs.access(filePath);
            throw new Error(`File ${filename} already exists in output directory`);
          } catch (error) {
            // File doesn't exist, which is what we want
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
          
          // Build request parameters
          const params: Record<string, any> = {
            size,
            heading,
            pitch,
            fov,
            radius,
            source,
            return_error_code: 'true',
          };
          
          // Set location parameter
          if (location) {
            params.location = location;
          } else if (lat_lng) {
            const [lat, lng] = parseLatLng(lat_lng);
            params.location = `${lat},${lng}`;
          } else if (pano_id) {
            params.pano = pano_id;
            delete params.radius; // Not applicable for pano_id
          }
          
          // Fetch the image
          const imageBuffer = await makeApiRequest(BASE_URL, params);
          
          // Process and save the image using Sharp
          await sharp(imageBuffer)
            .jpeg({ quality: 95 })
            .toFile(filePath);
          
          // Get image metadata for response
          const metadata = await sharp(filePath).metadata();
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "success",
                  message: `Street View image saved successfully`,
                  filename,
                  path: filePath,
                  metadata: {
                    width: metadata.width,
                    height: metadata.height,
                    format: metadata.format,
                    size: `${Math.round((await fs.stat(filePath)).size / 1024)}KB`
                  },
                  parameters: {
                    location: location || lat_lng || pano_id,
                    size,
                    heading,
                    pitch,
                    fov,
                    radius: pano_id ? undefined : radius,
                    source
                  }
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Street View image fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      case "get_metadata": {
        const validatedArgs = GetMetadataSchema.parse(args);
        const { location, lat_lng, pano_id, radius, source } = validatedArgs;
        
        try {
          // Build request parameters
          const params: Record<string, any> = {
            radius,
            source,
          };
          
          // Set location parameter
          if (location) {
            params.location = location;
          } else if (lat_lng) {
            const [lat, lng] = parseLatLng(lat_lng);
            params.location = `${lat},${lng}`;
          } else if (pano_id) {
            params.pano = pano_id;
            delete params.radius; // Not applicable for pano_id
          }
          
          // Fetch metadata
          const metadata = await makeMetadataRequest(METADATA_URL, params);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: metadata.status,
                  copyright: metadata.copyright,
                  date: metadata.date,
                  pano_id: metadata.pano_id,
                  location: metadata.location,
                  query: {
                    location: location || lat_lng || pano_id,
                    radius: pano_id ? undefined : radius,
                    source
                  }
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Metadata fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      case "create_html_page": {
        const validatedArgs = CreateHtmlPageSchema.parse(args);
        const { filename, title, html_elements } = validatedArgs;
        
        try {
          // Ensure HTML directory exists
          await ensureDirectoryExists(HTML_DIR);
          
          // Ensure filename has .html extension
          const htmlFilename = filename.endsWith('.html') ? filename : `${filename}.html`;
          const filePath = join(HTML_DIR, htmlFilename);
          
          // Check if file already exists
          try {
            await fs.access(filePath);
            throw new Error(`File ${htmlFilename} already exists`);
          } catch (error) {
            // File doesn't exist, which is what we want
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
          
          // Combine HTML elements
          const content = html_elements.join('\n');
          
          // HTML template
          const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 5px;
            margin: 20px 0;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .location {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .description {
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
${content}
</body>
</html>`;
          
          // Write to file
          await fs.writeFile(filePath, htmlTemplate, 'utf-8');
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "success",
                  message: `HTML page created successfully`,
                  filename: htmlFilename,
                  path: filePath,
                  title,
                  elements_count: html_elements.length
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `HTML page creation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      case "list_saved_images": {
        try {
          // Ensure output directory exists
          await ensureDirectoryExists(OUTPUT_DIR);
          
          // Read directory contents
          const files = await fs.readdir(OUTPUT_DIR);
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
          const imageFiles = files.filter(file => 
            imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
          );
          
          // Get file stats for each image
          const imageInfo = await Promise.all(
            imageFiles.map(async (file) => {
              const filePath = join(OUTPUT_DIR, file);
              const stats = await fs.stat(filePath);
              
              try {
                const metadata = await sharp(filePath).metadata();
                return {
                  filename: file,
                  size: `${Math.round(stats.size / 1024)}KB`,
                  dimensions: `${metadata.width}x${metadata.height}`,
                  format: metadata.format,
                  created: stats.birthtime.toISOString(),
                  modified: stats.mtime.toISOString(),
                };
              } catch {
                // Fallback if Sharp can't read the file
                return {
                  filename: file,
                  size: `${Math.round(stats.size / 1024)}KB`,
                  created: stats.birthtime.toISOString(),
                  modified: stats.mtime.toISOString(),
                };
              }
            })
          );
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  output_directory: OUTPUT_DIR,
                  total_images: imageInfo.length,
                  images: imageInfo.sort((a, b) => b.modified.localeCompare(a.modified)) // Sort by most recent first
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Failed to list saved images: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  try {
    log('info', 'Starting Street View Explorer MCP Server (DXT)', {
      version: '1.0.0',
      hasApiKey: !!GOOGLE_API_KEY,
      nodeVersion: process.version,
      platform: process.platform
    });

    if (!GOOGLE_API_KEY) {
      log('warn', 'GOOGLE_API_KEY not found in environment variables');
      console.error("Warning: GOOGLE_API_KEY not found. Please set your Google Maps API key in environment variables");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    log('info', 'Street View Explorer MCP Server connected successfully');
    console.error("Street View Explorer MCP server running...");
  } catch (error) {
    log('error', 'Failed to start server', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

// Enhanced error handling with graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', { reason });
  process.exit(1);
});

main().catch((error) => {
  log('error', 'Server startup failed', { error: error instanceof Error ? error.message : error });
  process.exit(1);
});