# mainlymcpfolk

MCP server that gives Claude deep knowledge of British folk music via [Mainly Norfolk](https://www.mainlynorfolk.info/folk/).

Ask about Martin Carthy's discography, find recordings of Child Ballad 84, look up who's covered "Reynardine", get lyrics to "Tam Lin" - the full encyclopaedia of English folk tradition at your fingertips.

## Tools

| Tool                 | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `search_folk`        | Search for artists, songs, albums, ballad numbers      |
| `get_page`           | Read any page - lyrics, history, versions, bios        |
| `child_ballads`      | Browse the 305 Child Ballads with optional filtering   |
| `laws_index`         | Browse Laws Index (American ballads of British origin) |
| `artist_discography` | Get full discography for any artist                    |
| `record_labels`      | Browse folk labels (Topic, Fellside, etc.)             |

## Install

```bash
# mise
mise use -g npm:mainlymcpfolk

# or npm
npm install -g mainlymcpfolk
```

## Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "folk": {
      "command": "bunx",
      "args": ["mainlymcpfolk"]
    }
  }
}
```

Restart Claude Desktop. Tools appear in the 🔧 menu.

## Caching

Results cached 1 hour in memory. Be nice to Mainly Norfolk - it's a labour of love maintained by one person.

## Credit

All data from [Mainly Norfolk](https://www.mainlynorfolk.info/folk/), an encyclopaedic resource for English folk music named after Peter Bellamy's first solo album.
