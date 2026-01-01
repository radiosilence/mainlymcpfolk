#!/usr/bin/env bun
/**
 * Test script - spawns the MCP server and tests all tools via client
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const results: Array<{ tool: string; passed: boolean; output: string }> = [];

async function test(name: string, fn: () => Promise<string>) {
	try {
		const output = await fn();
		results.push({ tool: name, passed: true, output });
		console.log(`✓ ${name}`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		results.push({ tool: name, passed: false, output: msg });
		console.log(`✗ ${name}: ${msg}`);
	}
}

async function main() {
	console.log("Starting MCP server...\n");

	const transport = new StdioClientTransport({
		command: "bun",
		args: ["run", "src/index.ts"],
	});

	const client = new Client({ name: "test-client", version: "1.0.0" });
	await client.connect(transport);

	console.log("Connected. Running tests...\n");

	// Test: search_folk
	await test("search_folk (Martin Carthy)", async () => {
		const res = await client.callTool({
			name: "search_folk",
			arguments: { query: "Martin Carthy" },
		});
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.includes("Carthy")) throw new Error("Expected Carthy in results");
		return text.slice(0, 200);
	});

	// Test: search_folk for a song
	await test("search_folk (Reynardine)", async () => {
		const res = await client.callTool({
			name: "search_folk",
			arguments: { query: "Reynardine" },
		});
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.toLowerCase().includes("reynardine"))
			throw new Error("Expected Reynardine");
		return text.slice(0, 200);
	});

	// Test: child_ballads
	await test("child_ballads (no filter)", async () => {
		const res = await client.callTool({ name: "child_ballads", arguments: {} });
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.includes("Child")) throw new Error("Expected Child ballads");
		return `Found ballads, starts with: ${text.slice(0, 150)}`;
	});

	// Test: child_ballads with filter
	await test("child_ballads (filter: tam lin)", async () => {
		const res = await client.callTool({
			name: "child_ballads",
			arguments: { filter: "tam lin" },
		});
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.toLowerCase().includes("tam lin"))
			throw new Error("Expected Tam Lin");
		return text.slice(0, 200);
	});

	// Test: laws_index
	await test("laws_index", async () => {
		const res = await client.callTool({ name: "laws_index", arguments: {} });
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.includes("Laws")) throw new Error("Expected Laws index content");
		return `Laws index retrieved: ${text.slice(0, 150)}`;
	});

	// Test: record_labels
	await test("record_labels", async () => {
		const res = await client.callTool({ name: "record_labels", arguments: {} });
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (!text.includes("Topic")) throw new Error("Expected Topic Records");
		return text.slice(0, 200);
	});

	// Test: artist_discography
	await test("artist_discography (Shirley Collins)", async () => {
		const res = await client.callTool({
			name: "artist_discography",
			arguments: { artist: "Shirley Collins" },
		});
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (
			!text.toLowerCase().includes("shirley") &&
			!text.toLowerCase().includes("collins")
		) {
			throw new Error("Expected Shirley Collins content");
		}
		return text.slice(0, 300);
	});

	// Test: get_page
	await test("get_page (/folk/)", async () => {
		const res = await client.callTool({
			name: "get_page",
			arguments: { path: "/folk/" },
		});
		const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
		if (text.length < 200) throw new Error("Expected page content");
		return `Page retrieved: ${text.slice(0, 200)}`;
	});

	await client.close();

	// Summary
	console.log(`\n${"=".repeat(50)}`);
	const passed = results.filter((r) => r.passed).length;
	console.log(`\nResults: ${passed}/${results.length} tests passed\n`);

	if (passed < results.length) {
		console.log("Failed tests:");
		for (const r of results.filter((r) => !r.passed)) {
			console.log(`  - ${r.tool}: ${r.output}`);
		}
		process.exit(1);
	}

	console.log("All tests passed! The folk oracle is ready.");
}

main().catch((e) => {
	console.error("Test failed:", e);
	process.exit(1);
});
