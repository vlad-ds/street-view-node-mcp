# Street View Explorer MCP

A Model Context Protocol (MCP) server for Google Street View API that enables AI models to fetch and display street view imagery and create virtual tours, packaged as a Desktop Extension (DXT).

## Features

- **Street View Image Fetching**: Get street view images by address, coordinates, or panorama ID
- **Metadata Retrieval**: Fetch detailed information about street view locations
- **Virtual Tour Creation**: Generate HTML pages with multiple street view images
- **Image Management**: List and manage saved street view images
- **DXT Packaging**: Ready for use as a Desktop Extension with user configuration

## Installation

### Prerequisites

- Node.js 16.0.0 or higher
- Google Maps API key with Street View Static API enabled

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vlad-ds/street-view-node-mcp.git
   cd street-view-node-mcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Get a Google Maps API Key** (see [detailed instructions](#google-maps-api-key-setup) below)

## Usage

### As a Desktop Extension (DXT)

This package is designed to work as a Desktop Extension. When installed, users can configure their Google Maps API key through the extension interface.

### Manual Testing

You can test the server manually by setting the environment variable:

```bash
export GOOGLE_API_KEY=your_api_key_here
npm start
```

## MCP Tools

### `get_street_view`

Fetches a Street View image and saves it to the output directory.

**Parameters:**
- `filename` (required): Name for saving the image
- `location` (optional): Address to get image for (e.g., "Empire State Building, NY")
- `lat_lng` (optional): Coordinates as "lat,lng" (e.g., "40.748817,-73.985428")
- `pano_id` (optional): Specific panorama ID
- `size` (optional): Image dimensions as "widthxheight" (default: "600x400")
- `heading` (optional): Camera heading in degrees (0-360, default: 0)
- `pitch` (optional): Camera pitch in degrees (-90 to 90, default: 0)
- `fov` (optional): Field of view in degrees (10-120, default: 90)
- `radius` (optional): Search radius in meters (default: 50)
- `source` (optional): Image source ("default" or "outdoor", default: "default")

**Note**: Exactly one of `location`, `lat_lng`, or `pano_id` must be provided.

### `get_metadata`

Fetches metadata about a Street View panorama.

**Parameters:**
- Same location parameters as `get_street_view`
- Returns JSON metadata with status, copyright, date, panorama ID, and coordinates

### `create_html_page`

Creates an HTML page displaying multiple Street View images as a virtual tour.

**Parameters:**
- `filename` (required): Name for the HTML file
- `title` (optional): Page title (default: "Street View Tour")
- `html_elements` (required): Array of HTML content elements

**Important**: When referencing images in HTML elements, use the path `../output/filename.jpg`.

### `list_saved_images`

Lists all saved Street View images in the output directory with metadata.

**Parameters:** None

**Returns:** List of images with filename, size, dimensions, format, and timestamps.

## Example Usage

```javascript
// Fetch a street view image
{
  "tool": "get_street_view",
  "arguments": {
    "filename": "empire_state.jpg",
    "location": "Empire State Building, NY",
    "size": "800x600",
    "heading": 90
  }
}

// Get metadata about a location
{
  "tool": "get_metadata",
  "arguments": {
    "lat_lng": "40.748817,-73.985428"
  }
}

// Create a virtual tour
{
  "tool": "create_html_page",
  "arguments": {
    "filename": "nyc_tour.html",
    "title": "New York City Tour",
    "html_elements": [
      "<h1>New York City Landmarks</h1>",
      "<h2>Empire State Building</h2>",
      "<img src='../output/empire_state.jpg' alt='Empire State Building'>",
      "<p class='description'>Iconic Art Deco skyscraper in Midtown Manhattan.</p>"
    ]
  }
}
```

## File Structure

```
street-view-node-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── server/               # Built server files (created by npm run build)
├── output/              # Saved street view images
├── html/                # Generated HTML tour pages
├── manifest.json        # DXT manifest
├── package.json         # Node.js package configuration
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## Development

### Scripts

- `npm run build`: Compile TypeScript and prepare server files
- `npm run dev`: Build and run in development mode
- `npm start`: Start the built server
- `npm run clean`: Clean build artifacts
- `npm run build:dxt`: Build and create DXT package
- `npm run bundle`: Create npm package in dist/

### Building for Distribution

```bash
npm run build:dxt
```

This creates a packaged version ready for distribution as a Desktop Extension.

## API Key Security

- API keys are configured through the DXT user interface and passed as environment variables
- Never commit API keys to version control
- The manifest.json marks the API key field as sensitive
- Consider restricting your Google Maps API key to specific APIs and domains/IPs for additional security

## Google Maps API Key Setup

The Street View Explorer requires a Google Maps API key with Street View Static API enabled. Follow these detailed steps:

### Step 1: Access Google Cloud Console

1. Visit the [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account

### Step 2: Create or Select a Project

1. **Create a new project**:
   - Click the project dropdown at the top of the page
   - Click "New Project"
   - Enter a project name (e.g., "Street View MCP")
   - Click "Create"

2. **Or select an existing project**:
   - Click the project dropdown
   - Select your desired project from the list

### Step 3: Enable the Street View Static API

1. In the Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Street View Static API"
3. Click on "Street View Static API" from the results
4. Click the "Enable" button
5. Wait for the API to be enabled (this may take a few moments)

### Step 4: Create an API Key

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API key"
3. Your new API key will be displayed - **copy it immediately**
4. Click "Close" in the dialog

### Step 5: Restrict the API Key (Recommended for Security)

1. In the Credentials page, find your newly created API key
2. Click the pencil icon (Edit) next to your API key
3. Under "API restrictions":
   - Select "Restrict key"
   - Check "Street View Static API"
   - Uncheck any other APIs you don't need
4. Under "Application restrictions" (optional but recommended):
   - For testing: Select "None"
   - For production: Choose "HTTP referrers" or "IP addresses" as appropriate
5. Click "Save"

### Step 6: Configure in DXT

When installing the Street View Explorer as a Desktop Extension:

1. The extension will prompt you for your Google Maps API Key
2. Paste the API key you copied in Step 4
3. The key is stored securely and passed to the MCP server as an environment variable

### API Usage and Billing

- **Free Tier**: Google provides $200 in free credits monthly
- **Street View Static API**: $7.00 per 1,000 requests after free tier
- **Monitor usage**: Check your usage in Google Cloud Console > "APIs & Services" > "Dashboard"

### Troubleshooting

**API Key Issues:**
- Ensure the Street View Static API is enabled for your project
- Check that your API key is correctly restricted to Street View Static API
- Verify there are no quota exceeded errors in the Google Cloud Console

**Common Error Messages:**
- `"REQUEST_DENIED"`: API key invalid or API not enabled
- `"OVER_QUERY_LIMIT"`: You've exceeded your quota
- `"INVALID_REQUEST"`: Check your request parameters

For more detailed information, visit the [Google Maps Platform documentation](https://developers.google.com/maps/documentation/streetview/overview).

## License

MIT

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/vlad-ds/street-view-node-mcp/issues).