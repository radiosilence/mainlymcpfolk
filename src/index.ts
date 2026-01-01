#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as cheerio from "cheerio";
import { z } from "zod";

const BASE_URL = "https://www.mainlynorfolk.info";

// In-memory cache - be nice to the site
const cache = new Map<string, { data: string; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function fetchPage(url: string): Promise<cheerio.CheerioAPI> {
	const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
	const cached = cache.get(fullUrl);
	if (cached && cached.expires > Date.now()) {
		return cheerio.load(cached.data);
	}

	const res = await fetch(fullUrl);
	if (!res.ok) throw new Error(`Failed to fetch ${fullUrl}: ${res.status}`);
	const html = await res.text();
	cache.set(fullUrl, { data: html, expires: Date.now() + CACHE_TTL });
	return cheerio.load(html);
}

// Normalize relative paths from the site
function normalizePath(href: string, basePath: string): string {
	if (href.startsWith("http")) return href;
	if (href.startsWith("/")) return href;
	if (href.startsWith("../")) {
		const baseDir = basePath.split("/").slice(0, -1).join("/");
		return normalizePath(
			href.slice(3),
			baseDir.split("/").slice(0, -1).join("/") || "/",
		);
	}
	const baseDir = basePath.endsWith("/")
		? basePath
		: basePath.split("/").slice(0, -1).join("/");
	return `${baseDir}/${href}`;
}

// Create the MCP server
const server = new McpServer({
	name: "mainlynorfolk",
	version: "1.0.0",
});

// Tool: Search for anything on the site
server.tool(
	"search_folk",
	`Search Mainly Norfolk for folk music info. Use this to find:
- Artists (Martin Carthy, Shirley Collins, Steeleye Span, etc.)
- Songs by title (Reynardine, Tam Lin, Barbara Allen, etc.)
- Child Ballad numbers (Child 84, Child 39, etc.)
- Albums and recordings
Returns matching results with paths you can use with other tools.`,
	{
		query: z
			.string()
			.describe(
				"What to search for - artist name, song title, ballad number, etc.",
			),
	},
	async ({ query }) => {
		// Search the main index
		const $ = await fetchPage("/folk/");
		const results: Array<{ text: string; path: string; type: string }> = [];
		const q = query.toLowerCase();

		// Search all links on main page
		$("a").each((_, el) => {
			const href = $(el).attr("href");
			const text = $(el).text().trim();
			if (href && text && text.toLowerCase().includes(q)) {
				let type = "page";
				if (href.includes("records/")) type = "artist/album";
				if (href.startsWith("../")) type = "artist";
				results.push({ text, path: normalizePath(href, "/folk/"), type });
			}
		});

		// Also search Child Ballads
		const child$ = await fetchPage("/folk/songs/childindex.html");
		child$("a").each((_, el) => {
			const href = child$(el).attr("href");
			const text = child$(el).text().trim();
			if (href && text && text.toLowerCase().includes(q)) {
				results.push({
					text,
					path: normalizePath(href, "/folk/songs/"),
					type: "Child Ballad",
				});
			}
		});

		// And Laws Index
		const laws$ = await fetchPage("/folk/songs/lawsindex.html");
		laws$("a").each((_, el) => {
			const href = laws$(el).attr("href");
			const text = laws$(el).text().trim();
			if (href && text && text.toLowerCase().includes(q)) {
				results.push({
					text,
					path: normalizePath(href, "/folk/songs/"),
					type: "Laws Index",
				});
			}
		});

		const unique = [...new Map(results.map((r) => [r.path, r])).values()].slice(
			0,
			25,
		);

		if (unique.length === 0) {
			return {
				content: [
					{
						type: "text" as const,
						text: `No results for "${query}". Try a different spelling or broader term.`,
					},
				],
			};
		}

		const text = unique
			.map((r) => `[${r.type}] **${r.text}**\n  → ${r.path}`)
			.join("\n\n");
		return { content: [{ type: "text" as const, text }] };
	},
);

// Tool: Get full page content
server.tool(
	"get_page",
	`Fetch and read a page from Mainly Norfolk. Use paths from search results.
Good for reading about:
- Artist biographies and discographies
- Song histories, lyrics, and recorded versions
- Album details and track listings`,
	{
		path: z
			.string()
			.describe(
				"Path to fetch, e.g. /martin.carthy/ or /folk/records/topic.html",
			),
	},
	async ({ path }) => {
		const $ = await fetchPage(path);

		// Get title
		const title = $("title").text().trim() || $("h1").first().text().trim();

		// Get main content - try to find the meat
		let content = "";

		// Get all paragraphs and lists
		$("p, li, h2, h3").each((_, el) => {
			const text = $(el).text().trim();
			if (text.length > 20) {
				const tag = el.type === "tag" ? el.tagName : "";
				if (tag === "h2" || tag === "h3") {
					content += `\n\n## ${text}\n`;
				} else {
					content += `${text}\n\n`;
				}
			}
		});

		// Get any song lyrics (often in pre tags)
		$("pre").each((_, el) => {
			const text = $(el).text().trim();
			if (text) {
				content += `\n\`\`\`\n${text}\n\`\`\`\n`;
			}
		});

		// Find linked recordings/versions
		const recordings: string[] = [];
		$("a").each((_, el) => {
			const href = $(el).attr("href");
			const text = $(el).text().trim();
			if (href?.includes("records/") && text) {
				recordings.push(`- ${text}`);
			}
		});

		let result = `# ${title}\n\n${content.slice(0, 6000)}`;
		if (recordings.length > 0) {
			result += `\n\n## Recordings\n${[...new Set(recordings)].slice(0, 30).join("\n")}`;
		}

		return { content: [{ type: "text" as const, text: result }] };
	},
);

// Tool: Browse Child Ballads
server.tool(
	"child_ballads",
	`List the Child Ballads - the canonical collection of 305 traditional English and Scottish ballads
compiled by Francis James Child. Essential reference for traditional folk.`,
	{
		filter: z
			.string()
			.optional()
			.describe("Optional: filter by number range like '1-50' or text search"),
	},
	async ({ filter }) => {
		const $ = await fetchPage("/folk/songs/childindex.html");
		const ballads: Array<{ num: string; title: string; path: string }> = [];

		// Format: [Song Title](link) (Roud X; Child Y)
		$("li").each((_, li) => {
			const $li = $(li);
			const $a = $li.find("a").first();
			const href = $a.attr("href");
			const title = $a.text().trim();
			const fullText = $li.text();

			// Extract Child number from parenthetical refs
			const childMatch = fullText.match(/Child\s+(\d+[A-Z]?)/i);
			if (childMatch && href && title) {
				ballads.push({
					num: childMatch[1] ?? "",
					title,
					path: normalizePath(href, "/folk/songs/"),
				});
			}
		});

		let filtered = ballads;
		if (filter) {
			const rangeMatch = filter.match(/^(\d+)-(\d+)$/);
			if (rangeMatch) {
				const start = Number.parseInt(rangeMatch[1] ?? "0", 10);
				const end = Number.parseInt(rangeMatch[2] ?? "999", 10);
				filtered = ballads.filter((b) => {
					const n = Number.parseInt(b.num, 10);
					return n >= start && n <= end;
				});
			} else {
				const q = filter.toLowerCase();
				filtered = ballads.filter(
					(b) => b.title.toLowerCase().includes(q) || b.num.includes(q),
				);
			}
		}

		const text = filtered
			.map((b) => `**Child ${b.num}**: ${b.title}\n  → ${b.path}`)
			.join("\n\n");

		return {
			content: [
				{ type: "text" as const, text: text || "No matching ballads found" },
			],
		};
	},
);

// Tool: Browse Laws Index
server.tool(
	"laws_index",
	`Browse the Laws Index - G. Malcolm Laws' classification of American ballads of British origin.
Covers ballads that crossed the Atlantic and evolved in American tradition.`,
	{
		filter: z
			.string()
			.optional()
			.describe("Optional: filter by code prefix like 'K' or text search"),
	},
	async ({ filter }) => {
		const $ = await fetchPage("/folk/songs/lawsindex.html");
		const songs: Array<{ code: string; title: string; path: string }> = [];

		// Format: [Song Title](link) (Roud X; Laws A1)
		$("li").each((_, li) => {
			const $li = $(li);
			const $a = $li.find("a").first();
			const href = $a.attr("href");
			const title = $a.text().trim();
			const fullText = $li.text();

			// Extract Laws code from parenthetical refs
			const lawsMatch = fullText.match(/Laws\s+([A-Z]\d+)/i);
			if (lawsMatch && href && title) {
				songs.push({
					code: lawsMatch[1] ?? "",
					title,
					path: normalizePath(href, "/folk/songs/"),
				});
			}
		});

		let filtered = songs;
		if (filter) {
			const q = filter.toUpperCase();
			filtered = songs.filter(
				(s) =>
					s.code.startsWith(q) ||
					s.title.toLowerCase().includes(filter.toLowerCase()),
			);
		}

		const text = filtered
			.map((s) => `**Laws ${s.code}**: ${s.title}\n  → ${s.path}`)
			.join("\n\n");

		return {
			content: [
				{ type: "text" as const, text: text || "No matching songs found" },
			],
		};
	},
);

// Tool: Get artist discography
server.tool(
	"artist_discography",
	`Get a folk artist's full discography with album details.
Use artist names or paths from search results.`,
	{
		artist: z
			.string()
			.describe(
				"Artist name or path, e.g. 'Martin Carthy' or '/martin.carthy/'",
			),
	},
	async ({ artist }) => {
		// Try to find artist page
		let path = artist;
		if (!artist.startsWith("/")) {
			// Search for the artist
			const $ = await fetchPage("/folk/");
			const q = artist.toLowerCase();
			let found = false;

			$("a").each((_, el) => {
				if (found) return;
				const text = $(el).text().trim().toLowerCase();
				const href = $(el).attr("href");
				if (href && text.includes(q)) {
					path = normalizePath(href, "/folk/");
					found = true;
				}
			});

			if (!found) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Couldn't find artist "${artist}". Try searching first.`,
						},
					],
				};
			}
		}

		const $ = await fetchPage(path);
		const title = $("title").text().trim() || $("h1").first().text().trim();

		// Extract albums
		const albums: Array<{ title: string; year?: string; path: string }> = [];
		$("a").each((_, el) => {
			const href = $(el).attr("href");
			const text = $(el).text().trim();
			if (
				href &&
				text &&
				(href.includes("records/") || href.includes(".html"))
			) {
				const yearMatch = text.match(/\((\d{4})\)/);
				albums.push({
					title: text,
					year: yearMatch?.[1],
					path: normalizePath(href, path),
				});
			}
		});

		// Get bio text
		const bio = $("p")
			.slice(0, 4)
			.map((_, el) => $(el).text().trim())
			.get()
			.filter((t) => t.length > 50)
			.join("\n\n");

		let result = `# ${title}\n\n`;
		if (bio) result += `${bio}\n\n`;
		result += `## Discography (${albums.length} entries)\n\n`;
		result += albums
			.map(
				(a) => `- **${a.title}**${a.year ? ` (${a.year})` : ""}\n  → ${a.path}`,
			)
			.join("\n");

		return { content: [{ type: "text" as const, text: result }] };
	},
);

// Tool: Record labels
server.tool(
	"record_labels",
	`Browse British folk record label discographies.
Topic Records, Fellside, Greentrax, and other essential folk labels.`,
	{},
	async () => {
		const labels = [
			{
				name: "Topic Records (Vinyl)",
				path: "/folk/records/topic.html",
				desc: "The legendary folk label, vinyl era",
			},
			{
				name: "Topic Records (CD)",
				path: "/folk/records/topiccd.html",
				desc: "Topic's CD reissues and new releases",
			},
			{
				name: "Fellside",
				path: "/folk/records/fellside.html",
				desc: "Major folk and acoustic label",
			},
			{
				name: "Fledg'ling",
				path: "/folk/records/fledgling.html",
				desc: "Quality folk reissues",
			},
			{
				name: "Greentrax",
				path: "/folk/records/greentrax.html",
				desc: "Scottish folk and tradition",
			},
			{
				name: "Leader/Trailer",
				path: "/folk/records/leadertrailer.html",
				desc: "Bill Leader's influential labels",
			},
			{
				name: "Free Reed",
				path: "/folk/records/freereed.html",
				desc: "Specialist folk reissues",
			},
			{
				name: "Veteran",
				path: "/folk/records/veteran.html",
				desc: "Field recordings and tradition bearers",
			},
			{
				name: "Wild Goose",
				path: "/folk/records/wildgoose.html",
				desc: "Contemporary folk",
			},
			{
				name: "Musical Traditions",
				path: "/folk/records/musicaltraditions.html",
				desc: "Traditional singers",
			},
			{
				name: "Hudson",
				path: "/folk/records/hudson.html",
				desc: "Folk compilations",
			},
		];

		const text = labels
			.map((l) => `**${l.name}**\n${l.desc}\n→ ${l.path}`)
			.join("\n\n");
		return { content: [{ type: "text" as const, text }] };
	},
);

// Run
const transport = new StdioServerTransport();
await server.connect(transport);
